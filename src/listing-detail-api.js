import { Router } from 'express';
import { pool } from './db.js';

export const listingDetailRouter = Router();

const LISTING_COLUMNS = ['id', 'seller_id', 'title', 'server', 'description', 'price', 'status', 'created_at', 'updated_at'];
const ORDER_COLUMNS = ['seller_id', 'escrow_state', 'created_at', 'updated_at'];
const OPTIONAL_TABLES = {
  item_catalog: ['id', 'canonical_name', 'slug', 'image_url', 'class_info', 'base_attributes'],
  listing_item_metadata: ['listing_id', 'item_id', 'enhancement', 'reverse', 'delivery_window', 'attributes'],
  listing_price_history: ['listing_id', 'price', 'source', 'recorded_at'],
  listing_offers: ['listing_id', 'amount', 'status', 'created_at'],
};
const RANGE_DAYS = { weekly: 7, monthly: 30, yearly: 365 };
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
  return match ? Number(match[1]) : null;
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function publicImageUrl(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  if (text.startsWith('/') && !text.startsWith('//')) return text.slice(0, 500);
  try {
    const url = new URL(text);
    return url.protocol === 'https:' ? url.toString().slice(0, 500) : null;
  } catch {
    return null;
  }
}

function hasColumns(tables, table, columns) {
  const existing = tables.get(table);
  return Boolean(existing && columns.every((column) => existing.has(column)));
}

function tableFeature(tables, table, columns) {
  if (!tables.has(table)) return { ready: false, blockers: [`missing_table:${table}`] };
  const blockers = columns.filter((column) => !tables.get(table).has(column)).map((column) => `missing_column:${table}.${column}`);
  return { ready: blockers.length === 0, blockers };
}

export async function detectListingDetailCompatibility({ force = false } = {}) {
  if (!pool) return { ready: false, blockers: ['DATABASE_URL missing'], features: {} };
  if (!force && compatibilityCache && Date.now() - compatibilityCachedAt < CACHE_MS) return compatibilityCache;

  const tableNames = ['listings', 'orders', ...Object.keys(OPTIONAL_TABLES)];
  const result = await pool.query(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = any($1::text[])
  `, [tableNames]);
  const tables = new Map();
  for (const row of result.rows) {
    if (!tables.has(row.table_name)) tables.set(row.table_name, new Set());
    tables.get(row.table_name).add(row.column_name);
  }

  const blockers = [];
  if (!tables.has('listings')) blockers.push('missing_table:listings');
  if (!tables.has('orders')) blockers.push('missing_table:orders');
  for (const column of LISTING_COLUMNS) {
    if (!tables.get('listings')?.has(column)) blockers.push(`missing_column:listings.${column}`);
  }
  for (const column of ORDER_COLUMNS) {
    if (!tables.get('orders')?.has(column)) blockers.push(`missing_column:orders.${column}`);
  }

  const catalog = tableFeature(tables, 'item_catalog', OPTIONAL_TABLES.item_catalog);
  const metadata = tableFeature(tables, 'listing_item_metadata', OPTIONAL_TABLES.listing_item_metadata);
  const history = tableFeature(tables, 'listing_price_history', OPTIONAL_TABLES.listing_price_history);
  const offers = tableFeature(tables, 'listing_offers', OPTIONAL_TABLES.listing_offers);
  const features = {
    itemMetadataReady: catalog.ready && metadata.ready,
    priceHistoryReady: history.ready,
    offerStatsReady: offers.ready,
  };

  compatibilityCache = {
    ready: blockers.length === 0,
    blockers: [...new Set(blockers)],
    features,
    optionalBlockers: [...new Set([...catalog.blockers, ...metadata.blockers, ...history.blockers, ...offers.blockers])],
  };
  compatibilityCachedAt = Date.now();
  return compatibilityCache;
}

async function assertReady() {
  if (!pool) throw new Error('database unavailable');
  const status = await detectListingDetailCompatibility();
  if (!status.ready) throw new Error(`listing detail schema incompatible: ${status.blockers.join(', ')}`);
  return status;
}

async function readMetadata(listingId, compatibility) {
  if (!compatibility.features?.itemMetadataReady) return null;
  const result = await pool.query(`
    select
      m.enhancement, m.reverse, m.delivery_window, m.attributes,
      c.id as catalog_id, c.canonical_name, c.image_url, c.class_info, c.base_attributes
    from listing_item_metadata m
    left join item_catalog c on c.id = m.item_id
    where m.listing_id = $1
    limit 1
  `, [listingId]);
  if (!result.rowCount) return null;
  const row = result.rows[0];
  return {
    catalogId: row.catalog_id == null ? null : String(row.catalog_id),
    canonicalName: row.canonical_name || null,
    imageUrl: publicImageUrl(row.image_url),
    classInfo: row.class_info || null,
    enhancement: row.enhancement == null ? null : Number(row.enhancement),
    reverse: row.reverse == null ? null : Boolean(row.reverse),
    deliveryWindow: row.delivery_window || null,
    attributes: { ...objectValue(row.base_attributes), ...objectValue(row.attributes) },
  };
}

export async function getListingDetail(listingId) {
  const compatibility = await assertReady();
  const id = numericId(listingId, 'listing id');
  const listingResult = await pool.query(`
    select id, seller_id, title, server, description, price, status, created_at, updated_at
    from listings
    where id = $1
    limit 1
  `, [id]);
  if (!listingResult.rowCount) throw new Error('listing not found');

  const row = listingResult.rows[0];
  const [sellerResult, metadata] = await Promise.all([
    pool.query(`
      select
        count(*) filter (where escrow_state = 'released')::int as successful_sales,
        round(avg(extract(epoch from (updated_at - created_at)) / 60)
          filter (where escrow_state = 'released'))::int as avg_completion_minutes
      from orders
      where seller_id = $1
    `, [row.seller_id]),
    readMetadata(id, compatibility),
  ]);
  const seller = sellerResult.rows[0] || {};
  const parsedEnhancement = parseEnhancement(row.title);
  const enhancement = metadata?.enhancement ?? parsedEnhancement;

  return {
    id: String(row.id),
    sellerId: String(row.seller_id),
    title: row.title,
    server: row.server,
    description: row.description || '',
    price: Number(row.price),
    status: row.status,
    enhancement: enhancement == null ? null : `+${enhancement}`,
    enhancementLevel: enhancement,
    enhancementLabel: enhancement == null ? null : `+${enhancement}`,
    reverse: metadata?.reverse ?? null,
    deliveryWindow: metadata?.deliveryWindow ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    item: metadata ? {
      catalogId: metadata.catalogId,
      canonicalName: metadata.canonicalName,
      imageUrl: metadata.imageUrl,
      classInfo: metadata.classInfo,
      attributes: metadata.attributes,
    } : null,
    seller: {
      id: String(row.seller_id),
      displayName: `Satıcı #${row.seller_id}`,
      verified: null,
      successfulSales: Number(seller.successful_sales || 0),
      averageCompletionMinutes: seller.avg_completion_minutes == null ? null : Number(seller.avg_completion_minutes),
    },
    statistics: {
      historyReady: Boolean(compatibility.features?.priceHistoryReady),
      offersReady: Boolean(compatibility.features?.offerStatsReady),
      currentPrice: Number(row.price),
      periods: Object.keys(RANGE_DAYS),
    },
  };
}

