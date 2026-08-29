import { Router } from 'express';
import { config } from './config.js';
import { pool } from './db.js';
import { requireAuthenticated, requirePermission } from './authz.js';
import { PERMISSIONS } from './roles.js';
import { createAdminNotification, createUserNotification } from './dispute-communications.js';
import { writeAudit } from './audit-log.js';

export const swapsApiRouter = Router();

const SWAP_COLUMNS = [
  'id', 'proposer_id', 'recipient_id', 'offered_listing_id', 'requested_listing_id',
  'status', 'proposer_received_at', 'recipient_received_at', 'accepted_at',
  'completed_at', 'created_at', 'updated_at',
];
const SWAP_DISPUTE_COLUMNS = [
  'id', 'swap_id', 'opened_by', 'reason', 'status', 'resolution', 'resolved_by',
  'created_at', 'updated_at', 'resolved_at',
];
let compatibilityCache = null;
let compatibilityCachedAt = 0;
const CACHE_MS = 60_000;

function actor(req) {
  const user = req.user || req.auth || {};
  return { id: user.id == null ? null : String(user.id), role: user.role || 'user' };
}

function numericId(value, label = 'id') {
  const text = value == null ? '' : String(value);
  if (!/^\d+$/.test(text)) throw new Error(`invalid ${label}`);
  return text;
}

function safeText(value, { min = 1, max = 1200, label = 'text' } = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < min || text.length > max) throw new Error(`invalid ${label}`);
  return text;
}

function safeLimit(value, fallback = 50) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(1, parsed));
}

function listingView(row, prefix) {
  return {
    id: String(row[`${prefix}_listing_id`]),
    title: row[`${prefix}_title`] || 'İlan',
    server: row[`${prefix}_server`] || '',
    price: Number(row[`${prefix}_price`] || 0),
    status: row[`${prefix}_status`] || '',
  };
}

function swapView(row, actorId = null, { admin = false } = {}) {
  if (!row) return null;
  const proposerId = String(row.proposer_id);
  const recipientId = String(row.recipient_id);
  const offered = listingView(row, 'offered');
  const requested = listingView(row, 'requested');
  const base = {
    id: String(row.id),
    status: row.status,
    offeredListing: offered,
    requestedListing: requested,
    proposerReceivedAt: row.proposer_received_at,
    recipientReceivedAt: row.recipient_received_at,
    acceptedAt: row.accepted_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    dispute: row.dispute_id == null ? null : {
      id: String(row.dispute_id),
      status: row.dispute_status,
      reason: admin ? (row.dispute_reason || '') : undefined,
      resolution: row.dispute_resolution || null,
    },
  };
  if (admin) return { ...base, proposerId, recipientId };
  const userId = actorId == null ? '' : String(actorId);
  const proposer = userId === proposerId;
  return {
    ...base,
    perspective: proposer ? 'proposer' : 'recipient',
    myListing: proposer ? offered : requested,
    theirListing: proposer ? requested : offered,
    myReceivedAt: proposer ? row.proposer_received_at : row.recipient_received_at,
    otherReceivedAt: proposer ? row.recipient_received_at : row.proposer_received_at,
  };
}

async function readSwapRow(queryable, swapId, { lock = false } = {}) {
  const id = numericId(swapId, 'swap id');
  const result = await queryable.query(`
    select s.*,
      ol.id as offered_listing_id, ol.title as offered_title, ol.server as offered_server,
      ol.price as offered_price, ol.status as offered_status,
      rl.id as requested_listing_id, rl.title as requested_title, rl.server as requested_server,
      rl.price as requested_price, rl.status as requested_status,
      sd.id as dispute_id, sd.status as dispute_status, sd.reason as dispute_reason, sd.resolution as dispute_resolution
    from swap_requests s
    join listings ol on ol.id = s.offered_listing_id
    join listings rl on rl.id = s.requested_listing_id
    left join swap_disputes sd on sd.swap_id = s.id and sd.status = 'open'
    where s.id = $1
    limit 1
    ${lock ? 'for update of s' : ''}
  `, [id]);
  if (!result.rowCount) throw new Error('swap not found');
  return result.rows[0];
}

