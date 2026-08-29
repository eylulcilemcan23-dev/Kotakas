-- KOTAKAS Faz 19 / STAGING ONLY
-- Production veritabaninda otomatik calistirilmaz.
-- Hesap kurtarma tokenlari tek kullanimlik hash olarak saklanir; ham token DB'ye yazilmaz.

begin;

create table if not exists password_reset_tokens (
  id bigserial primary key,
  token_hash text not null unique,
  email text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists password_reset_tokens_email_created_idx
  on password_reset_tokens(lower(email), created_at desc);
create index if not exists password_reset_tokens_active_idx
  on password_reset_tokens(expires_at)
  where used_at is null;

create table if not exists oauth_identities (
  id bigserial primary key,
  provider text not null check (provider in ('google')),
  provider_subject text not null,
  user_id bigint not null,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_subject),
  unique(provider, user_id)
);
create index if not exists oauth_identities_user_idx on oauth_identities(user_id);
create index if not exists oauth_identities_email_idx on oauth_identities(lower(email));

create table if not exists support_tickets (
  id bigserial primary key,
  user_id bigint not null,
  email text not null,
  subject text not null check (char_length(subject) between 5 and 120),
  status text not null default 'open' check (status in ('open','answered','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists support_tickets_user_idx on support_tickets(user_id, id desc);
create index if not exists support_tickets_status_idx on support_tickets(status, id desc);

create table if not exists support_messages (
  id bigserial primary key,
  ticket_id bigint not null references support_tickets(id) on delete cascade,
  sender_id bigint not null,
  sender_role text not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists support_messages_ticket_idx on support_messages(ticket_id, id asc);

commit;
