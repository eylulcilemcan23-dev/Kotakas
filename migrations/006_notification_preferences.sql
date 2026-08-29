-- KOTAKAS STAGING ONLY
-- Kullanici bildirim tercihleri. Production'a otomatik uygulanmaz.

create table if not exists user_notification_preferences (
  user_id bigint primary key,
  messages_enabled boolean not null default true,
  market_enabled boolean not null default true,
  disputes_enabled boolean not null default true,
  system_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create or replace function kotakas_user_notification_preference_filter()
returns trigger
language plpgsql
as $$
declare
  prefs user_notification_preferences%rowtype;
  category text;
  normalized_kind text := lower(coalesce(new.kind, ''));
begin
  -- Para/iade ve guvenlik bildirimleri kapatilamaz.
  if normalized_kind ~ '(refund|payment|balance|wallet|payout|commission|escrow|release|security|password|login|verification|verified|account_security)'
     or normalized_kind = 'dispute_resolved' then
    return new;
  end if;

  select * into prefs
  from user_notification_preferences
  where user_id = new.user_id;

  -- Tercih kaydi yoksa geriye donuk uyumluluk icin tum bildirimler aciktir.
  if not found then
    return new;
  end if;

  if normalized_kind like '%message%' or normalized_kind like '%chat%' then
    category := 'messages';
  elsif normalized_kind like '%dispute%' then
    category := 'disputes';
  elsif normalized_kind ~ '(listing|market|offer|price|sale|purchase|order)' then
    category := 'market';
  else
    category := 'system';
  end if;

  if category = 'messages' and not prefs.messages_enabled then return null; end if;
  if category = 'market' and not prefs.market_enabled then return null; end if;
  if category = 'disputes' and not prefs.disputes_enabled then return null; end if;
  if category = 'system' and not prefs.system_enabled then return null; end if;

  return new;
end;
$$;

drop trigger if exists trg_user_notification_preferences on user_notifications;
create trigger trg_user_notification_preferences
before insert on user_notifications
for each row execute function kotakas_user_notification_preference_filter();
