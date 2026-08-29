import { Router } from 'express';
import { config } from './config.js';
import { pool } from './db.js';
import { requireAuthenticated } from './authz.js';

export const traderDashboardRouter = Router();

const TABLE_REQUIREMENTS = Object.freeze({
  wallets: ['user_id', 'available_balance', 'held_balance', 'updated_at'],
  listings: ['id', 'seller_id', 'title', 'server', 'price', 'status', 'created_at', 'updated_at'],
  orders: ['id', 'listing_id', 'seller_id', 'amount', 'commission_amount', 'seller_net', 'escrow_state', 'created_at', 'updated_at'],
  listing_offers: ['id', 'listing_id', 'amount', 'status', 'created_at', 'updated_at'],
  listing_questions: ['id', 'listing_id', 'seller_id', 'question_code', 'answer_code', 'status', 'created_at', 'updated_at'],
  swap_requests: ['id', 'proposer_id', 'recipient_id', 'offered_listing_id', 'requested_listing_id', 'status', 'created_at', 'updated_at'],
});

let compatibilityCache = null;
let compatibilityCachedAt = 0;
const CACHE_MS = 60_000;

function numericId(value, label = 'id') {
  const text = value == null ? '' : String(value);
  if (!/^\d+$/.test(text)) throw new Error(`invalid ${label}`);
  return text;
}

function safeLimit(value, fallback = 12) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(50, Math.max(1, parsed));
}

function actor(req) {
  const user = req.user || req.auth || {};
  return {
    id: user.id == null ? null : String(user.id),
    role: String(user.role || 'user'),
  };
}

function ensureTraderRole(role) {
  if (String(role) !== 'trader') throw new Error('trader role required');
}

function tableReady(tables, table) {
  return TABLE_REQUIREMENTS[table].every((column) => tables.get(table)?.has(column));
}

