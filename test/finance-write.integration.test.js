import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { pool } from '../src/db.js';
import {
  detectFinanceWriteCompatibility,
  holdEscrow,
  refundEscrow,
  releaseEscrow,
} from '../src/finance-write-adapter.js';

const dbReady = Boolean(process.env.DATABASE_URL && pool);

async function resetFinanceSchema() {
  await pool.query('drop table if exists commissions, wallet_transactions, orders, wallets cascade');
  await pool.query(`
    create table wallets (
      user_id bigint primary key,
      available_balance numeric(18,2) not null default 0 check (available_balance >= 0),
      held_balance numeric(18,2) not null default 0 check (held_balance >= 0),
      updated_at timestamptz not null default now()
    );
    create table orders (
      id bigserial primary key,
      buyer_id bigint not null,
      seller_id bigint not null,
      amount numeric(18,2) not null check (amount > 0),
      commission_rate numeric(8,6) not null check (commission_rate >= 0 and commission_rate <= 1),
      commission_amount numeric(18,2) not null check (commission_amount >= 0),
      seller_net numeric(18,2) not null check (seller_net >= 0),
      escrow_state text not null check (escrow_state in ('held','released','refunded')),
      idempotency_key text not null unique,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table wallet_transactions (
      id bigserial primary key,
      order_id bigint not null references orders(id),
      user_id bigint not null,
      kind text not null,
      available_delta numeric(18,2) not null default 0,
      held_delta numeric(18,2) not null default 0,
      created_at timestamptz not null default now()
    );
    create table commissions (
      id bigserial primary key,
      order_id bigint not null unique references orders(id),
      amount numeric(18,2) not null check (amount >= 0),
      rate numeric(8,6) not null check (rate >= 0 and rate <= 1),
      created_at timestamptz not null default now()
    );
  `);
  await pool.query(`
    insert into wallets (user_id, available_balance, held_balance)
    values (101, 1000, 0), (202, 10, 0)
  `);
  await detectFinanceWriteCompatibility({ force: true });
}

async function wallet(userId) {
  const result = await pool.query(
    'select available_balance::text as available, held_balance::text as held from wallets where user_id = $1',
    [userId],
  );
  return result.rows[0];
}

test('finance write adapter holds and releases money exactly once', { skip: !dbReady }, async () => {
  await resetFinanceSchema();
  const old = config.financeWritesEnabled;
  config.financeWritesEnabled = true;
  try {
    const compatibility = await detectFinanceWriteCompatibility({ force: true });
    assert.equal(compatibility.ready, true);
    assert.deepEqual(compatibility.blockers, []);

    const held = await holdEscrow({
      buyerId: 101,
      sellerId: 202,
      amount: 400,
      commissionRate: 0.05,
      idempotencyKey: 'release-case-1',
    });
    assert.equal(held.escrowState, 'held');
    assert.equal(held.commissionAmount, 20);
    assert.equal(held.sellerNet, 380);
    assert.deepEqual(await wallet(101), { available: '600.00', held: '400.00' });

    const heldAgain = await holdEscrow({
      buyerId: 101,
      sellerId: 202,
      amount: 400,
      commissionRate: 0.05,
      idempotencyKey: 'release-case-1',
    });
    assert.equal(heldAgain.id, held.id);
    assert.deepEqual(await wallet(101), { available: '600.00', held: '400.00' });

    const released = await releaseEscrow(held.id);
    assert.equal(released.escrowState, 'released');
    assert.deepEqual(await wallet(101), { available: '600.00', held: '0.00' });
    assert.deepEqual(await wallet(202), { available: '390.00', held: '0.00' });

    await releaseEscrow(held.id);
    assert.deepEqual(await wallet(202), { available: '390.00', held: '0.00' });

    const commission = await pool.query('select count(*)::int as count, sum(amount)::text as amount from commissions where order_id = $1', [held.id]);
    assert.equal(commission.rows[0].count, 1);
    assert.equal(commission.rows[0].amount, '20.00');

    const ledger = await pool.query('select kind, available_delta::text as available_delta, held_delta::text as held_delta from wallet_transactions where order_id = $1 order by id', [held.id]);
    assert.deepEqual(ledger.rows, [
      { kind: 'escrow_hold', available_delta: '-400.00', held_delta: '400.00' },
      { kind: 'escrow_release', available_delta: '0.00', held_delta: '-400.00' },
      { kind: 'sale_credit', available_delta: '380.00', held_delta: '0.00' },
    ]);
  } finally {
    config.financeWritesEnabled = old;
    await pool.query('drop table if exists commissions, wallet_transactions, orders, wallets cascade');
  }
});

