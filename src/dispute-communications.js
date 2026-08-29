import { Router } from 'express';
import { config } from './config.js';
import { pool } from './db.js';
import { requireAuthenticated, requirePermission, roleCan } from './authz.js';
import { PERMISSIONS } from './roles.js';
import { writeAudit } from './audit-log.js';
import {
  publishAdminNotification,
  publishAdminNotificationRead,
  publishDisputeMessage,
  publishUserNotification,
  publishUserNotificationRead,
  publishUserNotificationsReadAll,
} from './realtime.js';

export const disputeCommunicationsRouter = Router();

const MESSAGE_COLUMNS = ['id', 'dispute_id', 'sender_id', 'sender_role', 'body', 'created_at'];
const NOTIFICATION_COLUMNS = ['id', 'kind', 'title', 'body', 'target_type', 'target_id', 'created_by', 'created_at', 'read_at'];
const USER_NOTIFICATION_COLUMNS = [
  'id', 'user_id', 'kind', 'title', 'body', 'target_type', 'target_id',
  'dedupe_key', 'created_by', 'created_at', 'read_at',
];
let compatibilityCache = null;
let compatibilityCachedAt = 0;
let userNotificationCompatibilityCache = null;
let userNotificationCompatibilityCachedAt = 0;
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

function safeText(value, { min = 1, max = 2000, label = 'text' } = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < min || text.length > max) throw new Error(`invalid ${label}`);
  return text;
}

function messageView(row) {
  return {
    id: String(row.id),
    disputeId: String(row.dispute_id),
    senderId: String(row.sender_id),
    senderRole: row.sender_role || 'user',
    body: row.body,
    createdAt: row.created_at,
  };
}

function notificationView(row) {
  return {
    id: String(row.id),
    kind: row.kind,
    title: row.title,
    body: row.body,
    targetType: row.target_type,
    targetId: row.target_id == null ? null : String(row.target_id),
    createdBy: row.created_by == null ? null : String(row.created_by),
    createdAt: row.created_at,
    readAt: row.read_at,
    unread: row.read_at == null,
  };
}

function userNotificationView(row) {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    kind: row.kind,
    title: row.title,
    body: row.body,
    targetType: row.target_type,
    targetId: row.target_id == null ? null : String(row.target_id),
    createdBy: row.created_by == null ? null : String(row.created_by),
    createdAt: row.created_at,
    readAt: row.read_at,
    unread: row.read_at == null,
  };
}

export async function detectCommunicationCompatibility({ force = false } = {}) {
  if (!pool) return { ready: false, blockers: ['DATABASE_URL missing'] };
  if (!force && compatibilityCache && Date.now() - compatibilityCachedAt < CACHE_MS) return compatibilityCache;
  const result = await pool.query(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('dispute_messages', 'admin_notifications')
  `);
  const tables = new Map();
  for (const row of result.rows) {
    if (!tables.has(row.table_name)) tables.set(row.table_name, new Set());
    tables.get(row.table_name).add(row.column_name);
  }
  const blockers = [];
  for (const column of MESSAGE_COLUMNS) {
    if (!tables.get('dispute_messages')?.has(column)) blockers.push(`missing_column:dispute_messages.${column}`);
  }
  for (const column of NOTIFICATION_COLUMNS) {
    if (!tables.get('admin_notifications')?.has(column)) blockers.push(`missing_column:admin_notifications.${column}`);
  }
  if (!tables.has('dispute_messages')) blockers.unshift('missing_table:dispute_messages');
  if (!tables.has('admin_notifications')) blockers.unshift('missing_table:admin_notifications');
  compatibilityCache = { ready: blockers.length === 0, blockers };
  compatibilityCachedAt = Date.now();
  return compatibilityCache;
}

export async function detectUserNotificationCompatibility({ force = false } = {}) {
  if (!pool) return { ready: false, blockers: ['DATABASE_URL missing'] };
  if (!force && userNotificationCompatibilityCache && Date.now() - userNotificationCompatibilityCachedAt < CACHE_MS) {
    return userNotificationCompatibilityCache;
  }
  const result = await pool.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'user_notifications'
  `);
  const columns = new Set(result.rows.map((row) => row.column_name));
  const blockers = [];
  if (!result.rowCount) blockers.push('missing_table:user_notifications');
  for (const column of USER_NOTIFICATION_COLUMNS) {
    if (!columns.has(column)) blockers.push(`missing_column:user_notifications.${column}`);
  }
  userNotificationCompatibilityCache = { ready: blockers.length === 0, blockers };
  userNotificationCompatibilityCachedAt = Date.now();
  return userNotificationCompatibilityCache;
}