async function lockListings(client, listingIds) {
  const ids = [...new Set(listingIds.map((id) => numericId(id, 'listing id')))].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1);
  if (ids.length !== 2) throw new Error('invalid swap listings');
  const result = await client.query(`
    select id, seller_id, title, server, price, status, order_id
    from listings
    where id = any($1::bigint[])
    order by id
    for update
  `, [ids]);
  if (result.rowCount !== 2) throw new Error('listing not found');
  return new Map(result.rows.map((row) => [String(row.id), row]));
}

export async function detectSwapCompatibility({ force = false } = {}) {
  if (!pool) return { ready: false, blockers: ['DATABASE_URL missing'], offersReady: false };
  if (!force && compatibilityCache && Date.now() - compatibilityCachedAt < CACHE_MS) return compatibilityCache;
  const result = await pool.query(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('swap_requests','swap_disputes','listings','listing_offers')
  `);
  const tables = new Map();
  for (const row of result.rows) {
    if (!tables.has(row.table_name)) tables.set(row.table_name, new Set());
    tables.get(row.table_name).add(row.column_name);
  }
  const blockers = [];
  for (const column of SWAP_COLUMNS) {
    if (!tables.get('swap_requests')?.has(column)) blockers.push(`missing_column:swap_requests.${column}`);
  }
  for (const column of SWAP_DISPUTE_COLUMNS) {
    if (!tables.get('swap_disputes')?.has(column)) blockers.push(`missing_column:swap_disputes.${column}`);
  }
  for (const column of ['id','seller_id','title','server','price','status','order_id']) {
    if (!tables.get('listings')?.has(column)) blockers.push(`missing_column:listings.${column}`);
  }
  if (!tables.has('swap_requests')) blockers.unshift('missing_table:swap_requests');
  if (!tables.has('swap_disputes')) blockers.unshift('missing_table:swap_disputes');
  if (!tables.has('listings')) blockers.unshift('missing_table:listings');
  const offersReady = ['id','listing_id','status'].every((column) => tables.get('listing_offers')?.has(column));
  compatibilityCache = { ready: blockers.length === 0, blockers: [...new Set(blockers)], offersReady };
  compatibilityCachedAt = Date.now();
  return compatibilityCache;
}

async function assertReady({ writes = false } = {}) {
  if (!pool) throw new Error('database unavailable');
  if (writes && (!config.marketWritesEnabled || !config.swapWritesEnabled)) throw new Error('swap writes disabled');
  const status = await detectSwapCompatibility();
  if (!status.ready) throw new Error(`swap schema incompatible: ${status.blockers.join(', ')}`);
  return status;
}

async function notifyUser(payload) {
  await createUserNotification(payload).catch(() => null);
}

export async function createSwapRequest({ proposerId, offeredListingId, requestedListingId }) {
  await assertReady({ writes: true });
  const proposer = numericId(proposerId, 'proposer id');
  const offeredId = numericId(offeredListingId, 'offered listing id');
  const requestedId = numericId(requestedListingId, 'requested listing id');
  if (offeredId === requestedId) throw new Error('invalid swap listings');
  const client = await pool.connect();
  let createdId;
  let recipientId;
  let requestedTitle;
  try {
    await client.query('begin');
    const listings = await lockListings(client, [offeredId, requestedId]);
    const offered = listings.get(offeredId);
    const requested = listings.get(requestedId);
    if (String(offered.seller_id) !== proposer) throw new Error('forbidden offered listing');
    recipientId = String(requested.seller_id);
    if (recipientId === proposer) throw new Error('swap participants must differ');
    if (offered.status !== 'active' || requested.status !== 'active') throw new Error('listing not available');
    if (String(offered.server).toUpperCase() !== String(requested.server).toUpperCase()) throw new Error('swap server mismatch');

    const existing = await client.query(`
      select id from swap_requests
      where proposer_id=$1 and offered_listing_id=$2 and requested_listing_id=$3 and status='pending'
      limit 1 for update
    `, [proposer, offeredId, requestedId]);
    if (existing.rowCount) {
      createdId = existing.rows[0].id;
    } else {
      const result = await client.query(`
        insert into swap_requests (
          proposer_id,recipient_id,offered_listing_id,requested_listing_id,status,
          proposer_received_at,recipient_received_at,accepted_at,completed_at,created_at,updated_at
        ) values ($1,$2,$3,$4,'pending',null,null,null,null,now(),now())
        returning id
      `, [proposer, recipientId, offeredId, requestedId]);
      createdId = result.rows[0].id;
    }
    requestedTitle = requested.title;
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  const row = await readSwapRow(pool, createdId);
  await notifyUser({
    userId: recipientId,
    kind: 'swap_request_received',
    title: `${requestedTitle} için takas teklifi`,
    body: 'Bir kullanıcı kendi aktif ilanını bu item ile takas etmek istiyor. Takas ekranından inceleyebilirsin.',
    targetType: 'swap',
    targetId: createdId,
    dedupeKey: `swap-request:${createdId}`,
    createdBy: proposer,
  });
  return swapView(row, proposer);
}

export async function listMySwaps(userId, { limit = 50 } = {}) {
  await assertReady();
  const user = numericId(userId, 'user id');
  const result = await pool.query(`
    select s.*,
      ol.id as offered_listing_id, ol.title as offered_title, ol.server as offered_server,
      ol.price as offered_price, ol.status as offered_status,
      rl.id as requested_listing_id, rl.title as requested_title, rl.server as requested_server,
      rl.price as requested_price, rl.status as requested_status,
      sd.id as dispute_id, sd.status as dispute_status, null::text as dispute_reason, sd.resolution as dispute_resolution
    from swap_requests s
    join listings ol on ol.id=s.offered_listing_id
    join listings rl on rl.id=s.requested_listing_id
    left join swap_disputes sd on sd.swap_id=s.id and sd.status='open'
    where s.proposer_id=$1 or s.recipient_id=$1
    order by s.id desc
    limit $2
  `, [user, safeLimit(limit)]);
  return result.rows.map((row) => swapView(row, user));
}

export async function acceptSwap({ swapId, recipientId }) {
  const compatibility = await assertReady({ writes: true });
  const recipient = numericId(recipientId, 'recipient id');
  const client = await pool.connect();
  let proposer;
  let id;
  try {
    await client.query('begin');
    const swap = await readSwapRow(client, swapId, { lock: true });
    id = String(swap.id);
    proposer = String(swap.proposer_id);
    if (String(swap.recipient_id) !== recipient) throw new Error('forbidden swap accept');
    if (swap.status !== 'pending') throw new Error('swap not available');
    const ids = [String(swap.offered_listing_id), String(swap.requested_listing_id)];
    const listings = await lockListings(client, ids);
    const offered = listings.get(ids[0]);
    const requested = listings.get(ids[1]);
    if (offered.status !== 'active' || requested.status !== 'active') throw new Error('listing not available');
    if (String(offered.seller_id) !== proposer || String(requested.seller_id) !== recipient) throw new Error('swap listing owner changed');

    await client.query(`update listings set status='reserved', order_id=null, updated_at=now() where id=any($1::bigint[])`, [ids]);
    await client.query(`
      update swap_requests
      set status='active', accepted_at=now(), updated_at=now()
      where id=$1
    `, [id]);
    await client.query(`
      update swap_requests
      set status='rejected', updated_at=now()
      where id<>$1 and status='pending'
        and (offered_listing_id=any($2::bigint[]) or requested_listing_id=any($2::bigint[]))
    `, [id, ids]);
    if (compatibility.offersReady) {
      await client.query(`
        update listing_offers set status='rejected', updated_at=now()
        where listing_id=any($1::bigint[]) and status='open'
      `, [ids]);
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  const row = await readSwapRow(pool, id);
  await notifyUser({
    userId: proposer,
    kind: 'swap_request_accepted',
    title: 'Takas teklifin kabul edildi',
    body: 'İki ilan da KOTAKAS üzerinde kilitlendi. Karşı itemi gerçekten teslim aldıktan sonra onay ver.',
    targetType: 'swap', targetId: id, dedupeKey: `swap-accepted:${id}`, createdBy: recipient,
  });
  return swapView(row, recipient);
}

export async function rejectSwap({ swapId, recipientId }) {
  await assertReady({ writes: true });
  const recipient = numericId(recipientId, 'recipient id');
  const id = numericId(swapId, 'swap id');
  const result = await pool.query(`
    update swap_requests set status='rejected', updated_at=now()
    where id=$1 and recipient_id=$2 and status='pending'
    returning proposer_id
  `, [id, recipient]);
  if (!result.rowCount) throw new Error('swap not rejectable');
  await notifyUser({
    userId: result.rows[0].proposer_id, kind: 'swap_request_rejected', title: 'Takas teklifin reddedildi',
    body: 'Karşı taraf takas teklifini kabul etmedi.', targetType: 'swap', targetId: id,
    dedupeKey: `swap-rejected:${id}`, createdBy: recipient,
  });
  return swapView(await readSwapRow(pool, id), recipient);
}

export async function cancelSwap({ swapId, proposerId }) {
  await assertReady({ writes: true });
  const proposer = numericId(proposerId, 'proposer id');
  const id = numericId(swapId, 'swap id');
  const result = await pool.query(`
    update swap_requests set status='cancelled', updated_at=now()
    where id=$1 and proposer_id=$2 and status='pending'
    returning recipient_id
  `, [id, proposer]);
  if (!result.rowCount) throw new Error('swap not cancellable');
  await notifyUser({
    userId: result.rows[0].recipient_id, kind: 'swap_request_cancelled', title: 'Takas teklifi geri çekildi',
    body: 'Gönderen kullanıcı bekleyen takas teklifini iptal etti.', targetType: 'swap', targetId: id,
    dedupeKey: `swap-cancelled:${id}`, createdBy: proposer,
  });
  return swapView(await readSwapRow(pool, id), proposer);
}

export async function confirmSwapReceipt({ swapId, userId }) {
  await assertReady({ writes: true });
  const user = numericId(userId, 'user id');
  const client = await pool.connect();
  let id;
  let otherId;
  let completed = false;
  try {
    await client.query('begin');
    const swap = await readSwapRow(client, swapId, { lock: true });
    id = String(swap.id);
    const proposer = String(swap.proposer_id);
    const recipient = String(swap.recipient_id);
    if (![proposer, recipient].includes(user)) throw new Error('forbidden swap confirmation');
    if (swap.status !== 'active') throw new Error('swap not confirmable');
    const proposerSide = user === proposer;
    otherId = proposerSide ? recipient : proposer;
    const column = proposerSide ? 'proposer_received_at' : 'recipient_received_at';
    const updated = await client.query(`
      update swap_requests
      set ${column}=coalesce(${column},now()), updated_at=now()
      where id=$1
      returning proposer_received_at,recipient_received_at
    `, [id]);
    const both = updated.rows[0].proposer_received_at && updated.rows[0].recipient_received_at;
    if (both) {
      const ids = [String(swap.offered_listing_id), String(swap.requested_listing_id)];
      await lockListings(client, ids);
      await client.query(`update listings set status='swapped', order_id=null, updated_at=now() where id=any($1::bigint[]) and status='reserved'`, [ids]);
      await client.query(`update swap_requests set status='completed', completed_at=now(), updated_at=now() where id=$1`, [id]);
      completed = true;
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  await notifyUser({
    userId: otherId,
    kind: completed ? 'swap_completed' : 'swap_receipt_confirmed',
    title: completed ? 'Takas tamamlandı' : 'Karşı taraf teslimatı onayladı',
    body: completed ? 'İki taraf da karşı itemi aldığını onayladı. Takas tamamlandı.' : 'Diğer taraf karşı itemi aldığını onayladı. Sen de yalnızca itemi gerçekten aldıysan onay ver.',
    targetType: 'swap', targetId: id, dedupeKey: `${completed ? 'swap-completed' : 'swap-confirm'}:${id}:${user}`, createdBy: user,
  });
  return swapView(await readSwapRow(pool, id), user);
}

export async function reportSwapProblem({ swapId, userId, reason }) {
  await assertReady({ writes: true });
  const user = numericId(userId, 'user id');
  const safeReason = safeText(reason, { min: 10, max: 1500, label: 'swap dispute reason' });
  const client = await pool.connect();
  let id;
  let otherId;
  let disputeId;
  try {
    await client.query('begin');
    const swap = await readSwapRow(client, swapId, { lock: true });
    id = String(swap.id);
    const proposer = String(swap.proposer_id);
    const recipient = String(swap.recipient_id);
    if (![proposer, recipient].includes(user)) throw new Error('forbidden swap dispute');
    if (swap.status === 'disputed') {
      const existing = await client.query(`select id from swap_disputes where swap_id=$1 and status='open' limit 1`, [id]);
      if (existing.rowCount) {
        disputeId = existing.rows[0].id;
        await client.query('commit');
        return swapView(await readSwapRow(pool, id), user);
      }
    }
    if (swap.status !== 'active') throw new Error('swap not disputable');
    const inserted = await client.query(`
      insert into swap_disputes (swap_id,opened_by,reason,status,resolution,resolved_by,created_at,updated_at,resolved_at)
      values ($1,$2,$3,'open',null,null,now(),now(),null)
      returning id
    `, [id, user, safeReason]);
    disputeId = inserted.rows[0].id;
    await client.query(`update swap_requests set status='disputed', updated_at=now() where id=$1`, [id]);
    otherId = user === proposer ? recipient : proposer;
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  await Promise.all([
    createAdminNotification({
      kind: 'swap_dispute_opened', title: `Takas #${id} için sorun bildirildi`, body: safeReason,
      targetType: 'swap', targetId: id, createdBy: user,
    }).catch(() => null),
    notifyUser({
      userId: otherId, kind: 'swap_dispute_opened', title: 'Takas incelemeye alındı',
      body: 'Karşı taraf sorun bildirdi. İki ilan da yönetim kararı verilene kadar kilitli kalacak.',
      targetType: 'swap', targetId: id, dedupeKey: `swap-dispute:${disputeId}:${otherId}`, createdBy: user,
    }),
  ]);
  return swapView(await readSwapRow(pool, id), user);
}

