import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { normalizeRole } from './roles.js';

const USER_TABLE_HINTS = ['users', 'user_accounts', 'accounts', 'members'];
const EMAIL_COLUMNS = ['email', 'mail', 'email_address'];
const PASSWORD_COLUMNS = ['password_hash', 'password', 'pass_hash', 'password_digest'];
const ROLE_COLUMNS = ['role', 'user_role', 'account_role', 'type'];
const NAME_COLUMNS = ['name', 'display_name', 'username', 'full_name'];
const ID_COLUMNS = ['id', 'user_id'];

let cachedSchema = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

function validIdent(value) {
  return typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function qi(value) {
  if (!validIdent(value)) throw new Error('unsafe identifier');
  return `"${value}"`;
}

function firstMatch(columns, names) {
  return names.find((name) => columns.has(name)) || null;
}

export async function detectUserSchema({ force = false } = {}) {
  if (!pool) return null;
  if (!force && cachedSchema && Date.now() - cachedAt < CACHE_MS) return cachedSchema;

  const result = await pool.query(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
    order by table_name, ordinal_position
  `);

  const tables = new Map();
  for (const row of result.rows) {
    if (!tables.has(row.table_name)) tables.set(row.table_name, new Set());
    tables.get(row.table_name).add(row.column_name);
  }

  const ordered = [
    ...USER_TABLE_HINTS.filter((name) => tables.has(name)),
    ...[...tables.keys()].filter((name) => !USER_TABLE_HINTS.includes(name)),
  ];

  for (const table of ordered) {
    const columns = tables.get(table);
    const email = firstMatch(columns, EMAIL_COLUMNS);
    const password = firstMatch(columns, PASSWORD_COLUMNS);
    const id = firstMatch(columns, ID_COLUMNS);
    if (!email || !password || !id) continue;

    cachedSchema = {
      table,
      id,
      email,
      password,
      role: firstMatch(columns, ROLE_COLUMNS),
      name: firstMatch(columns, NAME_COLUMNS),
    };
    cachedAt = Date.now();
    return cachedSchema;
  }

  cachedSchema = null;
  cachedAt = Date.now();
  return null;
}

function userSelects(schema) {
  return [
    `${qi(schema.id)} as id`,
    `${qi(schema.email)} as email`,
    `${qi(schema.password)} as password_hash`,
    schema.role ? `${qi(schema.role)} as role` : `'user'::text as role`,
    schema.name ? `${qi(schema.name)} as name` : `null::text as name`,
  ];
}

function normalizeUserRow(row) {
  return row ? { ...row, role: normalizeRole(row.role) } : null;
}

export async function findUserByEmail(email, queryable = pool) {
  const schema = await detectUserSchema();
  if (!schema || !queryable) return null;
  const sql = `select ${userSelects(schema).join(', ')} from ${qi(schema.table)} where lower(${qi(schema.email)}) = lower($1) limit 1`;
  const result = await queryable.query(sql, [email]);
  return normalizeUserRow(result.rows[0]);
}

export async function findUserById(id, queryable = pool) {
  const schema = await detectUserSchema();
  if (!schema || !queryable) return null;
  const text = id == null ? '' : String(id);
  if (!/^\d+$/.test(text)) return null;
  const sql = `select ${userSelects(schema).join(', ')} from ${qi(schema.table)} where ${qi(schema.id)} = $1 limit 1`;
  const result = await queryable.query(sql, [text]);
  return normalizeUserRow(result.rows[0]);
}

export async function findUserRoleById(id, queryable = pool) {
  const user = await findUserById(id, queryable);
  return normalizeRole(user?.role);
}

export async function verifyUserPassword(user, password) {
  const hash = user?.password_hash;
  if (!hash || typeof password !== 'string') return false;
  if (/^\$2[aby]\$/.test(hash)) return bcrypt.compare(password, hash);
  return false;
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name || null,
    role: normalizeRole(user.role),
  };
}