async function assertReady({ writes = false } = {}) {
  if (!pool) throw new Error('database unavailable');
  if (writes && !config.communicationWritesEnabled) throw new Error('communication writes disabled');
  const status = await detectCommunicationCompatibility();
  if (!status.ready) throw new Error(`communication schema incompatible: ${status.blockers.join(', ')}`);
}

async function assertUserNotificationsReady({ writes = false } = {}) {
  if (!pool) throw new Error('database unavailable');
  if (writes && !config.communicationWritesEnabled) throw new Error('communication writes disabled');
  const status = await detectUserNotificationCompatibility();
  if (!status.ready) throw new Error(`user notification schema incompatible: ${status.blockers.join(', ')}`);
}

async function readDisputeAccess(disputeId, actorId, actorRole) {
  const id = numericId(disputeId, 'dispute id');
  const userId = numericId(actorId, 'user id');
  const result = await pool.query(`
    select d.id, d.status, o.buyer_id, o.seller_id
    from disputes d
    join orders o on o.id = d.order_id
    where d.id = $1
    limit 1
  `, [id]);
  if (!result.rowCount) throw new Error('dispute not found');
  const row = result.rows[0];
  const buyerId = String(row.buyer_id);
  const sellerId = String(row.seller_id);
  const participant = [buyerId, sellerId].includes(userId);
  const admin = roleCan(actorRole, PERMISSIONS.DISPUTES);
  if (!participant && !admin) throw new Error('forbidden dispute access');
  return { id, status: row.status, participant, admin, buyerId, sellerId };
}

export async function listDisputeMessages({ disputeId, actorId, actorRole, limit = 100 }) {
  await assertReady();
  const access = await readDisputeAccess(disputeId, actorId, actorRole);
  const safeLimit = Math.min(200, Math.max(1, Number.parseInt(String(limit), 10) || 100));
  const result = await pool.query(`
    select id, dispute_id, sender_id, sender_role, body, created_at
    from dispute_messages
    where dispute_id = $1
    order by id asc
    limit $2
  `, [access.id, safeLimit]);
  return result.rows.map(messageView);
}

export async function createAdminNotification({ kind, title, body, targetType = 'dispute', targetId = null, createdBy = null }) {
  if (!config.communicationWritesEnabled || !pool) return null;
  const status = await detectCommunicationCompatibility().catch(() => ({ ready: false }));
  if (!status.ready) return null;
  const safeKind = safeText(kind, { max: 80, label: 'notification kind' });
  const safeTitle = safeText(title, { max: 160, label: 'notification title' });
  const safeBody = safeText(body, { max: 1000, label: 'notification body' });
  const safeTargetType = safeText(targetType, { max: 80, label: 'target type' });
  const target = targetId == null ? null : String(targetId).slice(0, 120);
  const creator = createdBy == null ? null : numericId(createdBy, 'created by');
  const result = await pool.query(`
    insert into admin_notifications (kind, title, body, target_type, target_id, created_by, created_at, read_at)
    values ($1,$2,$3,$4,$5,$6,now(),null)
    returning *
  `, [safeKind, safeTitle, safeBody, safeTargetType, target, creator]);
  const notification = notificationView(result.rows[0]);
  publishAdminNotification(notification);
  return notification;
}

