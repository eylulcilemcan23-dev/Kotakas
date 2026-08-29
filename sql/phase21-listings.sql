-- KOTAKAS Faz 21 listing source schema.
-- Production'a otomatik uygulanmaz; staging uyumluluk kontrolünden sonra uygulanır.

create table if not exists listings (
  id bigserial primary key,
  seller_user_id bigint not null,
  seller_role text not null,
  server_code text not null,
  item_name text not null,
  category text,
  description text,
  price_gb numeric(18,4) not null,
  status text not null default 'active',
  publication_type text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_listings_active_created
  on listings(status, created_at desc);

create index if not exists idx_listings_seller_created
  on listings(seller_user_id, created_at desc);
