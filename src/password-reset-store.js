import crypto from 'node:crypto';
import { config } from './config.js';
import { pool } from './db.js';

const REQUIRED = ['id', 'token_hash', 'email', 'expires_at', 'used_at', 'created_at'];
let cache = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function parseResetTtlMs(value = config.passwordResetTtl) {
  const text = String(value || '').trim().toLowerCase();
  const match = text.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 30 * 60 * 1000;
  const amount = Number(match[1]);
  const multiplier = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  return Math.min(24 * 60 * 60 * 1000, Math.max(5 * 60 * 1000, amount * multiplier));
}

export function hashPasswordResetToken(token) {
  const value = typeof token === 'string' ? token.trim() : '';
  if (!value) return '';
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function detectPasswordResetStoreCompatibility({ force = false } = {}) {
  if (!pool) return { ready: false, blockers: ['DATABASE_URL missing'] };
  if (!force && cache && Date.now() - cachedAt < CACHE_MS) return cache;
  const result = await pool.query(`
    select column_name
    from information_schema.columns
    where table_schema='public' and table_name='password_reset_tokens'
  `);
  const columns = new Set(result.rows.map((row) => row.column_name));
  const blockers = [];
  if (!columns.size) blockers.push('missing_table:password_reset_tokens');
  for (const column of REQUIRED) if (!columns.has(column)) blockers.push(`missing_column:password_reset_tokens.${column}`);
  cache = { ready: blockers.length === 0, blockers: [...new Set(blockers)] };
  cachedAt = Date.now();
  return cache;
}

async function assertReady() {
  const status = await detectPasswordResetStoreCompatibility();
  if (!status.ready) throw new Error(`password reset schema incompatible: ${status.blockers.join(', ')}`);
}

export async function issuePasswordResetToken(email, queryable = pool) {
  await assertReady();
  const safeEmail = normalizeEmail(email);
  if (!safeEmail || !safeEmail.includes('@')) throw new Error('invalid reset email');
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashPasswordResetToken(token);
  const expiresAt = new Date(Date.now() + parseResetTtlMs());
  await queryable.query(`
    insert into password_reset_tokens (token_hash,email,expires_at,used_at,created_at)
    values ($1,$2,$3,null,now())
  `, [tokenHash, safeEmail, expiresAt]);
  await queryable.query(`
    update password_reset_tokens
    set used_at=coalesce(used_at,now())
    where lower(email)=lower($1) and token_hash<>$2 and used_at is null
  `, [safeEmail, tokenHash]);
  return { token, expiresAt };
}

export async function consumePasswordResetToken(token, queryable = pool) {
  await assertReady();
  const tokenHash = hashPasswordResetToken(token);
  if (!tokenHash) return null;
  const result = await queryable.query(`
    update password_reset_tokens
    set used_at=now()
    where token_hash=$1 and used_at is null and expires_at>now()
    returning email
  `, [tokenHash]);
  return result.rowCount ? { email: normalizeEmail(result.rows[0].email) } : null;
}

export async function revokePasswordResetToken(token, queryable = pool) {
  const tokenHash = hashPasswordResetToken(token);
  if (!tokenHash || !queryable) return false;
  const result = await queryable.query(
    'delete from password_reset_tokens where token_hash=$1 and used_at is null',
    [tokenHash],
  );
  return result.rowCount > 0;
}
