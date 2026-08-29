-- KOTAKAS Faz 12.5 / STAGING ONLY
-- Bu dosya production'da otomatik calistirilmaz.

create table if not exists listing_questions (
  id bigserial primary key,
  listing_id bigint not null references listings(id) on delete cascade,
  buyer_id bigint not null,
  seller_id bigint not null,
  question_code text not null,
  answer_code text,
  status text not null default 'pending' check (status in ('pending','answered')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists listing_questions_one_pending_code
  on listing_questions(listing_id,buyer_id,question_code)
  where status='pending';
create index if not exists listing_questions_seller_inbox
  on listing_questions(seller_id,status,id desc);
create index if not exists listing_questions_buyer_history
  on listing_questions(buyer_id,id desc);

create table if not exists admin_wallet_adjustments (
  id bigserial primary key,
  actor_id bigint not null,
  actor_role text not null,
  user_id bigint not null,
  amount numeric(18,2) not null check (amount <> 0),
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists admin_wallet_adjustments_user_idx
  on admin_wallet_adjustments(user_id,id desc);
create index if not exists admin_wallet_adjustments_actor_idx
  on admin_wallet_adjustments(actor_id,id desc);
