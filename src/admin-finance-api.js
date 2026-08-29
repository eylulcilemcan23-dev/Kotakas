import { Router } from 'express';
import { config } from './config.js';
import { pool } from './db.js';
import { requirePermission } from './authz.js';
import { PERMISSIONS } from './roles.js';
import { detectFinanceWriteCompatibility } from './finance-write-adapter.js';
import { detectMarketplaceCompatibility } from './marketplace.js';

export const adminFinanceApiRouter = Router();

const ORDER_STATES = new Set(['held', 'released', 'refunded']);

export function normalizeAdminLimit(value, fallback = 30) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(1, parsed));
}

export function normalizeOrderState(value) {
  const state = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return ORDER_STATES.has(state) ? state : '';
}

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0;
}

async function assertFinanceReadReady() {
  if (!pool) throw new Error('database unavailable');
  const status = await detectFinanceWriteCompatibility();
  if (!status.ready) throw new Error(`finance schema incompatible: ${status.blockers.join(', ')}`);
}

export async function getFinanceSummary() {
  await assertFinanceReadReady();

  const [wallets, orders, commissions] = await Promise.all([
    pool.query(`
      select
        coalesce(sum(available_balance), 0)::text as available_total,
        coalesce(sum(held_balance), 0)::text as held_total,
        count(*)::int as wallet_count
      from wallets
    `),
    pool.query(`
      select
        count(*) filter (where escrow_state = 'held')::int as held_count,
        coalesce(sum(amount) filter (where escrow_state = 'held'), 0)::text as held_amount,
        count(*) filter (where escrow_state = 'released')::int as released_count,
        coalesce(sum(amount) filter (where escrow_state = 'released'), 0)::text as released_amount,
        count(*) filter (where escrow_state = 'refunded')::int as refunded_count,
        coalesce(sum(amount) filter (where escrow_state = 'refunded'), 0)::text as refunded_amount
      from orders
    `),
    pool.query(`
      select
        count(*)::int as commission_count,
        coalesce(sum(amount), 0)::text as commission_total,
        coalesce(sum(amount) filter (where created_at >= date_trunc('day', now())), 0)::text as commission_today,
        coalesce(sum(amount) filter (where created_at >= now() - interval '7 days'), 0)::text as commission_7d
      from commissions
    `),
  ]);

  const w = wallets.rows[0] || {};
  const o = orders.rows[0] || {};
  const c = commissions.rows[0] || {};
  return {
    wallets: {
      count: Number(w.wallet_count || 0),
      availableTotal: money(w.available_total),
      heldTotal: money(w.held_total),
    },
    orders: {
      heldCount: Number(o.held_count || 0),
      heldAmount: money(o.held_amount),
      releasedCount: Number(o.released_count || 0),
      releasedAmount: money(o.released_amount),
      refundedCount: Number(o.refunded_count || 0),
      refundedAmount: money(o.refunded_amount),
    },
    commissions: {
      count: Number(c.commission_count || 0),
      total: money(c.commission_total),
      today: money(c.commission_today),
      last7Days: money(c.commission_7d),
    },
    controls: {
      financeWritesEnabled: config.financeWritesEnabled,
      escrowApiEnabled: config.escrowApiEnabled,
      marketWritesEnabled: config.marketWritesEnabled,
    },
  };
}

export async function listFinanceOrders({ state = '', limit = 30 } = {}) {
  await assertFinanceReadReady();
  const safeState = normalizeOrderState(state);
  const safeLimit = normalizeAdminLimit(limit);
  const market = await detectMarketplaceCompatibility().catch(() => ({ ready: false }));
  const params = [];
  let where = '';
  if (safeState) {
    params.push(safeState);
    where = `where o.escrow_state = $${params.length}`;
  }
  params.push(safeLimit);

  const listingFields = market.ready
    ? ', l.title as listing_title, l.server as listing_server, l.status as listing_status'
    : ", null::text as listing_title, null::text as listing_server, null::text as listing_status";
  const listingJoin = market.ready ? 'left join listings l on l.id = o.listing_id' : '';

  const result = await pool.query(`
    select
      o.id, o.buyer_id, o.seller_id, o.amount, o.commission_rate,
      o.commission_amount, o.seller_net, o.escrow_state,
      o.created_at, o.updated_at
      ${listingFields}
    from orders o
    ${listingJoin}
    ${where}
    order by o.id desc
    limit $${params.length}
  `, params);

  return result.rows.map((row) => ({
    id: String(row.id),
    buyerId: String(row.buyer_id),
    sellerId: String(row.seller_id),
    amount: money(row.amount),
    commissionRate: Number(row.commission_rate || 0),
    commissionAmount: money(row.commission_amount),
    sellerNet: money(row.seller_net),
    escrowState: row.escrow_state,
    listingTitle: row.listing_title || '',
    listingServer: row.listing_server || '',
    listingStatus: row.listing_status || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function listCommissions({ limit = 30 } = {}) {
  await assertFinanceReadReady();
  const safeLimit = normalizeAdminLimit(limit);
  const result = await pool.query(`
    select c.id, c.order_id, c.amount, c.rate, c.created_at,
           o.buyer_id, o.seller_id, o.amount as order_amount
    from commissions c
    join orders o on o.id = c.order_id
    order by c.id desc
    limit $1
  `, [safeLimit]);

  return result.rows.map((row) => ({
    id: String(row.id),
    orderId: String(row.order_id),
    buyerId: String(row.buyer_id),
    sellerId: String(row.seller_id),
    orderAmount: money(row.order_amount),
    amount: money(row.amount),
    rate: Number(row.rate || 0),
    createdAt: row.created_at,
  }));
}

function adminFinanceError(res, error) {
  const message = String(error?.message || 'admin_finance_error');
  if (message.includes('schema incompatible') || message.includes('database unavailable')) {
    return res.status(503).json({ ok: false, error: 'finance_temporarily_unavailable' });
  }
  console.error('[KOTAKAS] admin finance error:', message);
  return res.status(503).json({ ok: false, error: 'finance_temporarily_unavailable' });
}

adminFinanceApiRouter.get('/admin/finance/summary', requirePermission(PERMISSIONS.FINANCE), async (_req, res) => {
  try {
    return res.json({ ok: true, summary: await getFinanceSummary() });
  } catch (error) {
    return adminFinanceError(res, error);
  }
});

adminFinanceApiRouter.get('/admin/finance/orders', requirePermission(PERMISSIONS.FINANCE), async (req, res) => {
  try {
    const orders = await listFinanceOrders({ state: req.query.state, limit: req.query.limit });
    return res.json({ ok: true, orders });
  } catch (error) {
    return adminFinanceError(res, error);
  }
});

adminFinanceApiRouter.get('/admin/finance/commissions', requirePermission(PERMISSIONS.COMMISSION), async (req, res) => {
  try {
    const commissions = await listCommissions({ limit: req.query.limit });
    return res.json({ ok: true, commissions });
  } catch (error) {
    return adminFinanceError(res, error);
  }
});
