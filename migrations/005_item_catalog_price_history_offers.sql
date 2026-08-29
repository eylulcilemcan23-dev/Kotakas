-- KOTAKAS source-migration / STAGING ONLY
-- Production veritabaninda otomatik calistirilmaz.
-- Item katalog metadata, gercek fiyat gecmisi ve teklif istatistikleri icin hazirliktir.

begin;

create table if not exists item_catalog (
  id bigserial primary key,
  canonical_name text not null,
  slug text not null unique,
  image_url text,
  class_info text,
  base_attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists listing_item_metadata (
  listing_id bigint primary key references listings(id) on delete cascade,
  item_id bigint references item_catalog(id),
  enhancement smallint check (enhancement is null or enhancement between 0 and 21),
  reverse boolean,
  delivery_window text,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listing_item_metadata_item_idx
  on listing_item_metadata(item_id);

create table if not exists listing_price_history (
  id bigserial primary key,
  listing_id bigint not null references listings(id) on delete cascade,
  price numeric(18,2) not null check (price > 0),
  source text not null default 'listing',
  recorded_at timestamptz not null default now()
);

create index if not exists listing_price_history_listing_time_idx
  on listing_price_history(listing_id, recorded_at desc);

create table if not exists listing_offers (
  id bigserial primary key,
  listing_id bigint not null references listings(id) on delete cascade,
  offered_by bigint not null,
  amount numeric(18,2) not null check (amount > 0),
  status text not null default 'open' check (status in ('open','accepted','rejected','cancelled','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listing_offers_listing_time_idx
  on listing_offers(listing_id, created_at desc);
create index if not exists listing_offers_open_idx
  on listing_offers(listing_id, created_at desc) where status = 'open';

-- Mevcut ilanlara ilk gercek fiyat noktasi. Sahte veri uretilmez.
insert into listing_price_history (listing_id, price, source, recorded_at)
select l.id, l.price, 'migration_seed', coalesce(l.updated_at, l.created_at, now())
from listings l
where not exists (
  select 1 from listing_price_history h where h.listing_id = l.id
);

create or replace function kotakas_record_listing_price_history()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.price is distinct from old.price then
    insert into listing_price_history (listing_id, price, source, recorded_at)
    values (new.id, new.price, case when tg_op = 'INSERT' then 'listing_created' else 'listing_price_changed' end, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_kotakas_listing_price_history on listings;
create trigger trg_kotakas_listing_price_history
after insert or update of price on listings
for each row execute function kotakas_record_listing_price_history();

commit;
