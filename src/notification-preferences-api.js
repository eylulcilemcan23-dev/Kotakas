import { Router } from 'express';
import { config } from './config.js';
import { pool } from './db.js';
import { requireAuthenticated } from './authz.js';

export const notificationPreferencesRouter = Router();

const REQUIRED_COLUMNS = [
  'user_id', 'messages_enabled', 'market_enabled', 'disputes_enabled', 'system_enabled', 'updated_at',
];
const EDITABLE_KEYS = ['messages', 'market', 'disputes', 'system'];
const LOCKED_KEYS = ['finance', 'security'];
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

function defaultPreferences() {
  return {
    messages: true,
    market: true,
    disputes: true,
    system: true,
    finance: true,
    security: true,
  };
}

function preferenceView(row) {
  if (!row) return { preferences: defaultPreferences(), locked: [...LOCKED_KEYS], updatedAt: null };
  return {
    preferences: {
      messages: row.messages_enabled !== false,
      market: row.market_enabled !== false,
      disputes: row.disputes_enabled !== false,
      system: row.system_enabled !== false,
      finance: true,
      security: true,
    },
    locked: [...LOCKED_KEYS],
    updatedAt: row.updated_at || null,
  };
}

export async function detectNotificationPreferenceCompatibility({ force = false } = {}) {
  if (!pool) return { ready: false, blockers: ['DATABASE_URL missing'] };
  if (!force && compatibilityCache && Date.now() - compatibilityCachedAt < CACHE_MS) return compatibilityCache;
  const result = await pool.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'user_notification_preferences'
  `);
  const columns = new Set(result.rows.map((row) => row.column_name));
  const blockers = [];
  if (!result.rowCount) blockers.push('missing_table:user_notification_preferences');
  for (const column of REQUIRED_COLUMNS) {
    if (!columns.has(column)) blockers.push(`missing_column:user_notification_preferences.${column}`);
  }
  compatibilityCache = { ready: blockers.length === 0, blockers };
  compatibilityCachedAt = Date.now();
  return compatibilityCache;
}

async function assertReady({ writes = false } = {}) {
  if (!pool) throw new Error('database unavailable');
  if (writes && !config.communicationWritesEnabled) throw new Error('notification preference writes disabled');
  const status = await detectNotificationPreferenceCompatibility();
  if (!status.ready) throw new Error(`notification preference schema incompatible: ${status.blockers.join(', ')}`);
}

export async function getUserNotificationPreferences(userId) {
  await assertReady();
  const user = numericId(userId, 'user id');
  const result = await pool.query(`
    select user_id, messages_enabled, market_enabled, disputes_enabled, system_enabled, updated_at
    from user_notification_preferences
    where user_id = $1
    limit 1
  `, [user]);
  return preferenceView(result.rows[0] || null);
}

function normalizePatch(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const patch = {};
  for (const key of EDITABLE_KEYS) {
    if (!(key in source)) continue;
    if (typeof source[key] !== 'boolean') throw new Error(`invalid ${key} preference`);
    patch[key] = source[key];
  }
  if (!Object.keys(patch).length) throw new Error('invalid notification preference patch');
  return patch;
}

export async function updateUserNotificationPreferences(userId, input) {
  await assertReady({ writes: true });
  const user = numericId(userId, 'user id');
  const patch = normalizePatch(input);
  const current = await getUserNotificationPreferences(user);
  const next = { ...current.preferences, ...patch, finance: true, security: true };
  const result = await pool.query(`
    insert into user_notification_preferences
      (user_id, messages_enabled, market_enabled, disputes_enabled, system_enabled, updated_at)
    values ($1,$2,$3,$4,$5,now())
    on conflict (user_id) do update set
      messages_enabled = excluded.messages_enabled,
      market_enabled = excluded.market_enabled,
      disputes_enabled = excluded.disputes_enabled,
      system_enabled = excluded.system_enabled,
      updated_at = now()
    returning user_id, messages_enabled, market_enabled, disputes_enabled, system_enabled, updated_at
  `, [user, next.messages, next.market, next.disputes, next.system]);
  return preferenceView(result.rows[0]);
}

function errorResponse(res, error) {
  const message = String(error?.message || 'notification_preference_error');
  if (message.includes('invalid')) return res.status(400).json({ ok: false, error: 'invalid_notification_preferences' });
  if (message.includes('disabled') || message.includes('schema incompatible') || message.includes('database unavailable')) {
    return res.status(503).json({ ok: false, error: 'notification_preferences_temporarily_unavailable' });
  }
  console.error('[KOTAKAS] notification preference api error:', message);
  return res.status(503).json({ ok: false, error: 'notification_preferences_temporarily_unavailable' });
}

notificationPreferencesRouter.get('/notification-preferences/mine', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try {
    return res.json({ ok: true, ...(await getUserNotificationPreferences(user.id)) });
  } catch (error) {
    return errorResponse(res, error);
  }
});

notificationPreferencesRouter.patch('/notification-preferences/mine', requireAuthenticated, async (req, res) => {
  const user = actor(req);
  try {
    return res.json({ ok: true, ...(await updateUserNotificationPreferences(user.id, req.body)) });
  } catch (error) {
    return errorResponse(res, error);
  }
});
