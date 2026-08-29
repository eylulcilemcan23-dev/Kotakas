import { config } from './config.js';
import { pool } from './db.js';
import { buildEscrowSettlement, ESCROW_STATES } from './escrow.js';

const REQUIRED = Object.freeze({
  wallets: ['user_id', 'available_balance', 'held_balance', 'updated_at'],
  orders: ['id', 'buyer_id', 'seller_id', 'amount', 'commission_rate', 'commission_amount', 'seller_net', 'escrow_state', 'idempotency_key', 'created_at', 'updated_at'],
  wallet_transactions: ['id', 'order_id', 'user_id', 'kind', 'available_delta', 'held_delta', 'created_at'],
  commissions: ['id', 'order_id', 'amount', 'rate', 'created_at'],
});

let cache = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error('invalid money');
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function amountParam(value) {
  return money(value).toFixed(2);
}

function normalizeKey(value) {
  const key = typeof value === 'string' ? value.trim() : '';
  if (!key || key.length > 128) throw new Error('invalid idempotency key');
  return key;
}

async function hasUniqueColumn(tableName, columnName) {
  const result = await pool.query(`
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join unnest(c.conkey) with ordinality as k(attnum, ord) on true
    join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
    where n.nspname = 'public'
      and t.relname = $1
      and c.contype in ('u', 'p')
    group by c.oid
    having count(*) = 1 and max(a.attname) = $2
    limit 1
  `, [tableName, columnName]);
  return result.rowCount > 0;
}