function priceSummary(points, currentPrice) {
  const values = points.map((point) => Number(point.price)).filter(Number.isFinite);
  if (!values.length) return { count: 0, min: null, max: null, average: null, changePercent: null };
  const first = values[0];
  const last = values[values.length - 1];
  const changePercent = first > 0 ? Math.round((((last - first) / first) * 100 + Number.EPSILON) * 100) / 100 : null;
  return {
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    average: Math.round((values.reduce((sum, value) => sum + value, 0) / values.length + Number.EPSILON) * 100) / 100,
    changePercent,
    current: Number(currentPrice),
  };
}

export async function getListingStatistics(listingId, range = 'weekly') {
  const compatibility = await assertReady();
  const id = numericId(listingId, 'listing id');
  const safeRange = Object.prototype.hasOwnProperty.call(RANGE_DAYS, range) ? range : 'weekly';
  const days = RANGE_DAYS[safeRange];
  const current = await pool.query('select id, price from listings where id = $1 limit 1', [id]);
  if (!current.rowCount) throw new Error('listing not found');
  const currentPrice = Number(current.rows[0].price);

  let priceHistory = [];
  if (compatibility.features?.priceHistoryReady) {
    const history = await pool.query(`
      select price, source, recorded_at
      from listing_price_history
      where listing_id = $1 and recorded_at >= now() - ($2::int * interval '1 day')
      order by recorded_at asc, id asc
      limit 1000
    `, [id, days]);
    priceHistory = history.rows.map((row) => ({
      price: Number(row.price),
      source: row.source,
      recordedAt: row.recorded_at,
    }));
  }

  let offerHistory = [];
  let offersSummary = { count: 0, openCount: 0, acceptedCount: 0, averageAmount: null, minAmount: null, maxAmount: null };
  if (compatibility.features?.offerStatsReady) {
    const [offers, daily] = await Promise.all([
      pool.query(`
        select
          count(*)::int as count,
          count(*) filter (where status = 'open')::int as open_count,
          count(*) filter (where status = 'accepted')::int as accepted_count,
          round(avg(amount), 2) as average_amount,
          min(amount) as min_amount,
          max(amount) as max_amount
        from listing_offers
        where listing_id = $1 and created_at >= now() - ($2::int * interval '1 day')
      `, [id, days]),
      pool.query(`
        select date_trunc('day', created_at) as bucket, round(avg(amount), 2) as average_amount, count(*)::int as count
        from listing_offers
        where listing_id = $1 and created_at >= now() - ($2::int * interval '1 day')
        group by date_trunc('day', created_at)
        order by bucket asc
      `, [id, days]),
    ]);
    const summary = offers.rows[0] || {};
    offersSummary = {
      count: Number(summary.count || 0),
      openCount: Number(summary.open_count || 0),
      acceptedCount: Number(summary.accepted_count || 0),
      averageAmount: summary.average_amount == null ? null : Number(summary.average_amount),
      minAmount: summary.min_amount == null ? null : Number(summary.min_amount),
      maxAmount: summary.max_amount == null ? null : Number(summary.max_amount),
    };
    offerHistory = daily.rows.map((row) => ({ date: row.bucket, averageAmount: Number(row.average_amount), count: Number(row.count) }));
  }

  return {
    range: safeRange,
    days,
    currentPrice,
    historyReady: Boolean(compatibility.features?.priceHistoryReady),
    offersReady: Boolean(compatibility.features?.offerStatsReady),
    priceHistory,
    priceSummary: priceSummary(priceHistory, currentPrice),
    offerHistory,
    offersSummary,
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

listingDetailRouter.get('/market/listings/:listingId/stats', async (req, res) => {
  try {
    const statistics = await getListingStatistics(req.params.listingId, String(req.query.range || 'weekly'));
    return res.json({ ok: true, statistics });
  } catch (error) {
    return errorResponse(res, error);
  }
});
