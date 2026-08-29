-- KOTAKAS STAGING ONLY
-- Ayni kullanicinin ayni ilana birden fazla acik teklifi olmasini engeller.

create unique index if not exists listing_offers_one_open_per_user_idx
  on listing_offers(listing_id, offered_by)
  where status = 'open';