export async function createUserNotification({
  userId,
  kind,
  title,
  body,
  targetType = 'system',
  targetId = null,
  dedupeKey = null,
  createdBy = null,
}) {
  if (!config.communicationWritesEnabled || !pool) return null;
  const status = await detectUserNotificationCompatibility().catch(() => ({ ready: false }));
  if (!status.ready) return null;
  const user = numericId(userId, 'notification user id');
  const safeKind = safeText(kind, { max: 80, label: 'notification kind' });
  const safeTitle = safeText(title, { max: 160, label: 'notification title' });
  const safeBody = safeText(body, { max: 1000, label: 'notification body' });
  const safeTargetType = safeText(targetType, { max: 80, label: 'target type' });
  const target = targetId == null ? null : String(targetId).slice(0, 120);
  const dedupe = dedupeKey == null ? null : String(dedupeKey).trim().slice(0, 180);
  const creator = createdBy == null ? null : numericId(createdBy, 'created by');

  const result = await pool.query(`
    insert into user_notifications
      (user_id, kind, title, body, target_type, target_id, dedupe_key, created_by, created_at, read_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8,now(),null)
    on conflict do nothing
    returning *
  `, [user, safeKind, safeTitle, safeBody, safeTargetType, target, dedupe || null, creator]);

  let row = result.rows[0] || null;
  if (!row && dedupe) {
    const existing = await pool.query(`
      select * from user_notifications where user_id = $1 and dedupe_key = $2 limit 1
    `, [user, dedupe]);
    row = existing.rows[0] || null;
  }
  if (!row) return null;
  const notification = userNotificationView(row);
  if (result.rowCount) publishUserNotification(notification);
  return notification;
}

export async function listUserNotifications(userId, { limit = 50, unreadOnly = false } = {}) {
  await assertUserNotificationsReady();
  const user = numericId(userId, 'user id');
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(String(limit), 10) || 50));
  const result = await pool.query(`
    select *
    from user_notifications
    where user_id = $1 ${unreadOnly ? 'and read_at is null' : ''}
    order by id desc
    limit $2
  `, [user, safeLimit]);
  const count = await pool.query(`
    select count(*)::int as count from user_notifications where user_id = $1 and read_at is null
  `, [user]);
  return { unreadCount: Number(count.rows[0]?.count || 0), notifications: result.rows.map(userNotificationView) };
}

export async function markUserNotificationRead({ notificationId, userId }) {
  await assertUserNotificationsReady({ writes: true });
  const id = numericId(notificationId, 'notification id');
  const user = numericId(userId, 'user id');
  const result = await pool.query(`
    update user_notifications
    set read_at = coalesce(read_at, now())
    where id = $1 and user_id = $2
    returning *
  `, [id, user]);
  if (!result.rowCount) throw new Error('notification not found');
  const notification = userNotificationView(result.rows[0]);
  publishUserNotificationRead(notification);
  return notification;
}

export async function markAllUserNotificationsRead(userId) {
  await assertUserNotificationsReady({ writes: true });
  const user = numericId(userId, 'user id');
  const result = await pool.query(`
    update user_notifications
    set read_at = coalesce(read_at, now())
    where user_id = $1 and read_at is null
  `, [user]);
  publishUserNotificationsReadAll(user);
  return { updated: result.rowCount };
}

export async function addDisputeMessage({ disputeId, senderId, senderRole, body }) {
  await assertReady({ writes: true });
  const access = await readDisputeAccess(disputeId, senderId, senderRole);
  if (access.status !== 'open') throw new Error('dispute closed');
  const text = safeText(body, { max: 2000, label: 'message body' });
  const sender = numericId(senderId, 'sender id');
  const result = await pool.query(`
    insert into dispute_messages (dispute_id, sender_id, sender_role, body, created_at)
    values ($1,$2,$3,$4,now())
    returning *
  `, [access.id, sender, senderRole || 'user', text]);
  const message = messageView(result.rows[0]);

  publishDisputeMessage({ message, buyerId: access.buyerId, sellerId: access.sellerId });

  const recipients = access.admin
    ? [access.buyerId, access.sellerId]
    : [access.buyerId, access.sellerId].filter((id) => id !== sender);
  const title = access.admin
    ? `İhtilaf #${access.id}: Yönetimden mesaj`
    : `İhtilaf #${access.id}: Yeni mesaj`;
  const preview = text.length > 220 ? `${text.slice(0, 217)}...` : text;
  await Promise.all([...new Set(recipients)].map((recipient) => createUserNotification({
    userId: recipient,
    kind: access.admin ? 'admin_dispute_message' : 'dispute_message',
    title,
    body: preview,
    targetType: 'dispute',
    targetId: access.id,
    dedupeKey: `dispute-message:${message.id}`,
    createdBy: sender,
  }).catch(() => null)));

  if (access.participant && !access.admin) {
    await createAdminNotification({
      kind: 'dispute_message',
      title: `İhtilaf #${access.id} yeni mesaj`,
      body: text.length > 180 ? `${text.slice(0, 177)}...` : text,
      targetId: access.id,
      createdBy: sender,
    });
  }
  await writeAudit({
    actorId: sender,
    actorRole: senderRole,
    action: 'dispute_message_added',
    targetType: 'dispute',
    targetId: access.id,
    metadata: { messageId: message.id },
  }).catch(() => {});
  return message;
}

