import { config } from './config.js';
import { pool } from './db.js';

const REQUIRED_COLUMNS = [
  'id', 'actor_id', 'actor_role', 'action', 'target_type', 'target_id', 'metadata', 'created_at',
];

let cache = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

function safeText(value, max = 120) {
  const text = value == null ? '' : String(value).trim();
  if (!text || text.length > max) throw new Error('invalid audit value');
  return text;
}

export async function detectAuditCompatibility({ force = false } = {}) {
  if (!pool) return { ready: false, blockers: ['DATABASE_URL missing'] };
  if (!force && cache && Date.now() - cachedAt < CACHE_MS) return cache;

  const result = await pool.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'audit_logs'
  `);
  const columns = new Set(result.rows.map((row) => row.column_name));
  const blockers = [];
  if (!result.rowCount) blockers.push('missing_table:audit_logs');
  for (const column of REQUIRED_COLUMNS) {
    if (!columns.has(column)) blockers.push(`missing_column:audit_logs.${column}`);
  }

  cache = { ready: blockers.length === 0, blockers };
  cachedAt = Date.now();
  return cache;
}

export async function writeAudit({ actorId, actorRole, action, targetType, targetId, metadata = {} }) {
  if (!config.auditLogEnabled) return { skipped: true, reason: 'audit_log_disabled' };
  const compatibility = await detectAuditCompatibility();
  if (!compatibility.ready) throw new Error(`audit schema incompatible: ${compatibility.blockers.join(', ')}`);

  const actor = actorId == null ? null : String(actorId);
  const role = actorRole == null ? null : String(actorRole).slice(0, 64);
  const safeAction = safeText(action, 120);
  const safeTargetType = safeText(targetType, 80);
  const safeTargetId = targetId == null ? null : String(targetId).slice(0, 120);
  const safeMetadata = metadata && typeof metadata === 'object' ? metadata : {};

  const result = await pool.query(`
    insert into audit_logs (actor_id, actor_role, action, target_type, target_id, metadata, created_at)
    values ($1, $2, $3, $4, $5, $6::jsonb, now())
    returning id, actor_id, actor_role, action, target_type, target_id, metadata, created_at
  `, [actor, role, safeAction, safeTargetType, safeTargetId, JSON.stringify(safeMetadata)]);
  return result.rows[0];
}

export async function listAuditLogs({ limit = 50, action = '' } = {}) {
  const compatibility = await detectAuditCompatibility();
  if (!compatibility.ready) throw new Error(`audit schema incompatible: ${compatibility.blockers.join(', ')}`);
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(String(limit), 10) || 50));
  const safeAction = typeof action === 'string' ? action.trim().slice(0, 120) : '';
  const params = [];
  let where = '';
  if (safeAction) {
    params.push(safeAction);
    where = `where action = $${params.length}`;
  }
  params.push(safeLimit);
  const result = await pool.query(`
    select id, actor_id, actor_role, action, target_type, target_id, metadata, created_at
    from audit_logs
    ${where}
    order by id desc
    limit $${params.length}
  `, params);
  return result.rows.map((row) => ({
    id: String(row.id),
    actorId: row.actor_id == null ? null : String(row.actor_id),
    actorRole: row.actor_role || '',
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id == null ? null : String(row.target_id),
    metadata: row.metadata || {},
    createdAt: row.created_at,
  }));
}
