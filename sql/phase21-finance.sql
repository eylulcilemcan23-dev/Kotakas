-- KOTAKAS Faz 21 finance source schema.
-- Bu dosya production'a otomatik uygulanmaz. Önce staging/uyumluluk kontrolü gerekir.

create table if not exists wallets (
  user_id bigint primary key,
  balance_try numeric(18,2) not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists wallet_ledger (
  id bigserial primary key,
  user_id bigint not null,
  amount_try numeric(18,2) not null,
  balance_after_try numeric(18,2) not null,
  entry_type text not null,
  reference text,
  reason text,
  actor_user_id bigint,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists idx_wallet_ledger_user_created
  on wallet_ledger(user_id, created_at desc);

create table if not exists settlements (
  id bigserial primary key,
  buyer_user_id bigint not null,
  seller_user_id bigint not null,
  seller_role text not null,
  gross_try numeric(18,2) not null,
  commission_rate numeric(8,4) not null,
  commission_try numeric(18,2) not null,
  seller_net_try numeric(18,2) not null,
  reference text,
  idempotency_key text not null unique,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

create table if not exists platform_ledger (
  id bigserial primary key,
  amount_try numeric(18,2) not null,
  entry_type text not null,
  reference text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
