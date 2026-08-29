import { Router } from 'express';
import { config } from './config.js';
import { pool } from './db.js';
import { requireAuthenticated, requirePermission } from './authz.js';
import { PERMISSIONS } from './roles.js';
import { refundEscrow, releaseEscrow } from './finance-write-adapter.js';
import { writeAudit, listAuditLogs, detectAuditCompatibility } from './audit-log.js';
import { createAdminNotification } from './dispute-communications.js';
import { publishDisputeResolved } from './realtime.js';

export const disputesApiRouter = Router();

const REQUIRED_COLUMNS = [
  'id', 'order_id', 'opened_by', 'reason', 'status', 'resolution', 'resolved_by',
  'created_at', 'updated_at', 'resolved_at',
];
const RESOLUTIONS = new Set(['refund', 'release', 'dismiss']);
let cache = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

function actor(req) {
  const user = req.user || req.auth || {};
  return {
    id: user.id == null ? null : String(user.id),
    role: user.role || 'user',
  };
}

function numericId(value, label = 'id') {
  const text = value == null ? '' : String(value);
  if (!/^\d+$/.test(text)) throw new Error(`invalid ${label}`);
  return text;
}

function reasonText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < 10 || text.length > 1500) throw new Error('invalid dispute reason');
  return text;
}

function disputeView(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    openedBy: String(row.opened_by),
    reason: row.reason,
    status: row.status,
    resolution: row.resolution || '',
    resolvedBy: row.resolved_by == null ? null : String(row.resolved_by),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  };
}

