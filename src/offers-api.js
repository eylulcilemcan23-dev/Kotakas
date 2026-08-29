import { Router } from 'express';
import { config } from './config.js';
import { pool } from './db.js';
import { requireAuthenticated } from './authz.js';
import { buildEscrowSettlement, ESCROW_STATES } from './escrow.js';
import { detectMarketplaceCompatibility } from './marketplace.js';
import { createUserNotification } from './dispute-communications.js';

export const offersApiRouter = Router();

const OFFER_COLUMNS = ['id','listing_id','offered_by','amount','status','created_at','updated_at'];
let compatibilityCache = null;
let compatibilityCachedAt = 0;
const CACHE_MS = 60_000;

function actor(req) {
  const user = req.user || req.auth || {};
  return { id: user.id == null ? null : String(user.id) };
}

function numericId(value, label = 'id') {
  const text = value == null ? '' : String(value);
  if (!/^\d+$/.test(text)) throw new Error(`invalid ${label}`);
  return text;
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error('invalid money');
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function moneyParam(value) {
  return money(value).toFixed(2);
}

function text(value, max, label) {
  const out = typeof value === 'string' ? value.trim() : '';
  if (!out || out.length > max) throw new Error(`invalid ${label}`);
  return out;
}

function offerView(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    listingId: String(row.listing_id),
    amount: Number(row.amount),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    listingTitle: row.listing_title || null,
    server: row.server || null,
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

export async function detectOfferCompatibility({ force = false } = {}) {
  if (!pool) return { ready: false, blockers: ['DATABASE_URL missing'] };
  if (!force && compatibilityCache && Date.now() - compatibilityCachedAt < CACHE_MS) return compatibilityCache;
  const result = await pool.query(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public' and table_name in ('listing_offers','listings')
  `);
  const tables = new Map();
  for (const row of result.rows) {
    if (!tables.has(row.table_name)) tables.set(row.table_name, new Set());
    tables.get(row.table_name).add(row.column_name);
  }
  const blockers = [];
  for (const column of OFFER_COLUMNS) if (!tables.get('listing_offers')?.has(column)) blockers.push(`missing_column:listing_offers.${column}`);
  for (const column of ['id','seller_id','title','server','price','status']) if (!tables.get('listings')?.has(column)) blockers.push(`missing_column:listings.${column}`);
  if (!tables.has('listing_offers')) blockers.push('missing_table:listing_offers');
  if (!tables.has('listings')) blockers.push('missing_table:listings');
  compatibilityCache = { ready: blockers.length === 0, blockers: [...new Set(blockers)] };
  compatibilityCachedAt = Date.now();
  return compatibilityCache;
}

async function assertOffersReady({ writes = false, finance = false } = {}) {
  if (!pool) throw new Error('database unavailable');
  if (writes && !config.marketWritesEnabled) throw new Error('market writes disabled');
  const status = await detectOfferCompatibility();
  if (!status.ready) throw new Error(`offer schema incompatible: ${status.blockers.join(', ')}`);
  if (finance) {
    if (!config.financeWritesEnabled) throw new Error('finance writes disabled');
    if (!config.escrowApiEnabled) throw new Error('escrow api disabled');
    const market = await detectMarketplaceCompatibility();
    if (!market.ready) throw new Error(`market schema incompatible: ${market.blockers.join(', ')}`);
  }
}

export async function createOrUpdateOffer({ listingId, buyerId, amount }) {
  await assertOffersReady({ writes: true });
  const listing = numericId(listingId, 'listing id');
  const buyer = numericId(buyerId, 'buyer id');
  const safeAmount = money(amount);
  if (safeAmount <= 0) throw new Error('invalid offer amount');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`listing-offer:${listing}:${buyer}`]);
    const listingResult = await client.query('select id,seller_id,title,server,price,status from listings where id = $1 for update', [listing]);
    if (!listingResult.rowCount) throw new Error('listing not found');
    const row = listingResult.rows[0];
    if (row.status !== 'active') throw new Error('listing not available');
    if (String(row.seller_id) === buyer) throw new Error('buyer and seller must differ');
    if (safeAmount >= money(row.price)) throw new Error('offer must be below listing price');

    const existing = await client.query(`
      select * from listing_offers
      where listing_id = $1 and offered_by = $2 and status = 'open'
      for update
    `, [listing, buyer]);
    let result;
    if (existing.rowCount) {
      result = await client.query(`
        update listing_offers set amount = $2::numeric, updated_at = now()
        where id = $1 returning *
      `, [existing.rows[0].id, moneyParam(safeAmount)]);
    } else {
      result = await client.query(`
        insert into listing_offers (listing_id,offered_by,amount,status,created_at,updated_at)
        values ($1,$2,$3::numeric,'open',now(),now()) returning *
      `, [listing, buyer, moneyParam(safeAmount)]);
    }
    await client.query('commit');
    const offer = offerView(result.rows[0]);
    await createUserNotification({
      userId: row.seller_id,
      kind: 'listing_offer_received',
      title: `${row.title} için yeni teklif`,
      body: `${moneyParam(safeAmount)} TL teklif geldi.`,
      targetType: 'listing',
      targetId: listing,
      dedupeKey: `listing-offer:${offer.id}:${offer.updatedAt}`,
      createdBy: buyer,
    }).catch(() => null);
    return offer;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function listMyOffers(buyerId, { limit = 50 } = {}) {
  await assertOffersReady();
  const buyer = numericId(buyerId, 'buyer id');
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(String(limit), 10) || 50));
  const result = await pool.query(`
    select o.*, l.title as listing_title, l.server
    from listing_offers o
    join listings l on l.id = o.listing_id
    where o.offered_by = $1
    order by o.id desc
    limit $2
  `, [buyer, safeLimit]);
  return result.rows.map(offerView);
}

export async function listListingOffersForSeller({ listingId, sellerId, limit = 50 }) {
  await assertOffersReady();
  const listing = numericId(listingId, 'listing id');
  const seller = numericId(sellerId, 'seller id');
  const owner = await pool.query('select seller_id from listings where id = $1 limit 1', [listing]);
  if (!owner.rowCount) throw new Error('listing not found');
  if (String(owner.rows[0].seller_id) !== seller) throw new Error('forbidden listing offers');
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(String(limit), 10) || 50));
  const result = await pool.query(`
    select * from listing_offers
    where listing_id = $1
    order by id desc
    limit $2
  `, [listing, safeLimit]);
  return result.rows.map(offerView);
}

export async function cancelOffer({ offerId, buyerId }) {
  await assertOffersReady({ writes: true });
  const offer = numericId(offerId, 'offer id');
  const buyer = numericId(buyerId, 'buyer id');
  const result = await pool.query(`
    update listing_offers set status = 'cancelled', updated_at = now()
    where id = $1 and offered_by = $2 and status = 'open'
    returning *
  `, [offer, buyer]);
  if (!result.rowCount) throw new Error('offer not cancellable');
  return offerView(result.rows[0]);
}

export async function rejectOffer({ offerId, sellerId }) {
  await assertOffersReady({ writes: true });
  const offer = numericId(offerId, 'offer id');
  const seller = numericId(sellerId, 'seller id');
  const result = await pool.query(`
    update listing_offers o
    set status = 'rejected', updated_at = now()
    from listings l
    where o.id = $1 and o.listing_id = l.id and l.seller_id = $2 and o.status = 'open'
    returning o.*
  `, [offer, seller]);
  if (!result.rowCount) throw new Error('offer not rejectable');
  const row = result.rows[0];
  const buyerResult = await pool.query('select offered_by from listing_offers where id = $1 limit 1', [offer]);
  const buyer = buyerResult.rows[0]?.offered_by;
  if (buyer) await createUserNotification({
    userId: buyer,
    kind: 'listing_offer_rejected',
    title: 'Teklifin reddedildi',
    body: `${moneyParam(row.amount)} TL teklif satıcı tarafından reddedildi.`,
    targetType: 'listing',
    targetId: row.listing_id,
    dedupeKey: `listing-offer-rejected:${offer}`,
    createdBy: seller,
  }).catch(() => null);
  return offerView(row);
}

export async function acceptOffer({ offerId, sellerId, idempotencyKey }) {
  await assertOffersReady({ writes: true, finance: true });
  const offerIdText = numericId(offerId, 'offer id');
  const seller = numericId(sellerId, 'seller id');
  const key = text(idempotencyKey, 128, 'idempotency key');
  const client = await pool.connect();
  let acceptedBuyer = null;
  let rejectedBuyers = [];
  let acceptedOffer = null;
  let order = null;
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`offer-accept:${offerIdText}`]);
    const offerResult = await client.query('select * from listing_offers where id = $1 for update', [offerIdText]);
    if (!offerResult.rowCount) throw new Error('offer not found');
    const offer = offerResult.rows[0];
    const listingResult = await client.query('select * from listings where id = $1 for update', [offer.listing_id]);
    if (!listingResult.rowCount) throw new Error('listing not found');
    const listing = listingResult.rows[0];
    if (String(listing.seller_id) !== seller) throw new Error('forbidden offer accept');

    const existing = await client.query('select * from orders where idempotency_key = $1 for update', [key]);
    if (existing.rowCount) {
      const row = existing.rows[0];
      if (String(row.listing_id) !== String(listing.id) || String(row.buyer_id) !== String(offer.offered_by) || money(row.amount) !== money(offer.amount)) {
        throw new Error('idempotency key conflict');
      }
      await client.query('commit');
      return { offer: offerView(offer), order: orderView(row) };
    }

    if (offer.status !== 'open') throw new Error('offer not available');
    if (listing.status !== 'active') throw new Error('listing not available');
    if (String(offer.offered_by) === seller) throw new Error('buyer and seller must differ');

    const settlement = buildEscrowSettlement(offer.amount, config.commissionRate);
    const walletResult = await client.query('select user_id,available_balance,held_balance from wallets where user_id = $1 for update', [offer.offered_by]);
    if (!walletResult.rowCount) throw new Error('wallet not found');
    if (money(walletResult.rows[0].available_balance) < settlement.buyerDebit) throw new Error('insufficient balance');

    await client.query(`
      update wallets
      set available_balance = available_balance - $2::numeric,
          held_balance = held_balance + $2::numeric,
          updated_at = now()
      where user_id = $1
    `, [offer.offered_by, moneyParam(settlement.buyerDebit)]);

    const orderResult = await client.query(`
      insert into orders (
        listing_id,buyer_id,seller_id,amount,commission_rate,commission_amount,seller_net,
        escrow_state,idempotency_key,created_at,updated_at
      ) values ($1,$2,$3,$4::numeric,$5::numeric,$6::numeric,$7::numeric,$8,$9,now(),now())
      returning *
    `, [
      listing.id,
      offer.offered_by,
      listing.seller_id,
      moneyParam(settlement.heldAmount),
      String(settlement.commissionRate),
      moneyParam(settlement.platformCredit),
      moneyParam(settlement.sellerCredit),
      ESCROW_STATES.HELD,
      key,
    ]);
    order = orderResult.rows[0];

    await client.query(`
      insert into wallet_transactions (order_id,user_id,kind,available_delta,held_delta,created_at)
      values ($1,$2,'escrow_hold',$3::numeric,$4::numeric,now())
    `, [order.id, offer.offered_by, moneyParam(-settlement.buyerDebit), moneyParam(settlement.heldAmount)]);

    await client.query(`update listings set status = 'reserved', order_id = $2, updated_at = now() where id = $1`, [listing.id, order.id]);
    const accepted = await client.query(`update listing_offers set status = 'accepted', updated_at = now() where id = $1 returning *`, [offer.id]);
    acceptedOffer = accepted.rows[0];
    const rejected = await client.query(`
      update listing_offers set status = 'rejected', updated_at = now()
      where listing_id = $1 and id <> $2 and status = 'open'
      returning offered_by
    `, [listing.id, offer.id]);
    acceptedBuyer = String(offer.offered_by);
    rejectedBuyers = rejected.rows.map((row) => String(row.offered_by));
    await client.query('commit');

    await createUserNotification({
      userId: acceptedBuyer,
      kind: 'escrow_offer_accepted',
      title: `${listing.title} teklifin kabul edildi`,
      body: `${moneyParam(offer.amount)} TL bakiyen güvenli işlem için blokeye alındı. Teslimatı İşlemlerim ekranından takip et.`,
      targetType: 'order',
      targetId: order.id,
      dedupeKey: `offer-accepted:${offer.id}:${order.id}`,
      createdBy: seller,
    }).catch(() => null);
    await Promise.all([...new Set(rejectedBuyers)].filter((id) => id !== acceptedBuyer).map((buyer) => createUserNotification({
      userId: buyer,
      kind: 'listing_offer_rejected',
      title: `${listing.title} için teklif kapandı`,
      body: 'Satıcı başka bir teklifi kabul ettiği için açık teklifin kapatıldı.',
      targetType: 'listing',
      targetId: listing.id,
      dedupeKey: `listing-offer-auto-rejected:${listing.id}:${order.id}:${buyer}`,
      createdBy: seller,
    }).catch(() => null)));
    return { offer: offerView(acceptedOffer), order: orderView(order) };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

function errorResponse(res, error) {
  const message = String(error?.message || 'offer_error');
  if (message.includes('not found')) return res.status(404).json({ ok: false, error: 'not_found' });
  if (message.includes('forbidden')) return res.status(403).json({ ok: false, error: 'forbidden' });
  if (message.includes('insufficient')) return res.status(409).json({ ok: false, error: 'insufficient_balance' });
  if (message.includes('below listing price')) return res.status(400).json({ ok: false, error: 'offer_must_be_below_price' });
  if (message.includes('not available') || message.includes('not cancellable') || message.includes('not rejectable')) return res.status(409).json({ ok: false, error: 'offer_not_available' });
  if (message.includes('buyer and seller')) return res.status(409).json({ ok: false, error: 'self_offer_not_allowed' });
  if (message.includes('idempotency')) return res.status(409).json({ ok: false, error: 'idempotency_conflict' });
  if (message.includes('disabled') || message.includes('schema incompatible') || message.includes('database unavailable')) {
    return res.status(503).json({ ok: false, error: 'offers_temporarily_unavailable' });
  }
  if (message.includes('invalid')) return res.status(400).json({ ok: false, error: 'invalid_offer_request' });
  console.error('[KOTAKAS] offer api error:', message);
  return res.status(503).json({ ok: false, error: 'offers_temporarily_unavailable' });
}

offersApiRouter.post('/offers', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try {
    const offer = await createOrUpdateOffer({ listingId: req.body?.listingId, buyerId: user.id, amount: req.body?.amount });
    return res.status(201).json({ ok: true, offer });
  } catch (error) { return errorResponse(res, error); }
});

offersApiRouter.get('/offers/mine', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try { return res.json({ ok: true, offers: await listMyOffers(user.id, { limit: req.query.limit }) }); }
  catch (error) { return errorResponse(res, error); }
});

offersApiRouter.get('/offers/listing/:listingId', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try { return res.json({ ok: true, offers: await listListingOffersForSeller({ listingId: req.params.listingId, sellerId: user.id, limit: req.query.limit }) }); }
  catch (error) { return errorResponse(res, error); }
});

offersApiRouter.post('/offers/:offerId/cancel', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try { return res.json({ ok: true, offer: await cancelOffer({ offerId: req.params.offerId, buyerId: user.id }) }); }
  catch (error) { return errorResponse(res, error); }
});

offersApiRouter.post('/offers/:offerId/reject', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try { return res.json({ ok: true, offer: await rejectOffer({ offerId: req.params.offerId, sellerId: user.id }) }); }
  catch (error) { return errorResponse(res, error); }
});

offersApiRouter.post('/offers/:offerId/accept', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try {
    const result = await acceptOffer({ offerId: req.params.offerId, sellerId: user.id, idempotencyKey: req.get('X-Idempotency-Key') || req.body?.idempotencyKey });
    return res.json({ ok: true, ...result });
  } catch (error) { return errorResponse(res, error); }
});
