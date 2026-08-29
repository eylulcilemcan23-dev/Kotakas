import crypto from 'node:crypto';
import { config } from './config.js';
import { pool } from './db.js';

const REQUIRED = Object.freeze({
  wallets: ['user_id', 'available_balance', 'held_balance', 'updated_at'],
  wallet_payment_intents: [
    'id', 'user_id', 'amount', 'currency', 'provider', 'merchant_reference', 'provider_payment_id',
    'idempotency_key', 'status', 'checkout_url', 'created_at', 'updated_at', 'paid_at',
  ],
  payment_webhook_events: [
    'id', 'provider', 'event_id', 'payload_hash', 'payment_intent_id', 'status', 'received_at', 'processed_at',
  ],
  payout_accounts: [
    'id', 'user_id', 'provider', 'provider_token', 'display_label', 'status', 'created_at', 'updated_at',
  ],
  withdrawal_requests: [
    'id', 'user_id', 'payout_account_id', 'amount', 'fee_amount', 'net_amount', 'currency', 'status',
    'idempotency_key', 'provider_payout_id', 'resolution_note', 'requested_at', 'updated_at', 'completed_at',
  ],
  wallet_funding_ledger: [
    'id', 'user_id', 'kind', 'payment_intent_id', 'withdrawal_request_id', 'available_delta', 'held_delta', 'created_at',
  ],
});

let compatibilityCache = null;
let compatibilityCachedAt = 0;
const CACHE_MS = 60_000;

function numericId(value, label = 'id') {
  const text = value == null ? '' : String(value);
  if (!/^\d+$/.test(text)) throw new Error(`invalid ${label}`);
  return text;
}

export function normalizeFundingAmount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('invalid amount');
  const rounded = Math.round((number + Number.EPSILON) * 100) / 100;
  if (rounded <= 0 || rounded > 1_000_000) throw new Error('invalid amount');
  return rounded;
}

function moneyParam(value) {
  return normalizeFundingAmount(value).toFixed(2);
}

function signedMoneyParam(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('invalid amount');
  return (Math.round((number + Number.EPSILON) * 100) / 100).toFixed(2);
}

function safeText(value, max, label, min = 1) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < min || text.length > max) throw new Error(`invalid ${label}`);
  return text;
}

function idempotencyKey(value) {
  return safeText(value, 128, 'idempotency key');
}

function providerName(value = config.paymentProvider) {
  const provider = safeText(value, 60, 'payment provider').toLowerCase();
  if (provider === 'disabled') throw new Error('payment provider disabled');
  return provider;
}

function currencyCode(value = 'TRY') {
  const currency = String(value || '').trim().toUpperCase();
  if (currency !== 'TRY') throw new Error('invalid currency');
  return currency;
}

function paymentView(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    amount: Number(row.amount),
    currency: row.currency,
    provider: row.provider,
    merchantReference: row.merchant_reference,
    status: row.status,
    checkoutUrl: row.checkout_url || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    paidAt: row.paid_at || null,
  };
}

function payoutAccountView(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    provider: row.provider,
    displayLabel: row.display_label,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function withdrawalView(row, payoutAccount = null) {
  if (!row) return null;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    payoutAccountId: String(row.payout_account_id),
    payoutAccount: payoutAccount ? payoutAccountView(payoutAccount) : undefined,
    amount: Number(row.amount),
    feeAmount: Number(row.fee_amount),
    netAmount: Number(row.net_amount),
    currency: row.currency,
    status: row.status,
    resolutionNote: row.resolution_note || null,
    requestedAt: row.requested_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at || null,
  };
}

