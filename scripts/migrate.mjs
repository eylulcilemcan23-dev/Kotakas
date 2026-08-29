import pg from 'pg';

const { Pool } = pg;
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL missing');

const pool = new Pool({
  connectionString: url,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

function qi(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error('bad identifier');
  return `"${value}"`;
}

async function tableExists(name) {
  const result = await pool.query(
    `select 1 from information_schema.tables where table_schema='public' and table_name=$1`,
    [name]
  );
  return Boolean(result.rows[0]);
}

async function cols(table) {
  const result = await pool.query(
    `select column_name from information_schema.columns where table_schema='public' and table_name=$1`,
    [table]
  );
  return new Set(result.rows.map((row) => row.column_name));
}

async function addColumns(table, definitions) {
  for (const definition of definitions) {
    await pool.query(`alter table ${qi(table)} add column if not exists ${definition}`);
  }
}

async function ensureUserTable() {
  let table = null;
  for (const name of ['users', 'app_users', 'members']) {
    if (await tableExists(name)) {
      table = name;
      break;
    }
  }

  if (!table) {
    await pool.query(`create table users(
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

  await addColumns(table, [
    `role text`,
    `is_active boolean default true`,
    `last_login_at timestamptz`
  ]);

  const columns = await cols(table);
  if (columns.has('is_admin')) {
    await pool.query(`update ${qi(table)} set role='admin_full' where is_admin=true and (role is null or role='user')`);
  }
  if (columns.has('is_trader')) {
    await pool.query(`update ${qi(table)} set role='trader' where is_trader=true and (role is null or role='user')`);
  }
  if (columns.has('trader_verified')) {
    await pool.query(`update ${qi(table)} set role='trader' where trader_verified=true and (role is null or role='user')`);
  }
  await pool.query(`update ${qi(table)} set role='user' where role is null`);

  const emailColumn = columns.has('email') ? 'email' : columns.has('mail') ? 'mail' : null;
  if (emailColumn && process.env.ADMIN_RESET_EMAIL) {
    await pool.query(
      `update ${qi(table)} set role='admin_owner' where lower(${qi(emailColumn)})=lower($1)`,
      [process.env.ADMIN_RESET_EMAIL]
    );
  }
  return table;
}

async function ensureWallets() {
  const existed = await tableExists('wallets');
  const before = existed ? await cols('wallets') : new Set();

  await pool.query(`create table if not exists wallets(
    user_id bigint primary key,
    balance_try numeric(18,2) not null default 0,
    updated_at timestamptz not null default now()
  )`);
  await addColumns('wallets', [
    `user_id bigint`,
    `balance_try numeric(18,2) default 0`,
    `updated_at timestamptz default now()`
  ]);

  if (existed && !before.has('balance_try')) {
    if (before.has('balance_tl')) {
      await pool.query(`update wallets set balance_try=coalesce(balance_tl,0) where balance_try is null or balance_try=0`);
    } else if (before.has('balance')) {
      await pool.query(`update wallets set balance_try=coalesce(balance,0) where balance_try is null or balance_try=0`);
    }
  }
  await pool.query(`update wallets set balance_try=0 where balance_try is null`);
  await pool.query(`create unique index if not exists wallets_user_uq on wallets(user_id)`);
}

async function ensureFinanceTables() {
  await pool.query(`create table if not exists wallet_ledger(
    id bigserial primary key,
    user_id bigint not null,
    amount_try numeric(18,2) not null,
    balance_after_try numeric(18,2) not null,
    entry_type text not null,
    reference text,
    reason text,
    actor_user_id bigint,
    idempotency_key text,
    created_at timestamptz not null default now()
  )`);
  await addColumns('wallet_ledger', [
    `id bigserial`, `user_id bigint`, `amount_try numeric(18,2)`,
    `balance_after_try numeric(18,2)`, `entry_type text`, `reference text`,
    `reason text`, `actor_user_id bigint`, `idempotency_key text`,
    `created_at timestamptz default now()`
  ]);
  await pool.query(`create unique index if not exists wallet_ledger_idempotency_uq on wallet_ledger(idempotency_key) where idempotency_key is not null`);
  await pool.query(`create index if not exists wallet_ledger_user_idx on wallet_ledger(user_id,id desc)`);

  await pool.query(`create table if not exists platform_ledger(
    id bigserial primary key,
    amount_try numeric(18,2) not null,
    entry_type text not null,
    reference text,
    idempotency_key text,
    created_at timestamptz not null default now()
  )`);
  await addColumns('platform_ledger', [
    `id bigserial`, `amount_try numeric(18,2)`, `entry_type text`,
    `reference text`, `idempotency_key text`, `created_at timestamptz default now()`
  ]);
  await pool.query(`create unique index if not exists platform_ledger_idempotency_uq on platform_ledger(idempotency_key) where idempotency_key is not null`);

  await pool.query(`create table if not exists settlements(
    id bigserial primary key,
    buyer_user_id bigint not null,
    seller_user_id bigint not null,
    seller_role text not null,
    gross_try numeric(18,2) not null,
    commission_rate numeric(8,4) not null,
    commission_try numeric(18,2) not null,
    seller_net_try numeric(18,2) not null,
    reference text,
    idempotency_key text,
    status text not null default 'completed',
    created_at timestamptz not null default now()
  )`);
  await addColumns('settlements', [
    `id bigserial`, `buyer_user_id bigint`, `seller_user_id bigint`, `seller_role text`,
    `gross_try numeric(18,2)`, `commission_rate numeric(8,4)`, `commission_try numeric(18,2)`,
    `seller_net_try numeric(18,2)`, `reference text`, `idempotency_key text`,
    `status text default 'completed'`, `created_at timestamptz default now()`
  ]);
  await pool.query(`create unique index if not exists settlements_idempotency_uq on settlements(idempotency_key) where idempotency_key is not null`);
}

async function ensureMarketplaceTables() {
  await pool.query(`create table if not exists listings(
    id bigserial primary key,
    seller_user_id bigint,
    seller_role text default 'user',
    publication_type text default 'free',
    server_code text,
    item_name text,
    category text,
    description text,
    price_gb numeric(18,4),
    status text default 'active',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  )`);
  await addColumns('listings', [
    `id bigserial`, `seller_user_id bigint`, `seller_role text default 'user'`,
    `publication_type text default 'free'`, `server_code text`, `item_name text`,
    `category text`, `description text`, `price_gb numeric(18,4)`,
    `status text default 'active'`, `created_at timestamptz default now()`,
    `updated_at timestamptz default now()`
  ]);
  await pool.query(`create index if not exists listings_status_created_idx on listings(status,created_at desc)`);

  await pool.query(`create table if not exists notifications(
    id bigserial primary key,
    user_id bigint not null,
    type text not null,
    title text not null,
    body text,
    data_json jsonb not null default '{}'::jsonb,
    read_at timestamptz,
    created_at timestamptz not null default now()
  )`);
  await addColumns('notifications', [
    `id bigserial`, `user_id bigint`, `type text`, `title text`, `body text`,
    `data_json jsonb default '{}'::jsonb`, `read_at timestamptz`,
    `created_at timestamptz default now()`
  ]);
  await pool.query(`update notifications set data_json='{}'::jsonb where data_json is null`);
  await pool.query(`create index if not exists notifications_user_idx on notifications(user_id,id desc)`);

  await pool.query(`create table if not exists seller_requests(
    id bigserial primary key,
    listing_id bigint not null,
    buyer_user_id bigint not null,
    seller_user_id bigint not null,
    question_text text not null,
    answer_text text,
    status text not null default 'pending',
    created_at timestamptz not null default now(),
    answered_at timestamptz
  )`);
  await addColumns('seller_requests', [
    `id bigserial`, `listing_id bigint`, `buyer_user_id bigint`, `seller_user_id bigint`,
    `question_text text`, `answer_text text`, `status text default 'pending'`,
    `created_at timestamptz default now()`, `answered_at timestamptz`
  ]);

  await pool.query(`create table if not exists market_rates(
    server_code text primary key,
    gb_try_rate numeric(18,4) not null,
    buy_10m_try numeric(18,4),
    sell_10m_try numeric(18,4),
    source text not null default 'admin_manual',
    updated_at timestamptz not null default now()
  )`);
  await addColumns('market_rates', [
    `server_code text`, `gb_try_rate numeric(18,4)`, `buy_10m_try numeric(18,4)`,
    `sell_10m_try numeric(18,4)`, `source text default 'admin_manual'`,
    `updated_at timestamptz default now()`
  ]);
  await pool.query(`create unique index if not exists market_rates_server_uq on market_rates(server_code)`);

  await pool.query(`create table if not exists deals(
    id bigserial primary key,
    listing_id bigint not null,
    buyer_user_id bigint not null,
    seller_user_id bigint not null,
    seller_role text not null,
    server_code text not null,
    price_gb numeric(18,4) not null,
    gb_try_rate numeric(18,4) not null,
    gross_try numeric(18,2) not null,
    status text not null default 'pending',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`);
  await addColumns('deals', [
    `id bigserial`, `listing_id bigint`, `buyer_user_id bigint`, `seller_user_id bigint`,
    `seller_role text`, `server_code text`, `price_gb numeric(18,4)`,
    `gb_try_rate numeric(18,4)`, `gross_try numeric(18,2)`, `status text default 'pending'`,
    `created_at timestamptz default now()`, `updated_at timestamptz default now()`
  ]);
  await pool.query(`create index if not exists deals_parties_idx on deals(buyer_user_id,seller_user_id,id desc)`);

  await pool.query(`create table if not exists escrow_holds(
    id bigserial primary key,
    deal_id bigint not null unique,
    buyer_user_id bigint not null,
    gross_try numeric(18,2) not null,
    status text not null default 'held',
    idempotency_key text,
    created_at timestamptz not null default now(),
    released_at timestamptz,
    refunded_at timestamptz
  )`);
  await addColumns('escrow_holds', [
    `id bigserial`, `deal_id bigint`, `buyer_user_id bigint`, `gross_try numeric(18,2)`,
    `status text default 'held'`, `idempotency_key text`, `created_at timestamptz default now()`,
    `released_at timestamptz`, `refunded_at timestamptz`
  ]);
  await pool.query(`create unique index if not exists escrow_deal_uq on escrow_holds(deal_id)`);
  await pool.query(`create unique index if not exists escrow_idempotency_uq on escrow_holds(idempotency_key) where idempotency_key is not null`);
}

async function ensureAdminTables() {
  await pool.query(`create table if not exists trader_applications(
    id bigserial primary key,user_id bigint not null,note text,status text not null default 'pending',
    created_at timestamptz not null default now(),decided_at timestamptz,decided_by bigint
  )`);
  await addColumns('trader_applications', [
    `id bigserial`, `user_id bigint`, `note text`, `status text default 'pending'`,
    `created_at timestamptz default now()`, `decided_at timestamptz`, `decided_by bigint`
  ]);

  await pool.query(`create table if not exists tickets(
    id bigserial primary key,user_id bigint,subject text not null,body text not null,
    status text not null default 'open',created_at timestamptz not null default now(),updated_at timestamptz not null default now()
  )`);
  await addColumns('tickets', [
    `id bigserial`, `user_id bigint`, `subject text`, `body text`, `status text default 'open'`,
    `created_at timestamptz default now()`, `updated_at timestamptz default now()`
  ]);

  await pool.query(`create table if not exists platform_settings(
    key text primary key,value_json jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),updated_by bigint
  )`);
  await addColumns('platform_settings', [
    `key text`, `value_json jsonb default '{}'::jsonb`, `updated_at timestamptz default now()`, `updated_by bigint`
  ]);
  await pool.query(`create unique index if not exists platform_settings_key_uq on platform_settings(key)`);

  await pool.query(`create table if not exists security_events(
    id bigserial primary key,user_id bigint,event_type text not null,
    detail_json jsonb not null default '{}'::jsonb,ip text,created_at timestamptz not null default now()
  )`);
  await addColumns('security_events', [
    `id bigserial`, `user_id bigint`, `event_type text`, `detail_json jsonb default '{}'::jsonb`,
    `ip text`, `created_at timestamptz default now()`
  ]);
}

async function run() {
  const userTable = await ensureUserTable();
  await ensureWallets();
  await ensureFinanceTables();
  await ensureMarketplaceTables();
  await ensureAdminTables();
  console.log(JSON.stringify({ ok: true, userTable, migration: 'phase21.8.1-additive' }));
}

try {
  await run();
} finally {
  await pool.end();
}