export async function listAdminSwaps({ status = '', limit = 50 } = {}) {
  await assertReady();
  const allowed = new Set(['pending','active','completed','rejected','cancelled','disputed']);
  const safeStatus = allowed.has(String(status)) ? String(status) : '';
  const params = [];
  let where = '';
  if (safeStatus) {
    params.push(safeStatus);
    where = `where s.status=$${params.length}`;
  }
  params.push(safeLimit(limit));
  const result = await pool.query(`
    select s.*,
      ol.id as offered_listing_id, ol.title as offered_title, ol.server as offered_server,
      ol.price as offered_price, ol.status as offered_status,
      rl.id as requested_listing_id, rl.title as requested_title, rl.server as requested_server,
      rl.price as requested_price, rl.status as requested_status,
      sd.id as dispute_id, sd.status as dispute_status, sd.reason as dispute_reason, sd.resolution as dispute_resolution
    from swap_requests s
    join listings ol on ol.id=s.offered_listing_id
    join listings rl on rl.id=s.requested_listing_id
    left join swap_disputes sd on sd.swap_id=s.id and sd.status='open'
    ${where}
    order by s.id desc
    limit $${params.length}
  `, params);
  return result.rows.map((row) => swapView(row, null, { admin: true }));
}

export async function resolveSwapDispute({ swapId, adminId, adminRole, resolution }) {
  await assertReady({ writes: true });
  const admin = numericId(adminId, 'admin id');
  const id = numericId(swapId, 'swap id');
  const safeResolution = String(resolution || '').trim().toLowerCase();
  if (!['complete','cancel'].includes(safeResolution)) throw new Error('invalid swap resolution');
  const client = await pool.connect();
  let participants;
  try {
    await client.query('begin');
    const swap = await readSwapRow(client, id, { lock: true });
    if (swap.status !== 'disputed') throw new Error('swap not resolvable');
    const dispute = await client.query(`select * from swap_disputes where swap_id=$1 and status='open' limit 1 for update`, [id]);
    if (!dispute.rowCount) throw new Error('swap dispute not found');
    const ids = [String(swap.offered_listing_id), String(swap.requested_listing_id)];
    await lockListings(client, ids);
    const listingStatus = safeResolution === 'complete' ? 'swapped' : 'active';
    const swapStatus = safeResolution === 'complete' ? 'completed' : 'cancelled';
    await client.query(`update listings set status=$2, order_id=null, updated_at=now() where id=any($1::bigint[])`, [ids, listingStatus]);
    await client.query(`
      update swap_requests
      set status=$2, completed_at=case when $2='completed' then now() else completed_at end, updated_at=now()
      where id=$1
    `, [id, swapStatus]);
    await client.query(`
      update swap_disputes
      set status='resolved', resolution=$2, resolved_by=$3, updated_at=now(), resolved_at=now()
      where id=$1
    `, [dispute.rows[0].id, safeResolution, admin]);
    participants = [String(swap.proposer_id), String(swap.recipient_id)];
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  await writeAudit({
    actorId: admin, actorRole: adminRole, action: `swap_${safeResolution}`, targetType: 'swap', targetId: id,
    metadata: { resolution: safeResolution },
  }).catch(() => null);
  await Promise.all(participants.map((userId) => notifyUser({
    userId,
    kind: 'swap_dispute_resolved',
    title: safeResolution === 'complete' ? 'Takas yönetim tarafından tamamlandı' : 'Takas yönetim tarafından iptal edildi',
    body: safeResolution === 'complete' ? 'Yönetim incelemesi sonrası takas tamamlandı olarak işaretlendi.' : 'Yönetim incelemesi sonrası takas iptal edildi ve ilan kilitleri kaldırıldı.',
    targetType: 'swap', targetId: id, dedupeKey: `swap-resolved:${id}:${safeResolution}:${userId}`, createdBy: admin,
  })));
  return swapView(await readSwapRow(pool, id), null, { admin: true });
}

function errorResponse(res, error) {
  const message = String(error?.message || 'swap_error');
  if (message.includes('not found')) return res.status(404).json({ ok: false, error: 'swap_not_found' });
  if (message.includes('forbidden')) return res.status(403).json({ ok: false, error: 'forbidden' });
  if (message.includes('participants must differ')) return res.status(409).json({ ok: false, error: 'self_swap_not_allowed' });
  if (message.includes('server mismatch')) return res.status(409).json({ ok: false, error: 'swap_server_mismatch' });
  if (message.includes('listing not available') || message.includes('not available') || message.includes('not cancellable') || message.includes('not rejectable') || message.includes('not confirmable') || message.includes('not disputable') || message.includes('not resolvable')) {
    return res.status(409).json({ ok: false, error: 'swap_not_available' });
  }
  if (message.includes('disabled') || message.includes('schema incompatible') || message.includes('database unavailable')) {
    return res.status(503).json({ ok: false, error: 'swaps_temporarily_unavailable' });
  }
  if (message.includes('invalid')) return res.status(400).json({ ok: false, error: 'invalid_swap_request' });
  console.error('[KOTAKAS] swap api error:', message);
  return res.status(503).json({ ok: false, error: 'swaps_temporarily_unavailable' });
}

swapsApiRouter.get('/swaps/mine', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try { return res.json({ ok: true, swaps: await listMySwaps(user.id, { limit: req.query.limit }) }); }
  catch (error) { return errorResponse(res, error); }
});

