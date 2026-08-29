-- KOTAKAS source-migration / STAGING ONLY
-- Production veritabaninda otomatik calistirilmaz.
-- Uygulamadan once mevcut Railway semasi metadata endpointleriyle dogrulanmalidir.

begin;

create table if not exists disputes (
  id bigserial primary key,
  order_id bigint not null references orders(id),
  opened_by bigint not null,
  reason text not null check (char_length(reason) between 10 and 1500),
  status text not null default 'open' check (status in ('open','resolved')),
  resolution text check (resolution is null or resolution in ('refund','release','dismiss')),
  resolved_by bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index if not exists disputes_one_open_per_order
  on disputes(order_id)
  where status = 'open';

create index if not exists disputes_status_created_idx
  on disputes(status, created_at desc);

create table if not exists audit_logs (
  id bigserial primary key,
  actor_id bigint,
  actor_role text,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on audit_logs(created_at desc);
create index if not exists audit_logs_action_idx on audit_logs(action, created_at desc);
create index if not exists audit_logs_target_idx on audit_logs(target_type, target_id, created_at desc);

commit;