export async function detectPaymentFundingCompatibility({ force = false } = {}) {
  if (!pool) return { ready: false, blockers: ['DATABASE_URL missing'], tables: {} };
  if (!force && compatibilityCache && Date.now() - compatibilityCachedAt < CACHE_MS) return compatibilityCache;
  const result = await pool.query(`
    select table_name,column_name
    from information_schema.columns
    where table_schema='public' and table_name=any($1::text[])
  `, [Object.keys(REQUIRED)]);
  const tables = new Map();
  for (const row of result.rows) {
    if (!tables.has(row.table_name)) tables.set(row.table_name, new Set());
    tables.get(row.table_name).add(row.column_name);
  }
  const blockers = [];
  for (const [table, columns] of Object.entries(REQUIRED)) {
    if (!tables.has(table)) blockers.push(`missing_table:${table}`);
    for (const column of columns) if (!tables.get(table)?.has(column)) blockers.push(`missing_column:${table}.${column}`);
  }
  compatibilityCache = {
    ready: blockers.length === 0,
    blockers: [...new Set(blockers)],
    tables: Object.fromEntries(Object.keys(REQUIRED).map((name) => [name, tables.has(name)])),
  };
  compatibilityCachedAt = Date.now();
  return compatibilityCache;
}

async function assertSchemaReady() {
  if (!pool) throw new Error('database unavailable');
  const status = await detectPaymentFundingCompatibility();
  if (!status.ready) throw new Error(`payment funding schema incompatible: ${status.blockers.join(', ')}`);
}

function assertPaymentWrites() {
  if (!config.financeWritesEnabled || !config.paymentWritesEnabled) throw new Error('payment writes disabled');
}

function assertWithdrawalWrites() {
  if (!config.financeWritesEnabled || !config.withdrawalWritesEnabled) throw new Error('withdrawal writes disabled');
}

function merchantReference() {
  return `KOT-${Date.now()}-${crypto.randomUUID().replaceAll('-', '').slice(0, 18)}`;
}

export function canonicalProviderEvent(input = {}) {
  const status = String(input.status || '').trim().toLowerCase();
  if (!['paid', 'failed', 'cancelled'].includes(status)) throw new Error('invalid provider event status');
  const event = {
    eventId: safeText(input.eventId, 160, 'provider event id'),
    merchantReference: safeText(input.merchantReference, 160, 'merchant reference'),
    providerPaymentId: input.providerPaymentId == null ? '' : safeText(String(input.providerPaymentId), 160, 'provider payment id'),
    status,
    amount: normalizeFundingAmount(input.amount),
    currency: currencyCode(input.currency),
  };
  if (status === 'paid' && !event.providerPaymentId) throw new Error('invalid provider payment id');
  return `${event.eventId}|${event.merchantReference}|${event.providerPaymentId}|${event.status}|${event.amount.toFixed(2)}|${event.currency}`;
}

export function signProviderEvent(input, secret = config.paymentWebhookSecret) {
  const safeSecret = safeText(secret, 512, 'payment webhook secret', 16);
  return crypto.createHmac('sha256', safeSecret).update(canonicalProviderEvent(input)).digest('hex');
}

