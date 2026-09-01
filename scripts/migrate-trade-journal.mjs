import pg from 'pg';

const { Pool } = pg;
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL missing');

const pool = new Pool({
  connectionString: url,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

try {
  await pool.query(`create table if not exists trade_journal(
    id bigserial primary key,
    user_id bigint not null,
    side text not null,
    asset_type text not null default 'item',
    server_code text not null,
    asset_name text not null,
    quantity numeric(18,4) not null default 1,
    unit_price_gb numeric(18,4) not null,
    total_gb numeric(18,4) not null,
    note text,
    completed_at timestamptz not null default now(),
    created_at timestamptz not null default now()
  )`);
  await pool.query(`create index if not exists trade_journal_user_date_idx on trade_journal(user_id, completed_at desc, id desc)`);
  await pool.query(`create index if not exists trade_journal_server_asset_idx on trade_journal(server_code, asset_name, completed_at desc)`);
  console.log(JSON.stringify({ ok: true, migration: 'trade-journal-v1' }));
} finally {
  await pool.end();
}
