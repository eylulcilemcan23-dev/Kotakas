import pg from 'pg';

const { Pool } = pg;
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL missing');
const pool = new Pool({ connectionString: url, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });

function qi(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error('bad identifier');
  return `"${value}"`;
}

async function tableExists(name) {
  const r = await pool.query(`select 1 from information_schema.tables where table_schema='public' and table_name=$1`, [name]);
  return Boolean(r.rows[0]);
}

async function ensureUserTable() {
  const candidates = ['users', 'app_users', 'members'];
  let table = null;
  for (const name of candidates) if (await tableExists(name)) { table = name; break; }
  if (!table) {
    await pool.query(`create table users (
      id bigserial primary key,
      email text not null unique,
      password_hash text not null,
      display_name text,
      role text not null default 'user',
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      last_login_at timestamptz
    )`);
    return 'users';
  }
  await pool.query(`alter table ${qi(table)} add column if not exists role text default 'user'`);
  await pool.query(`alter table ${qi(table)} add column if not exists is_active boolean default true`);
  await pool.query(`alter table ${qi(table)} add column if not exists last_login_at timestamptz`);
  return table;
}

async function run() {
  const userTable = await ensureUserTable();
  const statements = [
    `create table if not exists wallets (user_id bigint primary key, balance_try numeric(18,2) not null default 0, updated_at timestamptz not null default now())`,
    `create table if not exists wallet_ledger (id bigserial primary key, user_id bigint not null, amount_try numeric(18,2) not null, balance_after_try numeric(18,2) not null, entry_type text not null, reference text, reason text, actor_user_id bigint, idempotency_key text, created_at timestamptz not null default now())`,
    `create unique index if not exists wallet_ledger_idempotency_uq on wallet_ledger(idempotency_key) where idempotency_key is not null`,
    `create index if not exists wallet_ledger_user_idx on wallet_ledger(user_id,id desc)`,
    `create table if not exists platform_ledger (id bigserial primary key, amount_try numeric(18,2) not null, entry_type text not null, reference text, idempotency_key text, created_at timestamptz not null default now())`,
    `create unique index if not exists platform_ledger_idempotency_uq on platform_ledger(idempotency_key) where idempotency_key is not null`,
    `create table if not exists settlements (id bigserial primary key, buyer_user_id bigint not null, seller_user_id bigint not null, seller_role text not null, gross_try numeric(18,2) not null, commission_rate numeric(8,4) not null, commission_try numeric(18,2) not null, seller_net_try numeric(18,2) not null, reference text, idempotency_key text, status text not null default 'completed', created_at timestamptz not null default now())`,
    `create unique index if not exists settlements_idempotency_uq on settlements(idempotency_key) where idempotency_key is not null`,
    `create table if not exists listings (id bigserial primary key, seller_user_id bigint not null, seller_role text not null default 'user', publication_type text not null default 'user_free', server_code text not null, item_name text not null, category text, description text, price_gb numeric(18,4) not null, status text not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now())`,
    `alter table listings add column if not exists seller_role text default 'user'`,
    `alter table listings add column if not exists publication_type text default 'user_free'`,
    `alter table listings add column if not exists server_code text`,
    `alter table listings add column if not exists item_name text`,
    `alter table listings add column if not exists category text`,
    `alter table listings add column if not exists description text`,
    `alter table listings add column if not exists price_gb numeric(18,4)`,
    `alter table listings add column if not exists status text default 'active'`,
    `alter table listings add column if not exists updated_at timestamptz default now()`,
    `create index if not exists listings_status_created_idx on listings(status,created_at desc)`,
    `create table if not exists notifications (id bigserial primary key, user_id bigint not null, type text not null, title text not null, body text, data_json jsonb not null default '{}'::jsonb, read_at timestamptz, created_at timestamptz not null default now())`,
    `create index if not exists notifications_user_idx on notifications(user_id,id desc)`,
    `create table if not exists seller_requests (id bigserial primary key, listing_id bigint not null, buyer_user_id bigint not null, seller_user_id bigint not null, question_text text not null, answer_text text, status text not null default 'pending', created_at timestamptz not null default now(), answered_at timestamptz)`,
    `create table if not exists market_rates (server_code text primary key, gb_try_rate numeric(18,4) not null, buy_10m_try numeric(18,4), sell_10m_try numeric(18,4), source text not null default 'admin_manual', updated_at timestamptz not null default now())`,
    `create table if not exists deals (id bigserial primary key, listing_id bigint not null, buyer_user_id bigint not null, seller_user_id bigint not null, seller_role text not null, server_code text not null, price_gb numeric(18,4) not null, gb_try_rate numeric(18,4) not null, gross_try numeric(18,2) not null, status text not null default 'pending', created_at timestamptz not null default now(), updated_at timestamptz not null default now())`,
    `create index if not exists deals_parties_idx on deals(buyer_user_id,seller_user_id,id desc)`,
    `create table if not exists escrow_holds (id bigserial primary key, deal_id bigint not null unique, buyer_user_id bigint not null, gross_try numeric(18,2) not null, status text not null default 'held', idempotency_key text, created_at timestamptz not null default now(), released_at timestamptz, refunded_at timestamptz)`,
    `create unique index if not exists escrow_idempotency_uq on escrow_holds(idempotency_key) where idempotency_key is not null`,
    `create table if not exists trader_applications (id bigserial primary key, user_id bigint not null, note text, status text not null default 'pending', created_at timestamptz not null default now(), decided_at timestamptz, decided_by bigint)`,
    `create table if not exists tickets (id bigserial primary key, user_id bigint, subject text not null, body text not null, status text not null default 'open', created_at timestamptz not null default now(), updated_at timestamptz not null default now())`,
    `create table if not exists platform_settings (key text primary key, value_json jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), updated_by bigint)`,
    `create table if not exists security_events (id bigserial primary key, user_id bigint, event_type text not null, detail_json jsonb not null default '{}'::jsonb, ip text, created_at timestamptz not null default now())`
  ];
  for (const sql of statements) await pool.query(sql);
  await pool.query(`insert into market_rates(server_code,gb_try_rate,source) values ('ZERO',1,'initial'),('AGARTHA',1,'initial'),('PANDORA',1,'initial'),('FELIS',1,'initial') on conflict(server_code) do nothing`);
  console.log(JSON.stringify({ ok: true, userTable, migration: 'phase21' }));
}

try { await run(); } finally { await pool.end(); }