test('refund returns the full held amount and never creates commission', { skip: !dbReady }, async () => {
  await resetFinanceSchema();
  const old = config.financeWritesEnabled;
  config.financeWritesEnabled = true;
  try {
    const held = await holdEscrow({
      buyerId: 101,
      sellerId: 202,
      amount: 125.50,
      commissionRate: 0.07,
      idempotencyKey: 'refund-case-1',
    });
    assert.deepEqual(await wallet(101), { available: '874.50', held: '125.50' });

    const refunded = await refundEscrow(held.id);
    assert.equal(refunded.escrowState, 'refunded');
    assert.deepEqual(await wallet(101), { available: '1000.00', held: '0.00' });
    assert.deepEqual(await wallet(202), { available: '10.00', held: '0.00' });

    await refundEscrow(held.id);
    assert.deepEqual(await wallet(101), { available: '1000.00', held: '0.00' });

    const commission = await pool.query('select count(*)::int as count from commissions where order_id = $1', [held.id]);
    assert.equal(commission.rows[0].count, 0);
  } finally {
    config.financeWritesEnabled = old;
    await pool.query('drop table if exists commissions, wallet_transactions, orders, wallets cascade');
  }
});

test('same idempotency key cannot double debit under concurrency', { skip: !dbReady }, async () => {
  await resetFinanceSchema();
  const old = config.financeWritesEnabled;
  config.financeWritesEnabled = true;
  try {
    const input = { buyerId: 101, sellerId: 202, amount: 250, commissionRate: 0.04, idempotencyKey: 'concurrent-key-1' };
    const [first, second] = await Promise.all([holdEscrow(input), holdEscrow(input)]);
    assert.equal(first.id, second.id);
    assert.deepEqual(await wallet(101), { available: '750.00', held: '250.00' });
    const orders = await pool.query('select count(*)::int as count from orders where idempotency_key = $1', [input.idempotencyKey]);
    assert.equal(orders.rows[0].count, 1);
  } finally {
    config.financeWritesEnabled = old;
    await pool.query('drop table if exists commissions, wallet_transactions, orders, wallets cascade');
  }
});

test('insufficient funds rolls back all financial writes', { skip: !dbReady }, async () => {
  await resetFinanceSchema();
  const old = config.financeWritesEnabled;
  config.financeWritesEnabled = true;
  try {
    await assert.rejects(
      holdEscrow({ buyerId: 101, sellerId: 202, amount: 1001, commissionRate: 0.05, idempotencyKey: 'too-expensive' }),
      /insufficient balance/,
    );
    assert.deepEqual(await wallet(101), { available: '1000.00', held: '0.00' });
    const orders = await pool.query('select count(*)::int as count from orders');
    const ledger = await pool.query('select count(*)::int as count from wallet_transactions');
    assert.equal(orders.rows[0].count, 0);
    assert.equal(ledger.rows[0].count, 0);
  } finally {
    config.financeWritesEnabled = old;
    await pool.query('drop table if exists commissions, wallet_transactions, orders, wallets cascade');
  }
});

test('write compatibility refuses schemas without idempotency uniqueness', { skip: !dbReady }, async () => {
  await resetFinanceSchema();
  await pool.query('alter table orders drop constraint orders_idempotency_key_key');
  const status = await detectFinanceWriteCompatibility({ force: true });
  assert.equal(status.ready, false);
  assert.equal(status.blockers.includes('missing_unique:orders.idempotency_key'), true);
  await pool.query('drop table if exists commissions, wallet_transactions, orders, wallets cascade');
});