export async function detectDisputeCompatibility({ force = false } = {}) {
  if (!pool) return { ready: false, blockers: ['DATABASE_URL missing'] };
  if (!force && cache && Date.now() - cachedAt < CACHE_MS) return cache;
  const result = await pool.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'disputes'
  `);
  const columns = new Set(result.rows.map((row) => row.column_name));
  const blockers = [];
  if (!result.rowCount) blockers.push('missing_table:disputes');
  for (const column of REQUIRED_COLUMNS) {
    if (!columns.has(column)) blockers.push(`missing_column:disputes.${column}`);
  }
  cache = { ready: blockers.length === 0, blockers };
  cachedAt = Date.now();
  return cache;
}

async function assertDisputesReady({ writes = false } = {}) {
  if (!pool) throw new Error('database unavailable');
  if (writes && !config.disputeWritesEnabled) throw new Error('dispute writes disabled');
  const status = await detectDisputeCompatibility();
  if (!status.ready) throw new Error(`dispute schema incompatible: ${status.blockers.join(', ')}`);
}

export async function hasOpenDispute(orderId) {
  if (!pool) return false;
  const status = await detectDisputeCompatibility().catch(() => ({ ready: false }));
  if (!status.ready) return false;
  const id = numericId(orderId, 'order id');
  const result = await pool.query(`select 1 from disputes where order_id = $1 and status = 'open' limit 1`, [id]);
  return result.rowCount > 0;
}

export async function openDispute({ orderId, openedBy, reason }) {
  await assertDisputesReady({ writes: true });
  const order = numericId(orderId, 'order id');
  const opener = numericId(openedBy, 'user id');
  const safeReason = reasonText(reason);
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`dispute-order:${order}`]);
    const orderResult = await client.query(`
      select id, buyer_id, seller_id, escrow_state from orders where id = $1 for update
    `, [order]);
    if (!orderResult.rowCount) throw new Error('order not found');
    const row = orderResult.rows[0];
    if (![String(row.buyer_id), String(row.seller_id)].includes(opener)) throw new Error('not order participant');
    if (row.escrow_state !== 'held') throw new Error('order not disputable');
    const existing = await client.query(`select id from disputes where order_id = $1 and status = 'open' limit 1`, [order]);
    if (existing.rowCount) throw new Error('dispute already open');
    const inserted = await client.query(`
      insert into disputes (order_id, opened_by, reason, status, resolution, resolved_by, created_at, updated_at, resolved_at)
      values ($1, $2, $3, 'open', null, null, now(), now(), null)
      returning *
    `, [order, opener, safeReason]);
    await client.query('commit');
    return disputeView(inserted.rows[0]);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function listUserDisputes(userId, { limit = 50 } = {}) {
  await assertDisputesReady();
  const user = numericId(userId, 'user id');
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(String(limit), 10) || 50));
  const result = await pool.query(`
    select d.*
    from disputes d
    join orders o on o.id = d.order_id
    where o.buyer_id = $1 or o.seller_id = $1
    order by d.id desc
    limit $2
  `, [user, safeLimit]);
  return result.rows.map(disputeView);
}

export async function listAdminDisputes({ status = '', limit = 50 } = {}) {
  await assertDisputesReady();
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(String(limit), 10) || 50));
  const safeStatus = status === 'open' || status === 'resolved' ? status : '';
  const params = [];
  let where = '';
  if (safeStatus) {
    params.push(safeStatus);
    where = `where d.status = $${params.length}`;
  }
  params.push(safeLimit);
  const result = await pool.query(`
    select d.*, o.buyer_id, o.seller_id, o.amount, o.escrow_state
    from disputes d
    join orders o on o.id = d.order_id
    ${where}
    order by d.id desc
    limit $${params.length}
  `, params);
  return result.rows.map((row) => ({
    ...disputeView(row),
    buyerId: String(row.buyer_id),
    sellerId: String(row.seller_id),
    amount: Number(row.amount || 0),
    escrowState: row.escrow_state,
  }));
}

export async function resolveDispute({ disputeId, adminId, adminRole, resolution }) {
  await assertDisputesReady({ writes: true });
  const id = numericId(disputeId, 'dispute id');
  const admin = numericId(adminId, 'admin id');
  const safeResolution = typeof resolution === 'string' ? resolution.trim().toLowerCase() : '';
  if (!RESOLUTIONS.has(safeResolution)) throw new Error('invalid dispute resolution');
  if (config.auditLogEnabled) {
    const audit = await detectAuditCompatibility();
    if (!audit.ready) throw new Error(`audit schema incompatible: ${audit.blockers.join(', ')}`);
  }

  const current = await pool.query(`select * from disputes where id = $1 limit 1`, [id]);
  if (!current.rowCount) throw new Error('dispute not found');
  if (current.rows[0].status === 'resolved') return disputeView(current.rows[0]);
  const orderId = String(current.rows[0].order_id);
  const audienceResult = await pool.query(`select buyer_id, seller_id from orders where id = $1 limit 1`, [orderId]);
  const audience = audienceResult.rows[0] || {};

  if (safeResolution === 'refund') await refundEscrow(orderId);
  if (safeResolution === 'release') await releaseEscrow(orderId);

  const updated = await pool.query(`
    update disputes
    set status = 'resolved', resolution = $2, resolved_by = $3, resolved_at = now(), updated_at = now()
    where id = $1 and status = 'open'
    returning *
  `, [id, safeResolution, admin]);
  const dispute = disputeView(updated.rows[0] || current.rows[0]);

  await writeAudit({
    actorId: admin,
    actorRole: adminRole,
    action: `dispute_${safeResolution}`,
    targetType: 'dispute',
    targetId: id,
    metadata: { orderId, resolution: safeResolution },
  }).catch((error) => console.error('[KOTAKAS] audit write failed:', error?.message || error));

  publishDisputeResolved({ dispute, buyerId: audience.buyer_id, sellerId: audience.seller_id });
  return dispute;
}

function errorResponse(res, error) {
  const message = String(error?.message || 'dispute_error');
  if (message.includes('not found')) return res.status(404).json({ ok: false, error: 'not_found' });
  if (message.includes('already open')) return res.status(409).json({ ok: false, error: 'dispute_already_open' });
  if (message.includes('not disputable')) return res.status(409).json({ ok: false, error: 'order_not_disputable' });
  if (message.includes('not order participant')) return res.status(403).json({ ok: false, error: 'forbidden' });
  if (message.includes('disabled') || message.includes('schema incompatible') || message.includes('database unavailable')) {
    return res.status(503).json({ ok: false, error: 'disputes_temporarily_unavailable' });
  }
  if (message.includes('invalid')) return res.status(400).json({ ok: false, error: 'invalid_dispute_request' });
  console.error('[KOTAKAS] dispute api error:', message);
  return res.status(503).json({ ok: false, error: 'disputes_temporarily_unavailable' });
}

disputesApiRouter.post('/disputes', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try {
    const dispute = await openDispute({ orderId: req.body?.orderId, openedBy: user.id, reason: req.body?.reason });
    await writeAudit({ actorId: user.id, actorRole: user.role, action: 'dispute_opened', targetType: 'dispute', targetId: dispute.id, metadata: { orderId: dispute.orderId } })
      .catch((error) => console.error('[KOTAKAS] audit write failed:', error?.message || error));
    await createAdminNotification({
      kind: 'dispute_opened',
      title: `Yeni ihtilaf #${dispute.id}`,
      body: dispute.reason.length > 180 ? `${dispute.reason.slice(0, 177)}...` : dispute.reason,
      targetId: dispute.id,
      createdBy: user.id,
    }).catch((error) => console.error('[KOTAKAS] admin notification failed:', error?.message || error));
    return res.status(201).json({ ok: true, dispute });
  } catch (error) {
    return errorResponse(res, error);
  }
});

disputesApiRouter.get('/disputes/mine', requireAuthenticated, async (req, res) => {
  try {
    const user = actor(req);
    return res.json({ ok: true, disputes: await listUserDisputes(user.id, { limit: req.query.limit }) });
  } catch (error) {
    return errorResponse(res, error);
  }
});

disputesApiRouter.get('/admin/disputes', requirePermission(PERMISSIONS.DISPUTES), async (req, res) => {
  try {
    return res.json({ ok: true, disputes: await listAdminDisputes({ status: req.query.status, limit: req.query.limit }) });
  } catch (error) {
    return errorResponse(res, error);
  }
});

disputesApiRouter.post('/admin/disputes/:disputeId/resolve', requirePermission(PERMISSIONS.FINANCE), async (req, res) => {
  const admin = actor(req);
  try {
    const dispute = await resolveDispute({ disputeId: req.params.disputeId, adminId: admin.id, adminRole: admin.role, resolution: req.body?.resolution });
    return res.json({ ok: true, dispute });
  } catch (error) {
    return errorResponse(res, error);
  }
});

disputesApiRouter.get('/admin/audit', requirePermission(PERMISSIONS.SECURITY), async (req, res) => {
  try {
    return res.json({ ok: true, logs: await listAuditLogs({ limit: req.query.limit, action: req.query.action }) });
  } catch (error) {
    return errorResponse(res, error);
  }
});