export function verifyProviderEventSignature(input, signature, secret = config.paymentWebhookSecret) {
  try {
    const actual = String(signature || '').trim().replace(/^sha256=/i, '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(actual)) return false;
    const expected = signProviderEvent(input, secret);
    const a = Buffer.from(actual, 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function createDepositIntent({ userId, amount, idempotencyKey: key, provider = config.paymentProvider, checkoutUrl = null }) {
  assertPaymentWrites();
  await assertSchemaReady();
  const user = numericId(userId, 'user id');
  const safeAmount = normalizeFundingAmount(amount);
  const safeProvider = providerName(provider);
  const safeKey = idempotencyKey(key);
  const safeCheckoutUrl = checkoutUrl == null ? null : safeText(checkoutUrl, 1000, 'checkout url');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`deposit:${safeKey}`]);
    const existing = await client.query('select * from wallet_payment_intents where idempotency_key=$1 for update', [safeKey]);
    if (existing.rowCount) {
      const row = existing.rows[0];
      if (String(row.user_id) !== user || Number(row.amount) !== safeAmount || row.provider !== safeProvider) {
        throw new Error('idempotency key conflict');
      }
      await client.query('commit');
      return paymentView(row);
    }
    const inserted = await client.query(`
      insert into wallet_payment_intents (
        user_id,amount,currency,provider,merchant_reference,provider_payment_id,idempotency_key,status,checkout_url,
        created_at,updated_at,paid_at
      ) values ($1,$2::numeric,'TRY',$3,$4,null,$5,'created',$6,now(),now(),null)
      returning *
    `, [user, safeAmount.toFixed(2), safeProvider, merchantReference(), safeKey, safeCheckoutUrl]);
    await client.query('commit');
    return paymentView(inserted.rows[0]);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function applyProviderPaymentEvent(input, { provider = config.paymentProvider } = {}) {
  assertPaymentWrites();
  await assertSchemaReady();
  const safeProvider = providerName(provider);
  const canonical = canonicalProviderEvent(input);
  const payloadHash = crypto.createHash('sha256').update(canonical).digest('hex');
  const eventId = safeText(input.eventId, 160, 'provider event id');
  const merchantRef = safeText(input.merchantReference, 160, 'merchant reference');
  const providerPaymentId = input.providerPaymentId == null ? null : safeText(String(input.providerPaymentId), 160, 'provider payment id');
  const status = String(input.status).trim().toLowerCase();
  const amount = normalizeFundingAmount(input.amount);
  const currency = currencyCode(input.currency);

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`provider-event:${safeProvider}:${eventId}`]);
    const oldEvent = await client.query(`
      select e.*, p.*
      from payment_webhook_events e
      left join wallet_payment_intents p on p.id=e.payment_intent_id
      where e.provider=$1 and e.event_id=$2
      limit 1
    `, [safeProvider, eventId]);
    if (oldEvent.rowCount && oldEvent.rows[0].processed_at) {
      const intent = await client.query('select * from wallet_payment_intents where id=$1', [oldEvent.rows[0].payment_intent_id]);
      await client.query('commit');
      return { intent: paymentView(intent.rows[0]), credited: false, duplicate: true };
    }

    const intentResult = await client.query(`
      select * from wallet_payment_intents where merchant_reference=$1 for update
    `, [merchantRef]);
    if (!intentResult.rowCount) throw new Error('payment intent not found');
    const intent = intentResult.rows[0];
    if (intent.provider !== safeProvider) throw new Error('payment provider mismatch');
    if (Number(intent.amount) !== amount || intent.currency !== currency) throw new Error('payment amount mismatch');

    const eventResult = await client.query(`
      insert into payment_webhook_events (provider,event_id,payload_hash,payment_intent_id,status,received_at,processed_at)
      values ($1,$2,$3,$4,'received',now(),null)
      on conflict (provider,event_id) do update set
        payload_hash=excluded.payload_hash,
        payment_intent_id=excluded.payment_intent_id
      returning *
    `, [safeProvider, eventId, payloadHash, intent.id]);

    let credited = false;
    let updatedIntent = intent;
    if (status === 'paid') {
      if (intent.status !== 'paid') {
        if (!['created', 'pending'].includes(intent.status)) throw new Error(`payment intent not payable:${intent.status}`);
        await client.query(`
          insert into wallets (user_id,available_balance,held_balance,updated_at)
          values ($1,0,0,now()) on conflict (user_id) do nothing
        `, [intent.user_id]);
        const wallet = await client.query('select * from wallets where user_id=$1 for update', [intent.user_id]);
        if (!wallet.rowCount) throw new Error('wallet not found');
        await client.query(`
          update wallets set available_balance=available_balance+$2::numeric,updated_at=now() where user_id=$1
        `, [intent.user_id, amount.toFixed(2)]);
        const updated = await client.query(`
          update wallet_payment_intents
          set status='paid',provider_payment_id=$2,paid_at=coalesce(paid_at,now()),updated_at=now()
          where id=$1 returning *
        `, [intent.id, providerPaymentId]);
        updatedIntent = updated.rows[0];
        await client.query(`
          insert into wallet_funding_ledger
            (user_id,kind,payment_intent_id,withdrawal_request_id,available_delta,held_delta,created_at)
          values ($1,'deposit_credit',$2,null,$3::numeric,0,now())
          on conflict do nothing
        `, [intent.user_id, intent.id, amount.toFixed(2)]);
        credited = true;
      }
    } else if (intent.status !== 'paid') {
      const updated = await client.query(`
        update wallet_payment_intents set status=$2,updated_at=now() where id=$1 returning *
      `, [intent.id, status]);
      updatedIntent = updated.rows[0];
    }

    await client.query(`
      update payment_webhook_events set status='processed',processed_at=now() where id=$1
    `, [eventResult.rows[0].id]);
    await client.query('commit');
    return { intent: paymentView(updatedIntent), credited, duplicate: false };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function savePayoutAccount({ userId, provider = config.paymentProvider, providerToken, displayLabel }) {
  assertWithdrawalWrites();
  await assertSchemaReady();
  const user = numericId(userId, 'user id');
  const safeProvider = providerName(provider);
  const token = safeText(providerToken, 240, 'payout token');
  const label = safeText(displayLabel, 120, 'payout label', 3);
  const result = await pool.query(`
    insert into payout_accounts (user_id,provider,provider_token,display_label,status,created_at,updated_at)
    values ($1,$2,$3,$4,'active',now(),now())
    on conflict (provider,provider_token) do update set
      user_id=excluded.user_id,display_label=excluded.display_label,status='active',updated_at=now()
    returning *
  `, [user, safeProvider, token, label]);
  return payoutAccountView(result.rows[0]);
}

export async function listPayoutAccounts(userId) {
  await assertSchemaReady();
  const user = numericId(userId, 'user id');
  const result = await pool.query(`
    select * from payout_accounts where user_id=$1 and status='active' order by id desc
  `, [user]);
  return result.rows.map(payoutAccountView);
}

function withdrawalFee(amount) {
  const rate = Number(config.withdrawalFeeRate || 0);
  if (!Number.isFinite(rate) || rate < 0 || rate >= 1) throw new Error('invalid withdrawal fee rate');
  return Math.round((amount * rate + Number.EPSILON) * 100) / 100;
}

export async function createWithdrawalRequest({ userId, payoutAccountId, amount, idempotencyKey: key }) {
  assertWithdrawalWrites();
  await assertSchemaReady();
  const user = numericId(userId, 'user id');
  const accountId = numericId(payoutAccountId, 'payout account id');
  const safeAmount = normalizeFundingAmount(amount);
  const minimum = Number(config.withdrawalMinAmount || 0);
  const maximum = Number(config.withdrawalMaxAmount || 1_000_000);
  if (safeAmount < minimum || safeAmount > maximum) throw new Error('withdrawal amount outside limits');
  const fee = withdrawalFee(safeAmount);
  const net = Math.round((safeAmount - fee + Number.EPSILON) * 100) / 100;
  if (net <= 0) throw new Error('invalid withdrawal net amount');
  const safeKey = idempotencyKey(key);

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`withdrawal:${safeKey}`]);
    const existing = await client.query('select * from withdrawal_requests where idempotency_key=$1 for update', [safeKey]);
    if (existing.rowCount) {
      const row = existing.rows[0];
      if (String(row.user_id) !== user || String(row.payout_account_id) !== accountId || Number(row.amount) !== safeAmount) {
        throw new Error('idempotency key conflict');
      }
      const account = await client.query('select * from payout_accounts where id=$1', [row.payout_account_id]);
      await client.query('commit');
      return withdrawalView(row, account.rows[0]);
    }

    const account = await client.query(`
      select * from payout_accounts where id=$1 and user_id=$2 and status='active' for update
    `, [accountId, user]);
    if (!account.rowCount) throw new Error('payout account not found');
    const wallet = await client.query('select * from wallets where user_id=$1 for update', [user]);
    if (!wallet.rowCount) throw new Error('wallet not found');
    if (Number(wallet.rows[0].available_balance) < safeAmount) throw new Error('insufficient available balance');

    await client.query(`
      update wallets
      set available_balance=available_balance-$2::numeric,
          held_balance=held_balance+$2::numeric,
          updated_at=now()
      where user_id=$1
    `, [user, safeAmount.toFixed(2)]);
    const inserted = await client.query(`
      insert into withdrawal_requests (
        user_id,payout_account_id,amount,fee_amount,net_amount,currency,status,idempotency_key,provider_payout_id,
        resolution_note,requested_at,updated_at,completed_at
      ) values ($1,$2,$3::numeric,$4::numeric,$5::numeric,'TRY','requested',$6,null,null,now(),now(),null)
      returning *
    `, [user, accountId, safeAmount.toFixed(2), fee.toFixed(2), net.toFixed(2), safeKey]);
    await client.query(`
      insert into wallet_funding_ledger
        (user_id,kind,payment_intent_id,withdrawal_request_id,available_delta,held_delta,created_at)
      values ($1,'withdrawal_hold',null,$2,$3::numeric,$4::numeric,now())
    `, [user, inserted.rows[0].id, signedMoneyParam(-safeAmount), safeAmount.toFixed(2)]);
    await client.query('commit');
    return withdrawalView(inserted.rows[0], account.rows[0]);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function resolveWithdrawalRequest({ withdrawalId, outcome, providerPayoutId = null, resolutionNote = null }) {
  assertWithdrawalWrites();
  await assertSchemaReady();
  const id = numericId(withdrawalId, 'withdrawal id');
  const target = String(outcome || '').trim().toLowerCase();
  if (!['paid', 'cancelled', 'failed'].includes(target)) throw new Error('invalid withdrawal outcome');
  const payoutRef = providerPayoutId == null || providerPayoutId === '' ? null : safeText(String(providerPayoutId), 160, 'provider payout id');
  const note = resolutionNote == null || resolutionNote === '' ? null : safeText(String(resolutionNote), 300, 'resolution note', 3);
  if (target === 'paid' && !payoutRef) throw new Error('provider payout id required');
  if (target !== 'paid' && !note) throw new Error('resolution note required');

  const client = await pool.connect();
  try {
    await client.query('begin');
    const request = await client.query('select * from withdrawal_requests where id=$1 for update', [id]);
    if (!request.rowCount) throw new Error('withdrawal not found');
    const row = request.rows[0];
    if (row.status === target) {
      const account = await client.query('select * from payout_accounts where id=$1', [row.payout_account_id]);
      await client.query('commit');
      return withdrawalView(row, account.rows[0]);
    }
    if (['paid', 'cancelled', 'failed'].includes(row.status)) throw new Error(`withdrawal already final:${row.status}`);
    const wallet = await client.query('select * from wallets where user_id=$1 for update', [row.user_id]);
    if (!wallet.rowCount) throw new Error('wallet not found');
    const amount = Number(row.amount);
    if (Number(wallet.rows[0].held_balance) < amount) throw new Error('held balance invariant failed');

    if (target === 'paid') {
      await client.query(`
        update wallets set held_balance=held_balance-$2::numeric,updated_at=now() where user_id=$1
      `, [row.user_id, amount.toFixed(2)]);
      await client.query(`
        insert into wallet_funding_ledger
          (user_id,kind,payment_intent_id,withdrawal_request_id,available_delta,held_delta,created_at)
        values ($1,'withdrawal_paid',null,$2,0,$3::numeric,now()) on conflict do nothing
      `, [row.user_id, row.id, signedMoneyParam(-amount)]);
    } else {
      await client.query(`
        update wallets
        set available_balance=available_balance+$2::numeric,
            held_balance=held_balance-$2::numeric,
            updated_at=now()
        where user_id=$1
      `, [row.user_id, amount.toFixed(2)]);
      await client.query(`
        insert into wallet_funding_ledger
          (user_id,kind,payment_intent_id,withdrawal_request_id,available_delta,held_delta,created_at)
        values ($1,'withdrawal_refund',null,$2,$3::numeric,$4::numeric,now()) on conflict do nothing
      `, [row.user_id, row.id, amount.toFixed(2), signedMoneyParam(-amount)]);
    }

    const updated = await client.query(`
      update withdrawal_requests
      set status=$2,provider_payout_id=coalesce($3,provider_payout_id),resolution_note=$4,updated_at=now(),completed_at=now()
      where id=$1 returning *
    `, [row.id, target, payoutRef, note]);
    const account = await client.query('select * from payout_accounts where id=$1', [row.payout_account_id]);
    await client.query('commit');
    return withdrawalView(updated.rows[0], account.rows[0]);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function listUserDeposits(userId, { limit = 30 } = {}) {
  await assertSchemaReady();
  const user = numericId(userId, 'user id');
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(String(limit), 10) || 30));
  const result = await pool.query(`
    select * from wallet_payment_intents where user_id=$1 order by id desc limit $2
  `, [user, safeLimit]);
  return result.rows.map(paymentView);
}

export async function listUserWithdrawals(userId, { limit = 30 } = {}) {
  await assertSchemaReady();
  const user = numericId(userId, 'user id');
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(String(limit), 10) || 30));
  const result = await pool.query(`
    select w.*, p.id as p_id,p.user_id as p_user_id,p.provider as p_provider,p.display_label as p_display_label,
           p.status as p_status,p.created_at as p_created_at,p.updated_at as p_updated_at
    from withdrawal_requests w
    left join payout_accounts p on p.id=w.payout_account_id
    where w.user_id=$1 order by w.id desc limit $2
  `, [user, safeLimit]);
  return result.rows.map((row) => withdrawalView(row, row.p_id == null ? null : {
    id: row.p_id, user_id: row.p_user_id, provider: row.p_provider, display_label: row.p_display_label,
    status: row.p_status, created_at: row.p_created_at, updated_at: row.p_updated_at,
  }));
}

