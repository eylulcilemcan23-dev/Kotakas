import { Router } from 'express';
import { config } from './config.js';
import { pool } from './db.js';
import { requireAuthenticated, requirePermission } from './authz.js';
import { PERMISSIONS } from './roles.js';
import { createAdminNotification, createUserNotification } from './dispute-communications.js';

export const supportApiRouter = Router();

const TICKET_COLUMNS = ['id','user_id','email','subject','status','created_at','updated_at','closed_at'];
const MESSAGE_COLUMNS = ['id','ticket_id','sender_id','sender_role','body','created_at'];
let cache = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

function numericId(value, label = 'id') {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) throw new Error(`invalid ${label}`);
  return text;
}

function subjectText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < 5 || text.length > 120) throw new Error('invalid support subject');
  return text;
}

function bodyText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < 2 || text.length > 2000) throw new Error('invalid support message');
  return text;
}

function safeLimit(value, fallback = 50) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Math.min(100, Math.max(1, Number.isFinite(parsed) ? parsed : fallback));
}

function actor(req) {
  const user = req.user || req.auth || {};
  return {
    id: user.id == null ? null : String(user.id),
    email: typeof user.email === 'string' ? user.email.trim().toLowerCase() : '',
    role: user.role || 'user',
  };
}

function ticketView(row, { admin = false } = {}) {
  if (!row) return null;
  return {
    id: String(row.id),
    subject: row.subject,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    lastMessage: row.last_message || null,
    ...(admin ? { userId: String(row.user_id), email: row.email } : {}),
  };
}

function messageView(row) {
  return {
    id: String(row.id),
    senderRole: row.sender_role,
    body: row.body,
    createdAt: row.created_at,
  };
}

export async function detectSupportCompatibility({ force = false } = {}) {
  if (!pool) return { ready: false, blockers: ['DATABASE_URL missing'] };
  if (!force && cache && Date.now() - cachedAt < CACHE_MS) return cache;
  const result = await pool.query(`
    select table_name,column_name
    from information_schema.columns
    where table_schema='public' and table_name in ('support_tickets','support_messages')
  `);
  const tables = new Map();
  for (const row of result.rows) {
    if (!tables.has(row.table_name)) tables.set(row.table_name, new Set());
    tables.get(row.table_name).add(row.column_name);
  }
  const blockers = [];
  if (!tables.has('support_tickets')) blockers.push('missing_table:support_tickets');
  if (!tables.has('support_messages')) blockers.push('missing_table:support_messages');
  for (const column of TICKET_COLUMNS) if (!tables.get('support_tickets')?.has(column)) blockers.push(`missing_column:support_tickets.${column}`);
  for (const column of MESSAGE_COLUMNS) if (!tables.get('support_messages')?.has(column)) blockers.push(`missing_column:support_messages.${column}`);
  cache = { ready: blockers.length === 0, blockers: [...new Set(blockers)] };
  cachedAt = Date.now();
  return cache;
}

async function assertReady({ writes = false } = {}) {
  if (!pool) throw new Error('database unavailable');
  if (writes && !config.supportWritesEnabled) throw new Error('support writes disabled');
  const status = await detectSupportCompatibility();
  if (!status.ready) throw new Error(`support schema incompatible: ${status.blockers.join(', ')}`);
}