swapsApiRouter.post('/swaps', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try {
    const swap = await createSwapRequest({ proposerId: user.id, offeredListingId: req.body?.offeredListingId, requestedListingId: req.body?.requestedListingId });
    return res.status(201).json({ ok: true, swap });
  } catch (error) { return errorResponse(res, error); }
});

swapsApiRouter.post('/swaps/:swapId/accept', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try { return res.json({ ok: true, swap: await acceptSwap({ swapId: req.params.swapId, recipientId: user.id }) }); }
  catch (error) { return errorResponse(res, error); }
});

swapsApiRouter.post('/swaps/:swapId/reject', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try { return res.json({ ok: true, swap: await rejectSwap({ swapId: req.params.swapId, recipientId: user.id }) }); }
  catch (error) { return errorResponse(res, error); }
});

swapsApiRouter.post('/swaps/:swapId/cancel', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try { return res.json({ ok: true, swap: await cancelSwap({ swapId: req.params.swapId, proposerId: user.id }) }); }
  catch (error) { return errorResponse(res, error); }
});

swapsApiRouter.post('/swaps/:swapId/confirm-receipt', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try { return res.json({ ok: true, swap: await confirmSwapReceipt({ swapId: req.params.swapId, userId: user.id }) }); }
  catch (error) { return errorResponse(res, error); }
});

swapsApiRouter.post('/swaps/:swapId/problem', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try { return res.json({ ok: true, swap: await reportSwapProblem({ swapId: req.params.swapId, userId: user.id, reason: req.body?.reason }) }); }
  catch (error) { return errorResponse(res, error); }
});

swapsApiRouter.get('/admin/swaps', requirePermission(PERMISSIONS.DISPUTES), async (req, res) => {
  try { return res.json({ ok: true, swaps: await listAdminSwaps({ status: req.query.status, limit: req.query.limit }) }); }
  catch (error) { return errorResponse(res, error); }
});

swapsApiRouter.post('/admin/swaps/:swapId/resolve', requirePermission(PERMISSIONS.DISPUTES), async (req, res) => {
  const user = actor(req);
  try {
    const swap = await resolveSwapDispute({ swapId: req.params.swapId, adminId: user.id, adminRole: user.role, resolution: req.body?.resolution });
    return res.json({ ok: true, swap });
  } catch (error) { return errorResponse(res, error); }
});