export async function listAdminNotifications({ limit = 50, unreadOnly = false } = {}) {
  await assertReady();
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(String(limit), 10) || 50));
  const result = await pool.query(`
    select * from admin_notifications
    ${unreadOnly ? 'where read_at is null' : ''}
    order by id desc
    limit $1
  `, [safeLimit]);
  const count = await pool.query(`select count(*)::int as count from admin_notifications where read_at is null`);
  return { unreadCount: Number(count.rows[0]?.count || 0), notifications: result.rows.map(notificationView) };
}

export async function markAdminNotificationRead(notificationId) {
  await assertReady({ writes: true });
  const id = numericId(notificationId, 'notification id');
  const result = await pool.query(`
    update admin_notifications set read_at = coalesce(read_at, now()) where id = $1 returning *
  `, [id]);
  if (!result.rowCount) throw new Error('notification not found');
  const notification = notificationView(result.rows[0]);
  publishAdminNotificationRead(notification);
  return notification;
}

function errorResponse(res, error) {
  const message = String(error?.message || 'communication_error');
  if (message.includes('not found')) return res.status(404).json({ ok: false, error: 'not_found' });
  if (message.includes('forbidden')) return res.status(403).json({ ok: false, error: 'forbidden' });
  if (message.includes('closed')) return res.status(409).json({ ok: false, error: 'dispute_closed' });
  if (message.includes('disabled') || message.includes('schema incompatible') || message.includes('database unavailable')) {
    return res.status(503).json({ ok: false, error: 'communications_temporarily_unavailable' });
  }
  if (message.includes('invalid')) return res.status(400).json({ ok: false, error: 'invalid_communication_request' });
  console.error('[KOTAKAS] communication api error:', message);
  return res.status(503).json({ ok: false, error: 'communications_temporarily_unavailable' });
}

disputeCommunicationsRouter.get('/disputes/:disputeId/messages', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try {
    return res.json({ ok: true, messages: await listDisputeMessages({ disputeId: req.params.disputeId, actorId: user.id, actorRole: user.role, limit: req.query.limit }) });
  } catch (error) {
    return errorResponse(res, error);
  }
});

disputeCommunicationsRouter.post('/disputes/:disputeId/messages', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try {
    const message = await addDisputeMessage({ disputeId: req.params.disputeId, senderId: user.id, senderRole: user.role, body: req.body?.body });
    return res.status(201).json({ ok: true, message });
  } catch (error) {
    return errorResponse(res, error);
  }
});

disputeCommunicationsRouter.get('/notifications/mine', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try {
    return res.json({
      ok: true,
      ...(await listUserNotifications(user.id, {
        limit: req.query.limit,
        unreadOnly: String(req.query.unread || '') === '1',
      })),
    });
  } catch (error) {
    return errorResponse(res, error);
  }
});

disputeCommunicationsRouter.post('/notifications/read-all', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try {
    return res.json({ ok: true, ...(await markAllUserNotificationsRead(user.id)) });
  } catch (error) {
    return errorResponse(res, error);
  }
});

disputeCommunicationsRouter.post('/notifications/:notificationId/read', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try {
    return res.json({
      ok: true,
      notification: await markUserNotificationRead({ notificationId: req.params.notificationId, userId: user.id }),
    });
  } catch (error) {
    return errorResponse(res, error);
  }
});

disputeCommunicationsRouter.get('/admin/notifications', requirePermission(PERMISSIONS.DISPUTES), async (req, res) => {
  try {
    return res.json({ ok: true, ...(await listAdminNotifications({ limit: req.query.limit, unreadOnly: String(req.query.unread || '') === '1' })) });
  } catch (error) {
    return errorResponse(res, error);
  }
});

disputeCommunicationsRouter.post('/admin/notifications/:notificationId/read', requirePermission(PERMISSIONS.DISPUTES), async (req, res) => {
  try {
    return res.json({ ok: true, notification: await markAdminNotificationRead(req.params.notificationId) });
  } catch (error) {
    return errorResponse(res, error);
  }
});