export async function detectFinanceWriteCompatibility({ force = false } = {}) {
  if (!pool) return { ready: false, blockers: ['DATABASE_URL missing'], tables: {} };
  if (!force && cache && Date.now() - cachedAt < CACHE_MS) return cache;

  const result = await pool.query(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
    order by table_name, ordinal_position
  `);
  const tables = new Map();
  for (const row of result.rows) {
    if (!tables.has(row.table_name)) tables.set(row.table_name, new Set());
    tables.get(row.table_name).add(row.column_name);
  }

  const blockers = [];
  for (const [table, columns] of Object.entries(REQUIRED)) {
    if (!tables.has(table)) {
      blockers.push(`missing_table:${table}`);
      continue;
    }
    for (const column of columns) {
      if (!tables.get(table).has(column)) blockers.push(`missing_column:${table}.${column}`);
    }
  }

  if (tables.has('orders') && !(await hasUniqueColumn('orders', 'idempotency_key'))) {
    blockers.push('missing_unique:orders.idempotency_key');
  }
  if (tables.has('commissions') && !(await hasUniqueColumn('commissions', 'order_id'))) {
    blockers.push('missing_unique:commissions.order_id');
  }

  cache = {
    ready: blockers.length === 0,
    blockers,
    tables: Object.fromEntries(Object.keys(REQUIRED).map((name) => [name, tables.has(name)])),
  };
  cachedAt = Date.now();
  return cache;
}

function assertWritesEnabled() {
  if (!config.financeWritesEnabled) throw new Error('finance writes disabled');
  if (!pool) throw new Error('database unavailable');
}

async function assertCompatible() {
  const status = await detectFinanceWriteCompatibility();
  if (!status.ready) throw new Error(`finance schema incompatible: ${status.blockers.join(', ')}`);
}

function orderView(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    listingId: row.listing_id == null ? null : String(row.listing_id),
    buyerId: String(row.buyer_id),
    sellerId: String(row.seller_id),
    amount: money(row.amount),
    commissionRate: Number(row.commission_rate),
    commissionAmount: money(row.commission_amount),
    sellerNet: money(row.seller_net),
    escrowState: row.escrow_state,
    idempotencyKey: row.idempotency_key,
  };
}

async function getLockedOrder(client, orderId) {
  const result = await client.query('select * from orders where id = $1 for update', [orderId]);
  if (!result.rowCount) throw new Error('escrow order not found');
  return result.rows[0];
}

async function getLockedWallets(client, userIds) {
  const ids = [...new Set(userIds.map((id) => String(id)))].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1);
  const result = await client.query(
    'select user_id, available_balance, held_balance from wallets where user_id = any($1::bigint[]) order by user_id for update',
    [ids],
  );
  const map = new Map(result.rows.map((row) => [String(row.user_id), row]));
  for (const id of ids) {
    if (!map.has(id)) throw new Error(`wallet not found:${id}`);
  }
  return map;
}

async function settleLinkedListing(client, order, escrowState) {
  if (order.listing_id == null) return null;
  const targetStatus = escrowState === ESCROW_STATES.RELEASED ? 'sold' : escrowState === ESCROW_STATES.REFUNDED ? 'active' : null;
  if (!targetStatus) return null;

  const result = escrowState === ESCROW_STATES.RELEASED
    ? await client.query(`
        update listings
        set status = 'sold', updated_at = now()
        where id = $1 and order_id = $2
        returning id, status, order_id
      `, [order.listing_id, order.id])
    : await client.query(`
        update listings
        set status = 'active', order_id = null, updated_at = now()
        where id = $1 and order_id = $2
        returning id, status, order_id
      `, [order.listing_id, order.id]);

  if (!result.rowCount) throw new Error('listing settlement invariant failed');
  return result.rows[0];
}

export async function holdEscrow({ buyerId, sellerId, amount, commissionRate, idempotencyKey }) {
  assertWritesEnabled();
  await assertCompatible();
  if (buyerId == null || sellerId == null) throw new Error('missing escrow identity');
  if (String(buyerId) === String(sellerId)) throw new Error('buyer and seller must differ');

  const key = normalizeKey(idempotencyKey);
  const settlement = buildEscrowSettlement(amount, commissionRate);
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);

    const existing = await client.query('select * from orders where idempotency_key = $1 for update', [key]);
    if (existing.rowCount) {
      const row = existing.rows[0];
      const same =
        String(row.buyer_id) === String(buyerId) &&
        String(row.seller_id) === String(sellerId) &&
        money(row.amount) === settlement.heldAmount &&
        Number(row.commission_rate) === Number(commissionRate);
      if (!same) throw new Error('idempotency key conflict');
      await client.query('commit');
      return orderView(row);
    }

    const wallets = await getLockedWallets(client, [buyerId]);
    const buyer = wallets.get(String(buyerId));
    if (money(buyer.available_balance) < settlement.buyerDebit) throw new Error('insufficient balance');

    await client.query(`
      update wallets
      set available_balance = available_balance - $2::numeric,
          held_balance = held_balance + $2::numeric,
          updated_at = now()
      where user_id = $1
    `, [buyerId, amountParam(settlement.buyerDebit)]);

    const orderResult = await client.query(`
      insert into orders (
        buyer_id, seller_id, amount, commission_rate, commission_amount, seller_net,
        escrow_state, idempotency_key, created_at, updated_at
      )
      values ($1, $2, $3::numeric, $4::numeric, $5::numeric, $6::numeric, $7, $8, now(), now())
      returning *
    `, [
      buyerId,
      sellerId,
      amountParam(settlement.heldAmount),
      String(settlement.commissionRate),
      amountParam(settlement.platformCredit),
      amountParam(settlement.sellerCredit),
      ESCROW_STATES.HELD,
      key,
    ]);

    const order = orderResult.rows[0];
    await client.query(`
      insert into wallet_transactions (order_id, user_id, kind, available_delta, held_delta, created_at)
      values ($1, $2, 'escrow_hold', $3::numeric, $4::numeric, now())
    `, [order.id, buyerId, amountParam(-settlement.buyerDebit), amountParam(settlement.heldAmount)]);

    await client.query('commit');
    return orderView(order);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function releaseEscrow(orderId) {
  assertWritesEnabled();
  await assertCompatible();
  const client = await pool.connect();
  try {
    await client.query('begin');
    const order = await getLockedOrder(client, orderId);
    if (order.escrow_state === ESCROW_STATES.RELEASED) {
      await client.query('commit');
      return orderView(order);
    }
    if (order.escrow_state !== ESCROW_STATES.HELD) throw new Error(`escrow not releasable:${order.escrow_state}`);

    const wallets = await getLockedWallets(client, [order.buyer_id, order.seller_id]);
    const buyer = wallets.get(String(order.buyer_id));
    if (money(buyer.held_balance) < money(order.amount)) throw new Error('held balance invariant failed');

    await client.query(`
      update wallets
      set held_balance = held_balance - $2::numeric, updated_at = now()
      where user_id = $1
    `, [order.buyer_id, amountParam(order.amount)]);

    await client.query(`
      update wallets
      set available_balance = available_balance + $2::numeric, updated_at = now()
      where user_id = $1
    `, [order.seller_id, amountParam(order.seller_net)]);

    await client.query(`
      insert into wallet_transactions (order_id, user_id, kind, available_delta, held_delta, created_at)
      values
        ($1, $2, 'escrow_release', 0, $4::numeric, now()),
        ($1, $3, 'sale_credit', $5::numeric, 0, now())
    `, [
      order.id,
      order.buyer_id,
      order.seller_id,
      amountParam(-money(order.amount)),
      amountParam(order.seller_net),
    ]);

    await client.query(`
      insert into commissions (order_id, amount, rate, created_at)
      values ($1, $2::numeric, $3::numeric, now())
    `, [order.id, amountParam(order.commission_amount), String(order.commission_rate)]);

    const updated = await client.query(`
      update orders set escrow_state = $2, updated_at = now() where id = $1 returning *
    `, [order.id, ESCROW_STATES.RELEASED]);

    await settleLinkedListing(client, updated.rows[0], ESCROW_STATES.RELEASED);
    await client.query('commit');
    return orderView(updated.rows[0]);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function refundEscrow(orderId) {
  assertWritesEnabled();
  await assertCompatible();
  const client = await pool.connect();
  try {
    await client.query('begin');
    const order = await getLockedOrder(client, orderId);
    if (order.escrow_state === ESCROW_STATES.REFUNDED) {
      await client.query('commit');
      return orderView(order);
    }
    if (order.escrow_state !== ESCROW_STATES.HELD) throw new Error(`escrow not refundable:${order.escrow_state}`);

    const wallets = await getLockedWallets(client, [order.buyer_id]);
    const buyer = wallets.get(String(order.buyer_id));
    if (money(buyer.held_balance) < money(order.amount)) throw new Error('held balance invariant failed');

    await client.query(`
      update wallets
      set available_balance = available_balance + $2::numeric,
          held_balance = held_balance - $2::numeric,
          updated_at = now()
      where user_id = $1
    `, [order.buyer_id, amountParam(order.amount)]);

    await client.query(`
      insert into wallet_transactions (order_id, user_id, kind, available_delta, held_delta, created_at)
      values ($1, $2, 'escrow_refund', $3::numeric, $4::numeric, now())
    `, [order.id, order.buyer_id, amountParam(order.amount), amountParam(-money(order.amount))]);

    const updated = await client.query(`
      update orders set escrow_state = $2, updated_at = now() where id = $1 returning *
    `, [order.id, ESCROW_STATES.REFUNDED]);

    await settleLinkedListing(client, updated.rows[0], ESCROW_STATES.REFUNDED);
    await client.query('commit');
    return orderView(updated.rows[0]);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
