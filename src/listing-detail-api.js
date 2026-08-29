import { Router } from 'express';
import { pool } from './db.js';

export const listingDetailRouter = Router();

const LISTING_COLUMNS = ['id', 'seller_id', 'title', 'server', 'description', 'price', 'status', 'created_at', 'updated_at'];
const ORDER_COLUMNS = ['seller_id', 'escrow_state', 'created_at', 'updated_at'];
let compatibilityCache = null;
let compatibilityCachedAt = 0;
const CACHE_MS = 60_000;

function numericId(value, label = 'id') {
  const text = value == null ? '' : String(value);
  if (!/^\d+$/.test(text)) throw new Error(`invalid ${label}`);
  return text;
}

function parseEnhancement(title = '') {
  const match = String(title).match(/\+\s*(\d{1,2})\b/);
  return match ? `+${match[1]}` : null;
}

export async function detectListingDetailCompatibility({ force = false } = {}) {
  if (!pool) return { ready: false, blockers: ['DATABASE_URL missing'] };
  if (!force && compatibilityCache && Date.now() - compatibilityCachedAt < CACHE_MS) return compatibilityCache;

  const result = await pool.query(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public' and table_name in ('listings','orders')
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
  for (const column of ORDER_COLUMNS) {
    if (!tables.get('orders')?.has(column)) blockers.push(`missing_column:orders.${column}`);
  }
  for (const table of ['listings', 'orders']) {
    if (!tables.has(table)) blockers.push(`missing_table:${table}`);
  }

  compatibilityCache = { ready: blockers.length === 0, blockers: [...new Set(blockers)] };
  compatibilityCachedAt = Date.now();
  return compatibilityCache;
}

async function assertReady() {
  if (!pool) throw new Error('database unavailable');
  const status = await detectListingDetailCompatibility();
  if (!status.ready) throw new Error(`listing detail schema incompatible: ${status.blockers.join(', ')}`);
}

export async function getListingDetail(listingId) {
  await assertReady();
  const id = numericId(listingId, 'listing id');
  const listingResult = await pool.query(`
    select id, seller_id, title, server, description, price, status, created_at, updated_at
    from listings
    where id = $1
    limit 1
  `, [id]);
  if (!listingResult.rowCount) throw new Error('listing not found');

  const row = listingResult.rows[0];
  const sellerResult = await pool.query(`
    select
      count(*) filter (where escrow_state = 'released')::int as successful_sales,
      round(avg(extract(epoch from (updated_at - created_at)) / 60)
        filter (where escrow_state = 'released'))::int as avg_completion_minutes
    from orders
    where seller_id = $1
  `, [row.seller_id]);
  const seller = sellerResult.rows[0] || {};

  return {
    id: String(row.id),
    sellerId: String(row.seller_id),
    title: row.title,
    server: row.server,
    description: row.description || '',
    price: Number(row.price),
    status: row.status,
    enhancement: parseEnhancement(row.title),
    reverse: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    seller: {
      id: String(row.seller_id),
      displayName: `Satıcı #${row.seller_id}`,
      verified: null,
      successfulSales: Number(seller.successful_sales || 0),
      averageCompletionMinutes: seller.avg_completion_minutes == null ? null : Number(seller.avg_completion_minutes),
    },
    statistics: {
      historyReady: false,
      currentPrice: Number(row.price),
      periods: ['weekly', 'monthly', 'yearly'],
    },
  };
}

function errorResponse(res, error) {
  const message = String(error?.message || 'listing_detail_error');
  if (message.includes('not found')) return res.status(404).json({ ok: false, error: 'listing_not_found' });
  if (message.includes('invalid')) return res.status(400).json({ ok: false, error: 'invalid_listing_request' });
  if (message.includes('schema incompatible') || message.includes('database unavailable')) {
    return res.status(503).json({ ok: false, error: 'listing_detail_temporarily_unavailable' });
  }
  console.error('[KOTAKAS] listing detail api error:', message);
  return res.status(503).json({ ok: false, error: 'listing_detail_temporarily_unavailable' });
}

listingDetailRouter.get('/market/listings/:listingId/detail', async (req, res) => {
  try {
    const listing = await getListingDetail(req.params.listingId);
    return res.json({ ok: true, listing });
  } catch (error) {
    return errorResponse(res, error);
  }
});
