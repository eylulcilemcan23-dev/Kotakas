import { pool } from './db.js';

const REQUIRED = ['id','provider','provider_subject','user_id','email','created_at','updated_at'];
let cache = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

function safeProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  if (provider !== 'google') throw new Error('invalid oauth provider');
  return provider;
}

function safeSubject(value) {
  const subject = String(value || '').trim();
  if (!subject || subject.length > 255) throw new Error('invalid oauth subject');
  return subject;
}

function safeUserId(value) {
  const id = String(value || '').trim();
  if (!/^\d+$/.test(id)) throw new Error('invalid oauth user');
  return id;
}

function safeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || email.length > 254 || !email.includes('@')) throw new Error('invalid oauth email');
  return email;
}

export async function detectOauthIdentityCompatibility({ force = false } = {}) {
  if (!pool) return { ready: false, blockers: ['DATABASE_URL missing'] };
  if (!force && cache && Date.now() - cachedAt < CACHE_MS) return cache;
  const result = await pool.query(`
    select column_name
    from information_schema.columns
    where table_schema='public' and table_name='oauth_identities'
  `);
  const columns = new Set(result.rows.map((row) => row.column_name));
  const blockers = [];
  if (!columns.size) blockers.push('missing_table:oauth_identities');
  for (const column of REQUIRED) if (!columns.has(column)) blockers.push(`missing_column:oauth_identities.${column}`);
  cache = { ready: blockers.length === 0, blockers: [...new Set(blockers)] };
  cachedAt = Date.now();
  return cache;
}

async function assertReady() {
  const status = await detectOauthIdentityCompatibility();
  if (!status.ready) throw new Error(`oauth identity schema incompatible: ${status.blockers.join(', ')}`);
}

export async function findOauthIdentity({ provider, subject }, queryable = pool) {
  await assertReady();
  const result = await queryable.query(`
    select id,provider,provider_subject,user_id,email,created_at,updated_at
    from oauth_identities
    where provider=$1 and provider_subject=$2
    limit 1
  `, [safeProvider(provider), safeSubject(subject)]);
  const row = result.rows[0];
  return row ? {
    id: String(row.id),
    provider: row.provider,
    subject: row.provider_subject,
    userId: String(row.user_id),
    email: row.email,
  } : null;
}

export async function linkOauthIdentity({ provider, subject, userId, email }, queryable = pool) {
  await assertReady();
  const values = [safeProvider(provider), safeSubject(subject), safeUserId(userId), safeEmail(email)];
  const existing = await queryable.query(`
    select user_id,email
    from oauth_identities
    where provider=$1 and provider_subject=$2
    for update
  `, values.slice(0, 2));
  if (existing.rowCount) {
    if (String(existing.rows[0].user_id) !== values[2]) throw new Error('oauth identity conflict');
    await queryable.query(`
      update oauth_identities set email=$3,updated_at=now()
      where provider=$1 and provider_subject=$2
    `, [values[0], values[1], values[3]]);
    return findOauthIdentity({ provider: values[0], subject: values[1] }, queryable);
  }
  try {
    await queryable.query(`
      insert into oauth_identities (provider,provider_subject,user_id,email,created_at,updated_at)
      values ($1,$2,$3,$4,now(),now())
    `, values);
  } catch (error) {
    if (String(error?.code) === '23505') throw new Error('oauth identity conflict');
    throw error;
  }
  return findOauthIdentity({ provider: values[0], subject: values[1] }, queryable);
}
