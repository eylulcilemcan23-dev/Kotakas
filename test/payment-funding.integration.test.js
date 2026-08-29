import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import {
  applyProviderPaymentEvent,
  createDepositIntent,
  createWithdrawalRequest,
  detectPaymentFundingCompatibility,
  listFundingActivity,
  resolveWithdrawalRequest,
  savePayoutAccount,
  signProviderEvent,
  verifyProviderEventSignature,
} from '../src/payment-funding.js';

const dbReady = Boolean(process.env.DATABASE_URL && pool);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function cleanup() {
  await pool.query(`
    drop table if exists wallet_funding_ledger, payment_webhook_events, withdrawal_requests,
      payout_accounts, wallet_payment_intents, wallets cascade
  `);
  await detectPaymentFundingCompatibility({ force: true });
}

async function setup() {
  await cleanup();
  await pool.query(`
    create table wallets (
      user_id bigint primary key,
      available_balance numeric(18,2) not null default 0,
      held_balance numeric(18,2) not null default 0,
      updated_at timestamptz not null default now()
    );
    insert into wallets (user_id,available_balance,held_balance) values
      (10,50,0),(20,1000,0);
  `);
  const migration = await fs.readFile(path.join(__dirname, '..', 'migrations', '012_payment_funding_withdrawals.sql'), 'utf8');
  await pool.query(migration);
  const status = await detectPaymentFundingCompatibility({ force: true });
  assert.equal(status.ready, true, status.blockers.join(','));
}

function enableFlags() {
  const old = {
    financeWritesEnabled: config.financeWritesEnabled,
    paymentWritesEnabled: config.paymentWritesEnabled,
    withdrawalWritesEnabled: config.withdrawalWritesEnabled,
    paymentProvider: config.paymentProvider,
    paymentWebhookSecret: config.paymentWebhookSecret,
    withdrawalMinAmount: config.withdrawalMinAmount,
    withdrawalMaxAmount: config.withdrawalMaxAmount,
    withdrawalFeeRate: config.withdrawalFeeRate,
  };
  config.financeWritesEnabled = true;
  config.paymentWritesEnabled = true;
  config.withdrawalWritesEnabled = true;
  config.paymentProvider = 'sandbox';
  config.paymentWebhookSecret = 'ci-payment-webhook-secret-123456789';
  config.withdrawalMinAmount = 100;
  config.withdrawalMaxAmount = 100000;
  config.withdrawalFeeRate = 0;
  return () => Object.assign(config, old);
}

test('provider payment event credits wallet exactly once and HMAC signature is deterministic', { skip: !dbReady }, async () => {
  await setup();
  const restore = enableFlags();
  try {
    const intent = await createDepositIntent({ userId: 10, amount: 125, idempotencyKey: 'deposit:test:1' });
    const duplicateIntent = await createDepositIntent({ userId: 10, amount: 125, idempotencyKey: 'deposit:test:1' });
    assert.equal(duplicateIntent.id, intent.id);

    const event = {
      eventId: 'evt-1001',
      merchantReference: intent.merchantReference,
      providerPaymentId: 'pay-5001',
      status: 'paid',
      amount: 125,
      currency: 'TRY',
    };
    const signature = signProviderEvent(event);
    assert.equal(verifyProviderEventSignature(event, signature), true);
    assert.equal(verifyProviderEventSignature({ ...event, amount: 126 }, signature), false);

    const first = await applyProviderPaymentEvent(event);
    const second = await applyProviderPaymentEvent(event);
    assert.equal(first.credited, true);
    assert.equal(second.credited, false);
    assert.equal(second.duplicate, true);

    const wallet = await pool.query('select available_balance,held_balance from wallets where user_id=10');
    assert.equal(Number(wallet.rows[0].available_balance), 175);
    assert.equal(Number(wallet.rows[0].held_balance), 0);
    const ledger = await pool.query("select count(*)::int as count from wallet_funding_ledger where kind='deposit_credit'");
    assert.equal(ledger.rows[0].count, 1);
  } finally {
    restore();
    await cleanup();
  }
});

test('withdrawal holds balance once, cancellation refunds it and paid resolution consumes only held money', { skip: !dbReady }, async () => {
  await setup();
  const restore = enableFlags();
  try {
    const payout = await savePayoutAccount({
      userId: 20,
      provider: 'sandbox',
      providerToken: 'payout-token-secret-value',
      displayLabel: 'Banka •••• 1234',
    });
    assert.equal(Object.prototype.hasOwnProperty.call(payout, 'providerToken'), false);

    const request = await createWithdrawalRequest({
      userId: 20,
      payoutAccountId: payout.id,
      amount: 250,
      idempotencyKey: 'withdrawal:test:1',
    });
    const duplicate = await createWithdrawalRequest({
      userId: 20,
      payoutAccountId: payout.id,
      amount: 250,
      idempotencyKey: 'withdrawal:test:1',
    });
    assert.equal(duplicate.id, request.id);
    let wallet = await pool.query('select available_balance,held_balance from wallets where user_id=20');
    assert.equal(Number(wallet.rows[0].available_balance), 750);
    assert.equal(Number(wallet.rows[0].held_balance), 250);

    const cancelled = await resolveWithdrawalRequest({ withdrawalId: request.id, outcome: 'cancelled', resolutionNote: 'Banka hesabı doğrulanamadı' });
    assert.equal(cancelled.status, 'cancelled');
    wallet = await pool.query('select available_balance,held_balance from wallets where user_id=20');
    assert.equal(Number(wallet.rows[0].available_balance), 1000);
    assert.equal(Number(wallet.rows[0].held_balance), 0);

    const paidRequest = await createWithdrawalRequest({
      userId: 20,
      payoutAccountId: payout.id,
      amount: 300,
      idempotencyKey: 'withdrawal:test:2',
    });
    const paid = await resolveWithdrawalRequest({ withdrawalId: paidRequest.id, outcome: 'paid', providerPayoutId: 'bank-transfer-9001' });
    const paidAgain = await resolveWithdrawalRequest({ withdrawalId: paidRequest.id, outcome: 'paid', providerPayoutId: 'bank-transfer-9001' });
    assert.equal(paid.status, 'paid');
    assert.equal(paidAgain.status, 'paid');
    wallet = await pool.query('select available_balance,held_balance from wallets where user_id=20');
    assert.equal(Number(wallet.rows[0].available_balance), 700);
    assert.equal(Number(wallet.rows[0].held_balance), 0);

    const activity = await listFundingActivity(20, { limit: 20 });
    assert.deepEqual(activity.map((row) => row.kind), ['withdrawal_paid', 'withdrawal_hold', 'withdrawal_refund', 'withdrawal_hold']);
  } finally {
    restore();
    await cleanup();
  }
});
