import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { detectUserSchema, findUserByEmail, publicUser } from './user-adapter.js';

function validIdent(value) {
  return typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function qi(value) {
  if (!validIdent(value)) throw new Error('unsafe identifier');
  return `"${value}"`;
}

export async function detectAccountWriteCompatibility({ force = false } = {}) {
  const schema = await detectUserSchema({ force });
  if (!pool || !schema) return { ready: false, reason: 'user_schema_not_detected', schema: null, blockers: ['user_schema_not_detected'] };

  const result = await pool.query(`
    select column_name, is_nullable, column_default, is_identity
    from information_schema.columns
    where table_schema = 'public' and table_name = $1
    order by ordinal_position
  `, [schema.table]);

  const supported = new Set([schema.id, schema.email, schema.password, schema.role, schema.name].filter(Boolean));
  const blockers = [];
  for (const column of result.rows) {
    const requiredWithoutDefault = column.is_nullable === 'NO' && !column.column_default && column.is_identity !== 'YES';
    if (requiredWithoutDefault && !supported.has(column.column_name)) blockers.push(`required:${column.column_name}`);
  }

  const idColumn = result.rows.find((column) => column.column_name === schema.id);
  if (idColumn && idColumn.is_nullable === 'NO' && !idColumn.column_default && idColumn.is_identity !== 'YES') {
    blockers.push('id_generation_not_confirmed');
  }

  return {
    ready: blockers.length === 0,
    reason: blockers.length ? 'schema_requires_manual_mapping' : null,
    schema,
    blockers: [...new Set(blockers)],
  };
}

export async function createLocalUser({ email, password, name = null }) {
  const compatibility = await detectAccountWriteCompatibility();
  if (!compatibility.ready) throw new Error('registration_schema_not_ready');
  if (await findUserByEmail(email)) throw new Error('email_already_registered');

  const schema = compatibility.schema;
  const passwordHash = await bcrypt.hash(password, 12);
  const columns = [schema.email, schema.password];
  const values = [email, passwordHash];
  if (schema.name) {
    columns.push(schema.name);
    values.push(name || null);
  }
  if (schema.role) {
    columns.push(schema.role);
    values.push('user');
  }

  const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
  const selects = [
    `${qi(schema.id)} as id`,
    `${qi(schema.email)} as email`,
    schema.role ? `${qi(schema.role)} as role` : `'user'::text as role`,
    schema.name ? `${qi(schema.name)} as name` : `null::text as name`,
  ];
  const sql = `insert into ${qi(schema.table)} (${columns.map(qi).join(', ')}) values (${placeholders}) returning ${selects.join(', ')}`;
  const result = await pool.query(sql, values);
  return publicUser(result.rows[0]);
}

export async function updateUserPasswordByEmail(email, password) {
  const compatibility = await detectAccountWriteCompatibility();
  if (!compatibility.ready) throw new Error('password_schema_not_ready');
  const schema = compatibility.schema;
  const passwordHash = await bcrypt.hash(password, 12);
  const sql = `update ${qi(schema.table)} set ${qi(schema.password)} = $2 where lower(${qi(schema.email)}) = lower($1) returning ${qi(schema.id)} as id`;
  const result = await pool.query(sql, [email, passwordHash]);
  return result.rowCount > 0;
}