export async function detectTraderDashboardCompatibility({ force = false } = {}) {
  if (!pool) return { ready: false, sections: {}, blockers: ['DATABASE_URL missing'] };
  if (!force && compatibilityCache && Date.now() - compatibilityCachedAt < CACHE_MS) return compatibilityCache;

  const result = await pool.query(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = any($1::text[])
  `, [Object.keys(TABLE_REQUIREMENTS)]);

  const tables = new Map();
  for (const row of result.rows) {
    if (!tables.has(row.table_name)) tables.set(row.table_name, new Set());
    tables.get(row.table_name).add(row.column_name);
  }

  const sections = {};
  const blockers = [];
  for (const table of Object.keys(TABLE_REQUIREMENTS)) {
    sections[table] = tableReady(tables, table);
    if (!sections[table]) blockers.push(`schema_not_ready:${table}`);
  }

  compatibilityCache = {
    ready: Boolean(sections.listings && sections.orders && sections.wallets),
    sections,
    blockers,
  };
  compatibilityCachedAt = Date.now();
  return compatibilityCache;
}

function listingView(row) {
  return {
    id: String(row.id),
    title: row.title,
    server: row.server,
    price: Number(row.price || 0),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function saleView(row) {
  return {
    id: String(row.id),
    listingId: row.listing_id == null ? null : String(row.listing_id),
    title: row.title || 'İlan',
    server: row.server || '',
    amount: Number(row.amount || 0),
    commissionAmount: Number(row.commission_amount || 0),
    sellerNet: Number(row.seller_net || 0),
    escrowState: row.escrow_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function offerView(row) {
  return {
    id: String(row.id),
    listingId: String(row.listing_id),
    listingTitle: row.title || 'İlan',
    server: row.server || '',
    listingPrice: Number(row.listing_price || 0),
    amount: Number(row.amount || 0),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function questionView(row) {
  return {
    id: String(row.id),
    listingId: String(row.listing_id),
    listingTitle: row.title || 'İlan',
    server: row.server || '',
    questionCode: row.question_code,
    answerCode: row.answer_code || null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function swapView(row) {
  return {
    id: String(row.id),
    status: row.status,
    offeredListing: {
      id: String(row.offered_listing_id),
      title: row.offered_title || 'İlan',
      server: row.offered_server || '',
      price: Number(row.offered_price || 0),
    },
    requestedListing: {
      id: String(row.requested_listing_id),
      title: row.requested_title || 'İlan',
      server: row.requested_server || '',
      price: Number(row.requested_price || 0),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getTraderDashboard({ traderId, role, limit = 12 }) {
  if (!pool) throw new Error('database unavailable');
  ensureTraderRole(role);
  const trader = numericId(traderId, 'trader id');
  const safe = safeLimit(limit);
  const compatibility = await detectTraderDashboardCompatibility();
  const sections = compatibility.sections || {};

  const dashboard = {
    commissionRate: Number(config.traderCommissionRate || 0),
    wallet: null,
    summary: {
      activeListings: 0,
      reservedListings: 0,
      soldListings: 0,
      swappedListings: 0,
      totalSales: 0,
      completedSales: 0,
      pendingSales: 0,
      grossRevenue: 0,
      netEarnings: 0,
      commissionPaid: 0,
      openOffers: 0,
      pendingQuestions: 0,
      pendingSwaps: 0,
    },
    listings: [],
    sales: [],
    offers: [],
    questions: [],
    swaps: [],
    readiness: {
      wallet: Boolean(sections.wallets),
      marketplace: Boolean(sections.listings && sections.orders),
      offers: Boolean(sections.listing_offers && sections.listings),
      questions: Boolean(sections.listing_questions && sections.listings),
      swaps: Boolean(sections.swap_requests && sections.listings),
    },
  };

  if (sections.wallets) {
    const walletResult = await pool.query(`
      select user_id, available_balance, held_balance, updated_at
      from wallets where user_id=$1 limit 1
    `, [trader]);
    if (walletResult.rowCount) {
      const row = walletResult.rows[0];
      dashboard.wallet = {
        availableBalance: Number(row.available_balance || 0),
        heldBalance: Number(row.held_balance || 0),
        totalBalance: Number(row.available_balance || 0) + Number(row.held_balance || 0),
        updatedAt: row.updated_at,
      };
    }
  }

  if (sections.listings) {
    const [listingSummary, listings] = await Promise.all([
      pool.query(`
        select
          count(*) filter (where status='active')::int as active,
          count(*) filter (where status='reserved')::int as reserved,
          count(*) filter (where status='sold')::int as sold,
          count(*) filter (where status='swapped')::int as swapped
        from listings where seller_id=$1
      `, [trader]),
      pool.query(`
        select id,title,server,price,status,created_at,updated_at
        from listings where seller_id=$1
        order by id desc limit $2
      `, [trader, safe]),
    ]);
    const row = listingSummary.rows[0] || {};
    dashboard.summary.activeListings = Number(row.active || 0);
    dashboard.summary.reservedListings = Number(row.reserved || 0);
    dashboard.summary.soldListings = Number(row.sold || 0);
    dashboard.summary.swappedListings = Number(row.swapped || 0);
    dashboard.listings = listings.rows.map(listingView);
  }

  if (sections.orders) {
    const [salesSummary, sales] = await Promise.all([
      pool.query(`
        select
          count(*)::int as total_sales,
          count(*) filter (where escrow_state='released')::int as completed_sales,
          count(*) filter (where escrow_state='held')::int as pending_sales,
          coalesce(sum(amount) filter (where escrow_state='released'),0)::numeric as gross_revenue,
          coalesce(sum(seller_net) filter (where escrow_state='released'),0)::numeric as net_earnings,
          coalesce(sum(commission_amount) filter (where escrow_state='released'),0)::numeric as commission_paid
        from orders where seller_id=$1
      `, [trader]),
      pool.query(`
        select o.id,o.listing_id,o.amount,o.commission_amount,o.seller_net,o.escrow_state,o.created_at,o.updated_at,
               l.title,l.server
        from orders o
        left join listings l on l.id=o.listing_id
        where o.seller_id=$1
        order by o.id desc limit $2
      `, [trader, safe]),
    ]);
    const row = salesSummary.rows[0] || {};
    dashboard.summary.totalSales = Number(row.total_sales || 0);
    dashboard.summary.completedSales = Number(row.completed_sales || 0);
    dashboard.summary.pendingSales = Number(row.pending_sales || 0);
    dashboard.summary.grossRevenue = Number(row.gross_revenue || 0);
    dashboard.summary.netEarnings = Number(row.net_earnings || 0);
    dashboard.summary.commissionPaid = Number(row.commission_paid || 0);
    dashboard.sales = sales.rows.map(saleView);
  }

  if (sections.listing_offers && sections.listings) {
    const [count, offers] = await Promise.all([
      pool.query(`
        select count(*)::int as count
        from listing_offers o join listings l on l.id=o.listing_id
        where l.seller_id=$1 and o.status='open'
      `, [trader]),
      pool.query(`
        select o.id,o.listing_id,o.amount,o.status,o.created_at,o.updated_at,
               l.title,l.server,l.price as listing_price
        from listing_offers o join listings l on l.id=o.listing_id
        where l.seller_id=$1 and o.status='open'
        order by o.id desc limit $2
      `, [trader, safe]),
    ]);
    dashboard.summary.openOffers = Number(count.rows[0]?.count || 0);
    dashboard.offers = offers.rows.map(offerView);
  }

  if (sections.listing_questions && sections.listings) {
    const [count, questions] = await Promise.all([
      pool.query(`select count(*)::int as count from listing_questions where seller_id=$1 and status='pending'`, [trader]),
      pool.query(`
        select q.id,q.listing_id,q.question_code,q.answer_code,q.status,q.created_at,q.updated_at,
               l.title,l.server
        from listing_questions q join listings l on l.id=q.listing_id
        where q.seller_id=$1 and q.status='pending'
        order by q.id desc limit $2
      `, [trader, safe]),
    ]);
    dashboard.summary.pendingQuestions = Number(count.rows[0]?.count || 0);
    dashboard.questions = questions.rows.map(questionView);
  }

  if (sections.swap_requests && sections.listings) {
    const [count, swaps] = await Promise.all([
      pool.query(`select count(*)::int as count from swap_requests where recipient_id=$1 and status='pending'`, [trader]),
      pool.query(`
        select s.id,s.status,s.offered_listing_id,s.requested_listing_id,s.created_at,s.updated_at,
               ol.title as offered_title,ol.server as offered_server,ol.price as offered_price,
               rl.title as requested_title,rl.server as requested_server,rl.price as requested_price
        from swap_requests s
        join listings ol on ol.id=s.offered_listing_id
        join listings rl on rl.id=s.requested_listing_id
        where s.recipient_id=$1 and s.status='pending'
        order by s.id desc limit $2
      `, [trader, safe]),
    ]);
    dashboard.summary.pendingSwaps = Number(count.rows[0]?.count || 0);
    dashboard.swaps = swaps.rows.map(swapView);
  }

  return dashboard;
}

function traderError(res, error) {
  const message = String(error?.message || 'trader_dashboard_error');
  if (message.includes('trader role required')) return res.status(403).json({ ok: false, error: 'trader_only' });
  if (message.includes('invalid')) return res.status(400).json({ ok: false, error: 'invalid_trader' });
  if (message.includes('database unavailable')) return res.status(503).json({ ok: false, error: 'trader_dashboard_temporarily_unavailable' });
  console.error('[KOTAKAS] trader dashboard error:', message);
  return res.status(503).json({ ok: false, error: 'trader_dashboard_temporarily_unavailable' });
}

traderDashboardRouter.get('/trader/dashboard', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try {
    const dashboard = await getTraderDashboard({ traderId: user.id, role: user.role, limit: req.query.limit });
    return res.json({ ok: true, dashboard });
  } catch (error) {
    return traderError(res, error);
  }
});