export async function listFundingActivity(userId, { limit = 30 } = {}) {
  await assertSchemaReady();
  const user = numericId(userId, 'user id');
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(String(limit), 10) || 30));
  const result = await pool.query(`
    select id,kind,payment_intent_id,withdrawal_request_id,available_delta,held_delta,created_at
    from wallet_funding_ledger where user_id=$1 order by id desc limit $2
  `, [user, safeLimit]);
  return result.rows.map((row) => ({
    id: String(row.id),
    kind: row.kind,
    paymentIntentId: row.payment_intent_id == null ? null : String(row.payment_intent_id),
    withdrawalRequestId: row.withdrawal_request_id == null ? null : String(row.withdrawal_request_id),
    availableDelta: Number(row.available_delta),
    heldDelta: Number(row.held_delta),
    createdAt: row.created_at,
  }));
}

export async function listAdminWithdrawals({ status = 'requested', limit = 50 } = {}) {
  await assertSchemaReady();
  const safeStatus = String(status || '').trim().toLowerCase();
  if (safeStatus && !['requested', 'processing', 'paid', 'cancelled', 'failed'].includes(safeStatus)) throw new Error('invalid withdrawal status');
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(String(limit), 10) || 50));
  const params = [];
  const where = safeStatus ? `where w.status=$1` : '';
  if (safeStatus) params.push(safeStatus);
  params.push(safeLimit);
  const result = await pool.query(`
    select w.*, p.id as p_id,p.user_id as p_user_id,p.provider as p_provider,p.display_label as p_display_label,
           p.status as p_status,p.created_at as p_created_at,p.updated_at as p_updated_at
    from withdrawal_requests w
    left join payout_accounts p on p.id=w.payout_account_id
    ${where}
    order by w.requested_at asc
    limit $${params.length}
  `, params);
  return result.rows.map((row) => withdrawalView(row, row.p_id == null ? null : {
    id: row.p_id, user_id: row.p_user_id, provider: row.p_provider, display_label: row.p_display_label,
    status: row.p_status, created_at: row.p_created_at, updated_at: row.p_updated_at,
  }));
}
