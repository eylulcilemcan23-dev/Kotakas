import { Router } from 'express';
import { pool } from './db.js';
import { requireAuthenticated } from './authz.js';

export const traderAnalyticsRouter = Router();

const REQUIRED = Object.freeze({
  orders: ['id', 'listing_id', 'seller_id', 'amount', 'commission_amount', 'seller_net', 'escrow_state', 'updated_at'],
  listings: ['id', 'seller_id', 'title', 'server', 'price', 'status'],
});

let compatibilityCache = null;
let compatibilityCachedAt = 0;
const CACHE_MS = 60_000;

function numericId(value, label = 'id') {
  const text = value == null ? '' : String(value);
  if (!/^\d+$/.test(text)) throw new Error(`invalid ${label}`);
  return text;
}

function actor(req) {
  const user = req.user || req.auth || {};
  return { id: user.id == null ? null : String(user.id), role: String(user.role || 'user') };
}

function ensureTrader(role) {
  if (String(role) !== 'trader') throw new Error('trader role required');
}

export function normalizeAnalyticsRange(value) {
  const parsed = Number.parseInt(String(value ?? 30), 10);
  return [7, 30, 90].includes(parsed) ? parsed : 30;
}

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function percent(numerator, denominator) {
  const den = Number(denominator || 0);
  if (den <= 0) return 0;
  return round2((Number(numerator || 0) / den) * 100);
}

export async function detectTraderAnalyticsCompatibility({ force = false } = {}) {
  if (!pool) return { ready: false, blockers: ['DATABASE_URL missing'] };
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
  compatibilityCache = { ready: blockers.length === 0, blockers: [...new Set(blockers)] };
  compatibilityCachedAt = Date.now();
  return compatibilityCache;
}

async function assertReady() {
  if (!pool) throw new Error('database unavailable');
  const status = await detectTraderAnalyticsCompatibility();
  if (!status.ready) throw new Error(`trader analytics schema incompatible: ${status.blockers.join(', ')}`);
}

export async function getTraderAnalytics({ traderId, role, range = 30 }) {
  ensureTrader(role);
  await assertReady();
  const trader = numericId(traderId, 'trader id');
  const rangeDays = normalizeAnalyticsRange(range);

  const [periodResult, stockResult, seriesResult, topResult] = await Promise.all([
    pool.query(`
      select
        count(*) filter (where escrow_state='released')::int as completed,
        count(*) filter (where escrow_state='refunded')::int as refunded,
        count(*) filter (where escrow_state='held')::int as pending,
        coalesce(sum(amount) filter (where escrow_state='released'),0)::numeric as gross,
        coalesce(sum(commission_amount) filter (where escrow_state='released'),0)::numeric as commission,
        coalesce(sum(seller_net) filter (where escrow_state='released'),0)::numeric as net,
        coalesce(avg(amount) filter (where escrow_state='released'),0)::numeric as average_order
      from orders
      where seller_id=$1 and updated_at::date >= current_date - ($2::int - 1)
    `, [trader, rangeDays]),
    pool.query(`
      select
        count(*) filter (where status='active')::int as active_count,
        coalesce(sum(price) filter (where status='active'),0)::numeric as active_value
      from listings where seller_id=$1
    `, [trader]),
    pool.query(`
      with days as (
        select generate_series(current_date - ($2::int - 1), current_date, interval '1 day')::date as day
      ), agg as (
        select updated_at::date as day,
          count(*) filter (where escrow_state='released')::int as sales,
          coalesce(sum(amount) filter (where escrow_state='released'),0)::numeric as gross,
          coalesce(sum(commission_amount) filter (where escrow_state='released'),0)::numeric as commission,
          coalesce(sum(seller_net) filter (where escrow_state='released'),0)::numeric as net
        from orders
        where seller_id=$1 and updated_at::date >= current_date - ($2::int - 1)
        group by updated_at::date
      )
      select to_char(days.day,'YYYY-MM-DD') as day,
        coalesce(agg.sales,0)::int as sales,
        coalesce(agg.gross,0)::numeric as gross,
        coalesce(agg.commission,0)::numeric as commission,
        coalesce(agg.net,0)::numeric as net
      from days left join agg using(day)
      order by days.day
    `, [trader, rangeDays]),
    pool.query(`
      select
        coalesce(l.title, 'İlan #' || o.listing_id::text) as title,
        coalesce(l.server,'') as server,
        count(*)::int as sales,
        coalesce(sum(o.amount),0)::numeric as gross,
        coalesce(sum(o.commission_amount),0)::numeric as commission,
        coalesce(sum(o.seller_net),0)::numeric as net
      from orders o
      left join listings l on l.id=o.listing_id
      where o.seller_id=$1 and o.escrow_state='released'
        and o.updated_at::date >= current_date - ($2::int - 1)
      group by coalesce(l.title, 'İlan #' || o.listing_id::text), coalesce(l.server,'')
      order by gross desc, sales desc
      limit 5
    `, [trader, rangeDays]),
  ]);

  const p = periodResult.rows[0] || {};
  const stock = stockResult.rows[0] || {};
  const completed = Number(p.completed || 0);
  const refunded = Number(p.refunded || 0);
  const gross = Number(p.gross || 0);
  const commission = Number(p.commission || 0);
  const net = Number(p.net || 0);
  const series = seriesResult.rows.map((row) => ({
    day: row.day,
    sales: Number(row.sales || 0),
    gross: Number(row.gross || 0),
    commission: Number(row.commission || 0),
    net: Number(row.net || 0),
  }));
  const best = series.reduce((current, row) => row.gross > (current?.gross || 0) ? row : current, null);

  return {
    rangeDays,
    period: {
      completedSales: completed,
      refundedSales: refunded,
      pendingSales: Number(p.pending || 0),
      grossRevenue: round2(gross),
      commissionPaid: round2(commission),
      netEarnings: round2(net),
      averageOrderValue: round2(p.average_order),
      completionRate: percent(completed, completed + refunded),
      netMarginRate: percent(net, gross),
      effectiveCommissionRate: percent(commission, gross),
      activeListings: Number(stock.active_count || 0),
      activeStockValue: round2(stock.active_value),
    },
    bestDay: best && best.gross > 0 ? best : null,
    series,
    topItems: topResult.rows.map((row) => ({
      title: row.title,
      server: row.server,
      sales: Number(row.sales || 0),
      gross: Number(row.gross || 0),
      commission: Number(row.commission || 0),
      net: Number(row.net || 0),
    })),
  };
}

function analyticsError(res, error) {
  const message = String(error?.message || 'trader_analytics_error');
  if (message.includes('trader role required')) return res.status(403).json({ ok: false, error: 'trader_only' });
  if (message.includes('invalid')) return res.status(400).json({ ok: false, error: 'invalid_trader' });
  if (message.includes('database unavailable') || message.includes('schema incompatible')) {
    return res.status(503).json({ ok: false, error: 'trader_analytics_temporarily_unavailable' });
  }
  console.error('[KOTAKAS] trader analytics error:', message);
  return res.status(503).json({ ok: false, error: 'trader_analytics_temporarily_unavailable' });
}

traderAnalyticsRouter.get('/trader/analytics', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try {
    const analytics = await getTraderAnalytics({ traderId: user.id, role: user.role, range: req.query.range });
    return res.json({ ok: true, analytics });
  } catch (error) {
    return analyticsError(res, error);
  }
});
