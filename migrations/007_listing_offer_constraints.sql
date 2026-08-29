-- KOTAKAS STAGING ONLY
-- Teklif butunlugu: ayni kullanicinin ayni ilana tek acik teklifi olur.
-- Ilan rezerve/satildi/iptal durumuna gecince acik teklifler otomatik kapanir.

create unique index if not exists listing_offers_one_open_per_user_idx
  on listing_offers(listing_id, offered_by)
  where status = 'open';

create or replace function kotakas_close_open_offers_on_listing_state()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('reserved', 'sold') then
      update listing_offers
      set status = 'rejected', updated_at = now()
      where listing_id = new.id and status = 'open';
    elsif new.status = 'cancelled' then
      update listing_offers
      set status = 'cancelled', updated_at = now()
      where listing_id = new.id and status = 'open';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_kotakas_close_listing_offers on listings;
create trigger trg_kotakas_close_listing_offers
after update of status on listings
for each row execute function kotakas_close_open_offers_on_listing_state();
