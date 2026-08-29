import { config } from './config.js';
import { pool } from './db.js';
import { buildEscrowSettlement, ESCROW_STATES } from './escrow.js';

const LISTING_COLUMNS = [
  'id', 'seller_id', 'title', 'server', 'description', 'price', 'status', 'order_id', 'created_at', 'updated_at',
];

let compatibilityCache = null;
let compatibilityCachedAt = 0;
const CACHE_MS = 60_000;

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error('invalid money');
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function moneyParam(value) {
  return money(value).toFixed(2);
}

function numericId(value, label = 'id') {
  const text = value == null ? '' : String(value);
  if (!/^\d+$/.test(text)) throw new Error(`invalid ${label}`);
  return text;
}

function text(value, max, label) {
  const out = typeof value === 'string' ? value.trim() : '';
  if (!out || out.length > max) throw new Error(`invalid ${label}`);
  return out;
}

function optionalText(value, max) {
  const out = typeof value === 'string' ? value.trim() : '';
  if (out.length > max) throw new Error('invalid description');
  return out || null;
}

function listingView(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    sellerId: String(row.seller_id),
    title: row.title,
    server: row.server,
    description: row.description || '',
    price: Number(row.price),
    status: row.status,
    orderId: row.order_id == null ? null : String(row.order_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function orderView(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    listingId: row.listing_id == null ? null : String(row.listing_id),
    buyerId: String(row.buyer_id),
    sellerId: String(row.seller_id),
    amount: Number(row.amount),
    commissionRate: Number(row.commission_rate),
    commissionAmount: Number(row.commission_amount),
    sellerNet: Number(row.seller_net),
    escrowState: row.escrow_state,
    idempotencyKey: row.idempotency_key,
  };
}

export async function detectMarketplaceCompatibility({ force = false } = {}) {
  if (!pool) return { ready: false, blockers: ['DATABASE_URL missing'] };
  if (!force && compatibilityCache && Date.now() - compatibilityCachedAt < CACHE_MS) return compatibilityCache;

  const result = await pool.query(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public' and table_name in ('listings','orders','wallets','wallet_transactions')
  `);
  const tables = new Map();
  for (const row of result.rows) {
    if (!tables.has(row.table_name)) tables.set(row.table_name, new Set());
    tables.get(row.table_name).add(row.column_name);
  }

  const blockers = [];
  for (const column of LISTING_COLUMNS) {
    if (!tables.get('listings')?.has(column)) blockers.push(`missing_column:listings.${column}`);
  }
  for (const column of ['listing_id','idempotency_key','buyer_id','seller_id','amount','commission_rate','commission_amount','seller_net','escrow_state']) {
    if (!tables.get('orders')?.has(column)) blockers.push(`missing_column:orders.${column}`);
  }
  for (const column of ['user_id','available_balance','held_balance','updated_at']) {
    if (!tables.get('wallets')?.has(column)) blockers.push(`missing_column:wallets.${column}`);
  }
  for (const column of ['order_id','user_id','kind','available_delta','held_delta','created_at']) {
    if (!tables.get('wallet_transactions')?.has(column)) blockers.push(`missing_column:wallet_transactions.${column}`);
  }
  for (const table of ['listings','orders','wallets','wallet_transactions']) {
    if (!tables.has(table)) blockers.push(`missing_table:${table}`);
  }

  compatibilityCache = { ready: blockers.length === 0, blockers: [...new Set(blockers)] };
  compatibilityCachedAt = Date.now();
  return compatibilityCache;
}

async function assertMarketplaceReady() {
  if (!pool) throw new Error('database unavailable');
  const status = await detectMarketplaceCompatibility();
  if (!status.ready) throw new Error(`market schema incompatible: ${status.blockers.join(', ')}`);
}

export async function listActiveListings({ limit = 50, server = '' } = {}) {
  await assertMarketplaceReady();
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(String(limit), 10) || 50));
  const serverText = typeof server === 'string' ? server.trim().toUpperCase() : '';
  const params = [];
  let filter = "status = 'active'";
  if (serverText) {
    params.push(serverText);
    filter += ` and upper(server) = $${params.length}`;
  }
  params.push(safeLimit);
  const result = await pool.query(`
    select ${LISTING_COLUMNS.join(', ')}
    from listings
    where ${filter}
    order by id desc
    limit $${params.length}
  `, params);
  return result.rows.map(listingView);
}

export async function listSellerListings(sellerId, { limit = 50 } = {}) {
  await assertMarketplaceReady();
  const seller = numericId(sellerId, 'seller id');
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(String(limit), 10) || 50));
  const result = await pool.query(`
    select ${LISTING_COLUMNS.join(', ')}
    from listings where seller_id = $1
    order by id desc limit $2
  `, [seller, safeLimit]);
  return result.rows.map(listingView);
}

export async function createListing({ sellerId, title, server, description, price }) {
  if (!config.marketWritesEnabled) throw new Error('market writes disabled');
  await assertMarketplaceReady();
  const seller = numericId(sellerId, 'seller id');
  const safeTitle = text(title, 160, 'title');
  const safeServer = text(server, 32, 'server').toUpperCase();
  const safeDescription = optionalText(description, 2000);
  const safePrice = money(price);
  if (safePrice <= 0) throw new Error('invalid price');

  const result = await pool.query(`
    insert into listings (seller_id, title, server, description, price, status, order_id, created_at, updated_at)
    values ($1, $2, $3, $4, $5::numeric, 'active', null, now(), now())
    returning ${LISTING_COLUMNS.join(', ')}
  `, [seller, safeTitle, safeServer, safeDescription, moneyParam(safePrice)]);
  return listingView(result.rows[0]);
}

export async function cancelListing({ sellerId, listingId }) {
  if (!config.marketWritesEnabled) throw new Error('market writes disabled');
  await assertMarketplaceReady();
  const seller = numericId(sellerId, 'seller id');
  const listing = numericId(listingId, 'listing id');
  const result = await pool.query(`
    update listings
    set status = 'cancelled', updated_at = now()
    where id = $1 and seller_id = $2 and status = 'active'
    returning ${LISTING_COLUMNS.join(', ')}
  `, [listing, seller]);
  if (!result.rowCount) throw new Error('listing not cancellable');
  return listingView(result.rows[0]);
}

export async function purchaseListing({ buyerId, listingId, idempotencyKey }) {
  if (!config.marketWritesEnabled) throw new Error('market writes disabled');
  if (!config.financeWritesEnabled) throw new Error('finance writes disabled');
  if (!config.escrowApiEnabled) throw new Error('escrow api disabled');
  await assertMarketplaceReady();

  const buyer = numericId(buyerId, 'buyer id');
  const listingIdText = numericId(listingId, 'listing id');
  const key = text(idempotencyKey, 128, 'idempotency key');
  const client = await pool.connect();

  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`listing-purchase:${key}`]);

    const existing = await client.query('select * from orders where idempotency_key = $1 for update', [key]);
    if (existing.rowCount) {
      const row = existing.rows[0];
      if (String(row.buyer_id) !== buyer || String(row.listing_id) !== listingIdText) throw new Error('idempotency key conflict');
      await client.query('commit');
      return orderView(row);
    }

    const listingResult = await client.query('select * from listings where id = $1 for update', [listingIdText]);
    if (!listingResult.rowCount) throw new Error('listing not found');
    const listing = listingResult.rows[0];
    if (listing.status !== 'active') throw new Error('listing not available');
    if (String(listing.seller_id) === buyer) throw new Error('buyer and seller must differ');

    const settlement = buildEscrowSettlement(listing.price, config.commissionRate);
    const walletResult = await client.query(
      'select user_id, available_balance, held_balance from wallets where user_id = $1 for update',
      [buyer],
    );
    if (!walletResult.rowCount) throw new Error('wallet not found');
    if (money(walletResult.rows[0].available_balance) < settlement.buyerDebit) throw new Error('insufficient balance');

    await client.query(`
      update wallets
      set available_balance = available_balance - $2::numeric,
          held_balance = held_balance + $2::numeric,
          updated_at = now()
      where user_id = $1
    `, [buyer, moneyParam(settlement.buyerDebit)]);

    const orderResult = await client.query(`
      insert into orders (
        listing_id, buyer_id, seller_id, amount, commission_rate, commission_amount, seller_net,
        escrow_state, idempotency_key, created_at, updated_at
      ) values ($1,$2,$3,$4::numeric,$5::numeric,$6::numeric,$7::numeric,$8,$9,now(),now())
      returning *
    `, [
      listing.id,
      buyer,
      listing.seller_id,
      moneyParam(settlement.heldAmount),
      String(settlement.commissionRate),
      moneyParam(settlement.platformCredit),
      moneyParam(settlement.sellerCredit),
      ESCROW_STATES.HELD,
      key,
    ]);
    const order = orderResult.rows[0];

    await client.query(`
      insert into wallet_transactions (order_id, user_id, kind, available_delta, held_delta, created_at)
      values ($1,$2,'escrow_hold',$3::numeric,$4::numeric,now())
    `, [order.id, buyer, moneyParam(-settlement.buyerDebit), moneyParam(settlement.heldAmount)]);

    await client.query(`
      update listings set status = 'reserved', order_id = $2, updated_at = now()
      where id = $1
    `, [listing.id, order.id]);

    await client.query('commit');
    return orderView(order);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function syncListingForOrder(orderId) {
  if (!pool) return null;
  const id = numericId(orderId, 'order id');
  const result = await pool.query('select id, listing_id, escrow_state from orders where id = $1 limit 1', [id]);
  if (!result.rowCount || result.rows[0].listing_id == null) return null;
  const order = result.rows[0];
  let target = null;
  let orderLink = order.id;
  if (order.escrow_state === ESCROW_STATES.RELEASED) target = 'sold';
  if (order.escrow_state === ESCROW_STATES.REFUNDED) {
    target = 'active';
    orderLink = null;
  }
  if (!target) return null;
  const updated = await pool.query(`
    update listings set status = $2, order_id = $3, updated_at = now()
    where id = $1
    returning ${LISTING_COLUMNS.join(', ')}
  `, [order.listing_id, target, orderLink]);
  return listingView(updated.rows[0]);
}
