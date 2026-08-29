-- KOTAKAS source-migration / STAGING ONLY
-- Production veritabaninda otomatik calistirilmaz.
-- Uygulamadan once mevcut Railway semasi metadata endpointleriyle dogrulanmalidir.

begin;

create table if not exists user_notifications (
  id bigserial primary key,
  user_id bigint not null,
  kind text not null,
  title text not null,
  body text not null,
  target_type text not null default 'system',
  target_id text,
  dedupe_key text,
  created_by bigint,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists user_notifications_user_created_idx
  on user_notifications(user_id, created_at desc);

create index if not exists user_notifications_user_unread_idx
  on user_notifications(user_id, created_at desc)
  where read_at is null;

create unique index if not exists user_notifications_dedupe_idx
  on user_notifications(user_id, dedupe_key)
  where dedupe_key is not null;

commit;
