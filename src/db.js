import pg from 'pg';

const { Pool } = pg;

export function createDb(databaseUrl) {
  if (!databaseUrl) return null;

  return new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });
}

export async function checkDb(pool) {
  if (!pool) return { ok: false, reason: 'database_not_configured' };

  try {
    const result = await pool.query('select 1 as ok');
    return { ok: result.rows?.[0]?.ok === 1 };
  } catch (error) {
    return { ok: false, reason: error.code || 'database_error' };
  }
}