export async function createSupportTicket({ userId, email, subject, body }) {
  await assertReady({ writes: true });
  const user = numericId(userId, 'user id');
  const safeEmail = String(email || '').trim().toLowerCase();
  if (!safeEmail || safeEmail.length > 254 || !safeEmail.includes('@')) throw new Error('invalid support email');
  const safeSubject = subjectText(subject);
  const safeBody = bodyText(body);
  const client = await pool.connect();
  let ticket;
  try {
    await client.query('begin');
    const inserted = await client.query(`
      insert into support_tickets (user_id,email,subject,status,created_at,updated_at,closed_at)
      values ($1,$2,$3,'open',now(),now(),null)
      returning *
    `, [user, safeEmail, safeSubject]);
    ticket = inserted.rows[0];
    await client.query(`
      insert into support_messages (ticket_id,sender_id,sender_role,body,created_at)
      values ($1,$2,'user',$3,now())
    `, [ticket.id, user, safeBody]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  await createAdminNotification({
    kind: 'support_ticket_opened',
    title: `Destek talebi #${ticket.id}`,
    body: safeSubject,
    targetType: 'support_ticket',
    targetId: ticket.id,
    createdBy: user,
  }).catch(() => null);
  return ticketView(ticket);
}

export async function listMySupportTickets(userId, { limit = 50 } = {}) {
  await assertReady();
  const user = numericId(userId, 'user id');
  const result = await pool.query(`
    select t.*,
      (select body from support_messages m where m.ticket_id=t.id order by m.id desc limit 1) as last_message
    from support_tickets t
    where t.user_id=$1
    order by t.id desc
    limit $2
  `, [user, safeLimit(limit)]);
  return result.rows.map((row) => ticketView(row));
}

export async function listAdminSupportTickets({ status = '', limit = 50 } = {}) {
  await assertReady();
  const allowed = new Set(['open','answered','closed']);
  const params = [];
  let where = '';
  if (allowed.has(String(status))) {
    params.push(String(status));
    where = `where t.status=$${params.length}`;
  }
  params.push(safeLimit(limit));
  const result = await pool.query(`
    select t.*,
      (select body from support_messages m where m.ticket_id=t.id order by m.id desc limit 1) as last_message
    from support_tickets t
    ${where}
    order by case when t.status='closed' then 1 else 0 end, t.updated_at desc
    limit $${params.length}
  `, params);
  return result.rows.map((row) => ticketView(row, { admin: true }));
}

export async function readSupportThread({ ticketId, userId = null, admin = false }) {
  await assertReady();
  const id = numericId(ticketId, 'ticket id');
  const params = [id];
  let owner = '';
  if (!admin) {
    params.push(numericId(userId, 'user id'));
    owner = 'and user_id=$2';
  }
  const ticketResult = await pool.query(`select * from support_tickets where id=$1 ${owner} limit 1`, params);
  if (!ticketResult.rowCount) throw new Error('support ticket not found');
  const messages = await pool.query(`
    select id,ticket_id,sender_id,sender_role,body,created_at
    from support_messages where ticket_id=$1 order by id asc
  `, [id]);
  return {
    ticket: ticketView(ticketResult.rows[0], { admin }),
    messages: messages.rows.map(messageView),
  };
}

export async function addSupportMessage({ ticketId, senderId, senderRole, body, admin = false }) {
  await assertReady({ writes: true });
  const id = numericId(ticketId, 'ticket id');
  const sender = numericId(senderId, 'sender id');
  const safeBody = bodyText(body);
  const client = await pool.connect();
  let ticket;
  try {
    await client.query('begin');
    const result = await client.query('select * from support_tickets where id=$1 for update', [id]);
    if (!result.rowCount) throw new Error('support ticket not found');
    ticket = result.rows[0];
    if (!admin && String(ticket.user_id) !== sender) throw new Error('forbidden support ticket');
    if (ticket.status === 'closed') throw new Error('support ticket closed');
    const role = admin ? String(senderRole || 'admin_full') : 'user';
    await client.query(`
      insert into support_messages (ticket_id,sender_id,sender_role,body,created_at)
      values ($1,$2,$3,$4,now())
    `, [id, sender, role, safeBody]);
    await client.query(`
      update support_tickets set status=$2,updated_at=now() where id=$1
    `, [id, admin ? 'answered' : 'open']);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  if (admin) {
    await createUserNotification({
      userId: ticket.user_id,
      kind: 'support_reply',
      title: `Destek talebi #${id} yanıtlandı`,
      body: 'KOTAKAS destek ekibi talebine yanıt verdi.',
      targetType: 'support_ticket',
      targetId: id,
      dedupeKey: `support-reply:${id}:${Date.now()}`,
      createdBy: sender,
    }).catch(() => null);
  } else {
    await createAdminNotification({
      kind: 'support_ticket_message',
      title: `Destek talebi #${id} güncellendi`,
      body: ticket.subject,
      targetType: 'support_ticket',
      targetId: id,
      createdBy: sender,
    }).catch(() => null);
  }
  return readSupportThread({ ticketId: id, userId: ticket.user_id, admin });
}

export async function closeSupportTicket({ ticketId, adminId }) {
  await assertReady({ writes: true });
  const id = numericId(ticketId, 'ticket id');
  numericId(adminId, 'admin id');
  const result = await pool.query(`
    update support_tickets
    set status='closed',closed_at=coalesce(closed_at,now()),updated_at=now()
    where id=$1 and status<>'closed'
    returning *
  `, [id]);
  if (!result.rowCount) throw new Error('support ticket not closable');
  await createUserNotification({
    userId: result.rows[0].user_id,
    kind: 'support_closed',
    title: `Destek talebi #${id} kapatıldı`,
    body: 'Destek talebin kapatıldı. Yeni bir konu için yeni talep açabilirsin.',
    targetType: 'support_ticket',
    targetId: id,
    dedupeKey: `support-closed:${id}`,
    createdBy: adminId,
  }).catch(() => null);
  return ticketView(result.rows[0], { admin: true });
}

function errorResponse(res, error) {
  const message = String(error?.message || 'support_error');
  if (message.includes('not found')) return res.status(404).json({ ok: false, error: 'support_ticket_not_found' });
  if (message.includes('forbidden')) return res.status(403).json({ ok: false, error: 'forbidden' });
  if (message.includes('closed') || message.includes('not closable')) return res.status(409).json({ ok: false, error: 'support_ticket_closed' });
  if (message.includes('invalid')) return res.status(400).json({ ok: false, error: 'invalid_support_request' });
  if (message.includes('disabled') || message.includes('schema incompatible') || message.includes('database unavailable')) {
    return res.status(503).json({ ok: false, error: 'support_temporarily_unavailable' });
  }
  console.error('[KOTAKAS] support error:', message);
  return res.status(503).json({ ok: false, error: 'support_temporarily_unavailable' });
}

supportApiRouter.post('/support/tickets', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try {
    const ticket = await createSupportTicket({ userId: user.id, email: user.email, subject: req.body?.subject, body: req.body?.body });
    return res.status(201).json({ ok: true, ticket });
  } catch (error) { return errorResponse(res, error); }
});

supportApiRouter.get('/support/tickets/mine', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try { return res.json({ ok: true, tickets: await listMySupportTickets(user.id, { limit: req.query.limit }) }); }
  catch (error) { return errorResponse(res, error); }
});

supportApiRouter.get('/support/tickets/:ticketId', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try { return res.json({ ok: true, ...(await readSupportThread({ ticketId: req.params.ticketId, userId: user.id })) }); }
  catch (error) { return errorResponse(res, error); }
});

