import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;
const defaultIdleTimeout = config.nodeEnv === 'test' ? 500 : 30000;

export const pool = config.databaseUrl
  ? new Pool({
      connectionString: config.databaseUrl,
      max: 10,
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || defaultIdleTimeout),
      connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS || 5000),
    })
  : null;

export async function pingDatabase() {
  if (!pool) return { ok: false, skipped: true, reason: 'DATABASE_URL missing' };

  const client = await pool.connect();
  try {
    const result = await client.query('select now() as now');
    return { ok: true, now: result.rows[0]?.now || null };
  } finally {
    client.release();
  }
}
