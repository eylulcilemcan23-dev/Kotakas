-- KOTAKAS Faz 13 / STAGING ONLY
-- Bu dosya production'da otomatik calistirilmaz.
-- Takas, oyun icindeki itemi teknik olarak escrow'a alamaz; KOTAKAS yalnizca iki ilani kilitler
-- ve iki tarafli teslim onayi / ihtilaf akisini kaydeder.

begin;

alter table listings drop constraint if exists listings_status_check;
alter table listings
  add constraint listings_status_check
  check (status in ('active','reserved','sold','cancelled','swapped'));

create table if not exists swap_requests (
  id bigserial primary key,
  proposer_id bigint not null,
  recipient_id bigint not null,
  offered_listing_id bigint not null references listings(id),
  requested_listing_id bigint not null references listings(id),
  status text not null default 'pending'
    check (status in ('pending','active','completed','rejected','cancelled','disputed')),
  proposer_received_at timestamptz,
  recipient_received_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (proposer_id <> recipient_id),
  check (offered_listing_id <> requested_listing_id)
);

create unique index if not exists swap_requests_same_pending_unique
  on swap_requests(proposer_id,offered_listing_id,requested_listing_id)
  where status='pending';
create index if not exists swap_requests_proposer_idx
  on swap_requests(proposer_id,status,id desc);
create index if not exists swap_requests_recipient_idx
  on swap_requests(recipient_id,status,id desc);
create index if not exists swap_requests_offered_idx
  on swap_requests(offered_listing_id,status);
create index if not exists swap_requests_requested_idx
  on swap_requests(requested_listing_id,status);

create table if not exists swap_disputes (
  id bigserial primary key,
  swap_id bigint not null references swap_requests(id) on delete cascade,
  opened_by bigint not null,
  reason text not null check (char_length(reason) between 10 and 1500),
  status text not null default 'open' check (status in ('open','resolved')),
  resolution text check (resolution is null or resolution in ('complete','cancel')),
  resolved_by bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index if not exists swap_disputes_one_open_per_swap
  on swap_disputes(swap_id)
  where status='open';
create index if not exists swap_disputes_status_idx
  on swap_disputes(status,id desc);

commit;
