-- KOTAKAS source-migration / STAGING ONLY
-- Production veritabaninda otomatik calistirilmaz.
-- Uygulamadan once mevcut Railway semasi metadata endpointleriyle dogrulanmalidir.

begin;

create table if not exists dispute_messages (
  id bigserial primary key,
  dispute_id bigint not null references disputes(id) on delete cascade,
  sender_id bigint not null,
  sender_role text not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists dispute_messages_dispute_created_idx
  on dispute_messages(dispute_id, created_at asc);

create table if not exists admin_notifications (
  id bigserial primary key,
  kind text not null,
  title text not null,
  body text not null,
  target_type text not null default 'dispute',
  target_id text,
  created_by bigint,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists admin_notifications_unread_idx
  on admin_notifications(created_at desc)
  where read_at is null;

create index if not exists admin_notifications_target_idx
  on admin_notifications(target_type, target_id, created_at desc);

create or replace function kotakas_dispute_admin_notification()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into admin_notifications (kind, title, body, target_type, target_id, created_by, created_at)
    values (
      'dispute_opened',
      'Yeni ihtilaf #' || new.id,
      'İşlem #' || new.order_id || ' için yeni bir ihtilaf açıldı.',
      'dispute',
      new.id::text,
      new.opened_by,
      now()
    );
  elsif tg_op = 'UPDATE' and old.status = 'open' and new.status = 'resolved' then
    insert into admin_notifications (kind, title, body, target_type, target_id, created_by, created_at)
    values (
      'dispute_resolved',
      'İhtilaf #' || new.id || ' sonuçlandı',
      'Karar: ' || coalesce(new.resolution, 'belirtilmedi'),
      'dispute',
      new.id::text,
      new.resolved_by,
      now()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists disputes_admin_notification_trigger on disputes;
create trigger disputes_admin_notification_trigger
after insert or update of status on disputes
for each row execute function kotakas_dispute_admin_notification();

commit;
