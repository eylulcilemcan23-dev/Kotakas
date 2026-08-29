import { Router } from 'express';
import { config } from './config.js';
import { pool } from './db.js';
import { requireAuthenticated, requirePermission, roleCan } from './authz.js';
import { PERMISSIONS } from './roles.js';
import { holdEscrow, refundEscrow, releaseEscrow } from './finance-write-adapter.js';
import { syncListingForOrder } from './marketplace.js';

export const escrowApiRouter = Router();

function userId(user) {
  const value = user?.id;
  if (value == null) return null;
  const text = String(value);
  return /^\d+$/.test(text) ? text : null;
}

function requireEscrowApiReady(_req, res, next) {
  if (!config.escrowApiEnabled) return res.status(503).json({ ok: false, error: 'escrow_api_disabled' });
  if (!config.financeWritesEnabled) return res.status(503).json({ ok: false, error: 'finance_writes_disabled' });
  next();
}

async function readOrder(orderId) {
  if (!pool || !/^\d+$/.test(String(orderId))) return null;
  const result = await pool.query(`
    select id, buyer_id, seller_id, amount, commission_rate, commission_amount, seller_net, escrow_state, idempotency_key
    from orders where id = $1 limit 1
  `, [orderId]);
  return result.rows[0] || null;
}

export function canReleaseEscrow(user, order) {
  const actor = userId(user);
  if (!actor || !order) return false;
  if (String(order.buyer_id) === actor) return true;
  return roleCan(user.role, PERMISSIONS.FINANCE);
}

function sendEscrowError(res, error) {
  const message = String(error?.message || 'escrow_error');
  if (message.includes('not found')) return res.status(404).json({ ok: false, error: 'escrow_not_found' });
  if (message.includes('insufficient balance')) return res.status(409).json({ ok: false, error: 'insufficient_balance' });
  if (message.includes('idempotency key conflict')) return res.status(409).json({ ok: false, error: 'idempotency_conflict' });
  if (message.includes('not releasable') || message.includes('not refundable')) return res.status(409).json({ ok: false, error: 'invalid_escrow_state' });
  if (message.includes('invalid') || message.includes('missing') || message.includes('must differ')) return res.status(400).json({ ok: false, error: 'invalid_escrow_request' });
  console.error('[KOTAKAS] escrow api error:', message);
  return res.status(503).json({ ok: false, error: 'escrow_temporarily_unavailable' });
}

// Genel amaçlı sellerId + amount alan bu endpoint varsayılan olarak kapalıdır.
// Pazar alışverişlerinde fiyat ve satıcı daima sunucudaki listing kaydından okunur.
escrowApiRouter.post('/escrow/hold', requireAuthenticated, requireEscrowApiReady, async (req, res) => {
  if (!config.directEscrowEnabled) return res.status(503).json({ ok: false, error: 'direct_escrow_disabled' });
  const buyerId = userId(req.user || req.auth);
  const sellerId = req.body?.sellerId == null ? '' : String(req.body.sellerId);
  const idempotencyKey = String(req.get('x-idempotency-key') || req.body?.idempotencyKey || '').trim();
  if (!buyerId || !/^\d+$/.test(sellerId)) return res.status(400).json({ ok: false, error: 'invalid_escrow_identity' });

  try {
    const order = await holdEscrow({
      buyerId,
      sellerId,
      amount: req.body?.amount,
      commissionRate: config.commissionRate,
      idempotencyKey,
    });
    return res.status(201).json({ ok: true, order });
  } catch (error) {
    return sendEscrowError(res, error);
  }
});

escrowApiRouter.post('/escrow/:orderId/release', requireAuthenticated, requireEscrowApiReady, async (req, res) => {
  try {
    const order = await readOrder(req.params.orderId);
    if (!order) return res.status(404).json({ ok: false, error: 'escrow_not_found' });
    if (!canReleaseEscrow(req.user || req.auth, order)) return res.status(403).json({ ok: false, error: 'forbidden' });
    const released = await releaseEscrow(order.id);
    const listing = await syncListingForOrder(order.id).catch(() => null);
    return res.json({ ok: true, order: released, listing });
  } catch (error) {
    return sendEscrowError(res, error);
  }
});

escrowApiRouter.post('/escrow/:orderId/refund', requireAuthenticated, requirePermission(PERMISSIONS.FINANCE), requireEscrowApiReady, async (req, res) => {
  try {
    const refunded = await refundEscrow(req.params.orderId);
    const listing = await syncListingForOrder(req.params.orderId).catch(() => null);
    return res.json({ ok: true, order: refunded, listing });
  } catch (error) {
    return sendEscrowError(res, error);
  }
});
