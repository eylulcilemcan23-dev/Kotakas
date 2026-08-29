import { Router } from 'express';
import { config } from './config.js';
import { pool } from './db.js';
import { requireAuthenticated } from './authz.js';
import {
  cancelListing,
  createListing,
  detectMarketplaceCompatibility,
  listActiveListings,
  listSellerListings,
  purchaseListing,
} from './marketplace.js';

export const marketplaceApiRouter = Router();

function actorId(req) {
  const value = (req.user || req.auth)?.id;
  const text = value == null ? '' : String(value);
  return /^\d+$/.test(text) ? text : null;
}

function safeLimit(value, fallback = 30) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(1, parsed));
}

function marketError(res, error) {
  const message = String(error?.message || 'market_error');
  if (message.includes('not found')) return res.status(404).json({ ok: false, error: 'listing_not_found' });
  if (message.includes('not available') || message.includes('not cancellable')) return res.status(409).json({ ok: false, error: 'listing_not_available' });
  if (message.includes('insufficient balance')) return res.status(409).json({ ok: false, error: 'insufficient_balance' });
  if (message.includes('idempotency key conflict')) return res.status(409).json({ ok: false, error: 'idempotency_conflict' });
  if (message.includes('disabled') || message.includes('schema incompatible') || message.includes('database unavailable')) {
    return res.status(503).json({ ok: false, error: 'market_temporarily_unavailable' });
  }
  if (message.includes('invalid') || message.includes('must differ')) return res.status(400).json({ ok: false, error: 'invalid_market_request' });
  console.error('[KOTAKAS] marketplace api error:', message);
  return res.status(503).json({ ok: false, error: 'market_temporarily_unavailable' });
}

marketplaceApiRouter.get('/market/listings', async (req, res) => {
  try {
    const listings = await listActiveListings({ limit: req.query.limit, server: req.query.server });
    return res.json({ ok: true, listings });
  } catch (error) {
    return marketError(res, error);
  }
});

marketplaceApiRouter.get('/market/listings/mine', requireAuthenticated, async (req, res) => {
  try {
    const sellerId = actorId(req);
    if (!sellerId) return res.status(400).json({ ok: false, error: 'invalid_user' });
    const listings = await listSellerListings(sellerId, { limit: req.query.limit });
    return res.json({ ok: true, listings });
  } catch (error) {
    return marketError(res, error);
  }
});

marketplaceApiRouter.get('/market/orders/mine', requireAuthenticated, async (req, res) => {
  const userId = actorId(req);
  if (!userId) return res.status(400).json({ ok: false, error: 'invalid_user' });
  if (!pool) return res.status(503).json({ ok: false, error: 'market_temporarily_unavailable' });
  try {
    const compatibility = await detectMarketplaceCompatibility();
    if (!compatibility.ready) return res.status(503).json({ ok: false, error: 'market_temporarily_unavailable' });
    const result = await pool.query(`
      select
        o.id, o.listing_id, o.buyer_id, o.seller_id, o.amount, o.commission_amount,
        o.seller_net, o.escrow_state, o.created_at, o.updated_at,
        l.title, l.server, l.status as listing_status
      from orders o
      left join listings l on l.id = o.listing_id
      where o.buyer_id = $1 or o.seller_id = $1
      order by o.id desc
      limit $2
    `, [userId, safeLimit(req.query.limit)]);
    const orders = result.rows.map((row) => ({
      id: String(row.id),
      listingId: row.listing_id == null ? null : String(row.listing_id),
      buyerId: String(row.buyer_id),
      sellerId: String(row.seller_id),
      amount: Number(row.amount),
      commissionAmount: Number(row.commission_amount),
      sellerNet: Number(row.seller_net),
      escrowState: row.escrow_state,
      title: row.title || 'İlan',
      server: row.server || '',
      listingStatus: row.listing_status || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
    return res.json({ ok: true, actorId: userId, orders });
  } catch (error) {
    return marketError(res, error);
  }
});

marketplaceApiRouter.post('/market/listings', requireAuthenticated, async (req, res) => {
  if (!config.marketWritesEnabled) return res.status(503).json({ ok: false, error: 'market_writes_disabled' });
  try {
    const sellerId = actorId(req);
    if (!sellerId) return res.status(400).json({ ok: false, error: 'invalid_user' });
    const listing = await createListing({
      sellerId,
      title: req.body?.title,
      server: req.body?.server,
      description: req.body?.description,
      price: req.body?.price,
    });
    return res.status(201).json({ ok: true, listing });
  } catch (error) {
    return marketError(res, error);
  }
});

marketplaceApiRouter.post('/market/listings/:listingId/cancel', requireAuthenticated, async (req, res) => {
  if (!config.marketWritesEnabled) return res.status(503).json({ ok: false, error: 'market_writes_disabled' });
  try {
    const sellerId = actorId(req);
    if (!sellerId) return res.status(400).json({ ok: false, error: 'invalid_user' });
    const listing = await cancelListing({ sellerId, listingId: req.params.listingId });
    return res.json({ ok: true, listing });
  } catch (error) {
    return marketError(res, error);
  }
});

marketplaceApiRouter.post('/market/listings/:listingId/buy', requireAuthenticated, async (req, res) => {
  if (!config.marketWritesEnabled || !config.financeWritesEnabled || !config.escrowApiEnabled) {
    return res.status(503).json({ ok: false, error: 'secure_purchase_disabled' });
  }
  try {
    const buyerId = actorId(req);
    if (!buyerId) return res.status(400).json({ ok: false, error: 'invalid_user' });
    const idempotencyKey = String(req.get('x-idempotency-key') || req.body?.idempotencyKey || '').trim();
    const order = await purchaseListing({ buyerId, listingId: req.params.listingId, idempotencyKey });
    return res.status(201).json({ ok: true, order });
  } catch (error) {
    return marketError(res, error);
  }
});

marketplaceApiRouter.get('/admin/market-compatibility', requireAuthenticated, async (req, res) => {
  const role = (req.user || req.auth)?.role || '';
  if (!['admin_owner', 'admin_full'].includes(role)) return res.status(403).json({ ok: false, error: 'forbidden' });
  try {
    const status = await detectMarketplaceCompatibility({ force: true });
    return res.json({
      ok: true,
      ...status,
      marketWritesEnabled: config.marketWritesEnabled,
      securePurchaseEnabled: Boolean(config.marketWritesEnabled && config.financeWritesEnabled && config.escrowApiEnabled && status.ready),
    });
  } catch (error) {
    return marketError(res, error);
  }
});