supportApiRouter.post('/support/tickets/:ticketId/messages', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try {
    return res.json({ ok: true, ...(await addSupportMessage({ ticketId: req.params.ticketId, senderId: user.id, senderRole: user.role, body: req.body?.body })) });
  } catch (error) { return errorResponse(res, error); }
});

supportApiRouter.get('/admin/support/tickets', requirePermission(PERMISSIONS.SUPPORT), async (req, res) => {
  try { return res.json({ ok: true, tickets: await listAdminSupportTickets({ status: req.query.status, limit: req.query.limit }) }); }
  catch (error) { return errorResponse(res, error); }
});

supportApiRouter.get('/admin/support/tickets/:ticketId', requirePermission(PERMISSIONS.SUPPORT), async (req, res) => {
  try { return res.json({ ok: true, ...(await readSupportThread({ ticketId: req.params.ticketId, admin: true })) }); }
  catch (error) { return errorResponse(res, error); }
});

supportApiRouter.post('/admin/support/tickets/:ticketId/reply', requirePermission(PERMISSIONS.SUPPORT), async (req, res) => {
  const user = actor(req);
  try {
    return res.json({ ok: true, ...(await addSupportMessage({ ticketId: req.params.ticketId, senderId: user.id, senderRole: user.role, body: req.body?.body, admin: true })) });
  } catch (error) { return errorResponse(res, error); }
});

supportApiRouter.post('/admin/support/tickets/:ticketId/close', requirePermission(PERMISSIONS.SUPPORT), async (req, res) => {
  const user = actor(req);
  try { return res.json({ ok: true, ticket: await closeSupportTicket({ ticketId: req.params.ticketId, adminId: user.id }) }); }
  catch (error) { return errorResponse(res, error); }
});
