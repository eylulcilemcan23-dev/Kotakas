-- KOTAKAS source-migration / STAGING ONLY
-- Production veritabaninda otomatik calistirilmaz.
-- Faz 17.1: provider-bagimsiz bakiye yukleme ve para cekme finans altyapisi.
-- Ham IBAN/kart/Papara bilgisi tutulmaz; yalnız ödeme sağlayıcısının tokeni ve maskeli etiket saklanır.

begin;

create table if not exists wallet_payment_intents (
  id bigserial primary key,
  user_id bigint not null,
  amount numeric(18,2) not null check (amount > 0),
  currency text not null default 'TRY' check (currency = 'TRY'),
  provider text not null,
  merchant_reference text not null unique,
  provider_payment_id text,
  idempotency_key text not null unique,
  status text not null default 'created' check (status in ('created','pending','paid','failed','cancelled','refunded')),
  checkout_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create unique index if not exists wallet_payment_intents_provider_payment_uidx
  on wallet_payment_intents(provider, provider_payment_id)
  where provider_payment_id is not null;
create index if not exists wallet_payment_intents_user_idx
  on wallet_payment_intents(user_id, id desc);

create table if not exists payment_webhook_events (
  id bigserial primary key,
  provider text not null,
  event_id text not null,
  payload_hash text not null,
  payment_intent_id bigint references wallet_payment_intents(id) on delete set null,
  status text not null default 'received' check (status in ('received','processed','ignored','failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(provider, event_id)
);

create table if not exists payout_accounts (
  id bigserial primary key,
  user_id bigint not null,
  provider text not null,
  provider_token text not null,
  display_label text not null,
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_token)
);
create index if not exists payout_accounts_user_idx on payout_accounts(user_id, status, id desc);

create table if not exists withdrawal_requests (
  id bigserial primary key,
  user_id bigint not null,
  payout_account_id bigint not null references payout_accounts(id),
  amount numeric(18,2) not null check (amount > 0),
  fee_amount numeric(18,2) not null default 0 check (fee_amount >= 0),
  net_amount numeric(18,2) not null check (net_amount > 0),
  currency text not null default 'TRY' check (currency = 'TRY'),
  status text not null default 'requested' check (status in ('requested','processing','paid','cancelled','failed')),
  idempotency_key text not null unique,
  provider_payout_id text,
  resolution_note text,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists withdrawal_requests_user_idx on withdrawal_requests(user_id, id desc);
create index if not exists withdrawal_requests_status_idx on withdrawal_requests(status, requested_at asc);
create unique index if not exists withdrawal_requests_provider_payout_uidx
  on withdrawal_requests(provider_payout_id)
  where provider_payout_id is not null;

create table if not exists wallet_funding_ledger (
  id bigserial primary key,
  user_id bigint not null,
  kind text not null check (kind in ('deposit_credit','withdrawal_hold','withdrawal_paid','withdrawal_refund')),
  payment_intent_id bigint references wallet_payment_intents(id) on delete set null,
  withdrawal_request_id bigint references withdrawal_requests(id) on delete set null,
  available_delta numeric(18,2) not null default 0,
  held_delta numeric(18,2) not null default 0,
  created_at timestamptz not null default now(),
  check (
    (payment_intent_id is not null and withdrawal_request_id is null)
    or (payment_intent_id is null and withdrawal_request_id is not null)
  )
);
create index if not exists wallet_funding_ledger_user_idx on wallet_funding_ledger(user_id, id desc);
create unique index if not exists wallet_funding_ledger_payment_kind_uidx
  on wallet_funding_ledger(kind, payment_intent_id)
  where payment_intent_id is not null;
create unique index if not exists wallet_funding_ledger_withdrawal_kind_uidx
  on wallet_funding_ledger(kind, withdrawal_request_id)
  where withdrawal_request_id is not null;

commit;
