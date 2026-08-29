-- KOTAKAS source-migration / STAGING ONLY
-- Production veritabaninda otomatik calistirilmaz.
-- Faz 16.1: doğrulanmış popüler item katalog genişlemesi.
-- Kaynak: Knight Online Wiki. Lisans: CC BY-SA 4.0.
-- Reverse tablolardaki belirsiz colspan alanlari eklenmez; AP ve kesin elemental hasar degerleri kullanilir.

begin;

create or replace function pg_temp.kotakas_build_variants(
  normal_ap integer[],
  reverse_ap integer[],
  normal_damage integer[],
  reverse_damage integer[],
  damage_key text
) returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'normal', coalesce((
      select jsonb_object_agg(
        i::text,
        jsonb_build_object('attackPower', normal_ap[i]) ||
          case
            when normal_damage is not null and i <= coalesce(array_length(normal_damage, 1), 0)
              then jsonb_build_object(damage_key, normal_damage[i])
            else '{}'::jsonb
          end
        order by i
      )
      from generate_subscripts(normal_ap, 1) as g(i)
    ), '{}'::jsonb),
    'reverse', coalesce((
      select jsonb_object_agg(
        i::text,
        jsonb_build_object('attackPower', reverse_ap[i]) ||
          case
            when reverse_damage is not null and i <= coalesce(array_length(reverse_damage, 1), 0)
              then jsonb_build_object(damage_key, reverse_damage[i])
            else '{}'::jsonb
          end
        order by i
      )
      from generate_subscripts(reverse_ap, 1) as g(i)
    ), '{}'::jsonb)
  );
$$;

insert into item_catalog (
  canonical_name, slug, image_url, class_info, category, subcategory, keywords,
  base_attributes, variants, source_name, source_ref, source_license, active
) values
(
  'Shard', 'shard',
  'https://wiki.korehberi.com/images/c/c8/Itemicon_1_1121_00_0.png',
  'Rogue', 'Weapon', 'Dagger', array['shard','sh','dagger','rogue']::text[],
  '{"attackSpeed":"Fast","effectiveRange":1,"weight":2}'::jsonb,
  pg_temp.kotakas_build_variants(
    array[66,70,74,78,82,86,92,101,114,134],
    array[92,94,96,98,101,103,105,107,109,111,114,116,118,120,122,124,126,128,130,132,134],
    array[10,20,30,40,50,60,70,80,90,100],
    array[70,72,75,77,80,81,83,84,86,88,90,91,92,93,94,95,96,97,98,99,100],
    'poisonDamage'
  ),
  'Knight Online Wiki', 'https://wiki.korehberi.com/index.php?title=Shard&oldid=4850', 'CC BY-SA 4.0', true
),
(
  'Iron Impact', 'iron-impact', null,
  null, 'Weapon', 'Two-handed Club', array['iron impact','ii','impact','two handed club','club']::text[],
  '{"attackSpeed":"Slow","effectiveRange":1.5,"weight":14}'::jsonb,
  pg_temp.kotakas_build_variants(
    array[130,136,142,148,154,160,168,180,198,228],
    array[168,171,174,177,180,183,186,189,192,195,198,201,204,207,210,213,216,219,222,225,228],
    array[10,20,30,40,50,60,70,80,90,100],
    array[70,72,75,77,80,81,83,84,86,88,90,91,92,93,94,95,96,97,98,99,100],
    'lightningDamage'
  ),
  'Knight Online Wiki', 'https://wiki.korehberi.com/index.php?title=Iron_Impact&oldid=4284', 'CC BY-SA 4.0', true
),
(
  'Hell Breaker', 'hell-breaker', null,
  null, 'Weapon', 'Two-handed Club', array['hell breaker','hb','two handed club','club','battle priest','bp']::text[],
  '{"attackSpeed":"Slow","effectiveRange":1.5,"weight":16}'::jsonb,
  pg_temp.kotakas_build_variants(
    array[131,137,143,149,155,161,169,181,199,229],
    array[169,172,175,178,181,184,187,190,193,196,199,202,205,208,211,214,217,220,223,226,229],
    array[50,65,80,95,110,125,140,155,170,185],
    array[140,143,147,151,155,157,160,162,165,167,170,171,173,174,176,177,179,180,182,183,185],
    'flameDamage'
  ),
  'Knight Online Wiki', 'https://wiki.korehberi.com/index.php?title=Hell_Breaker&oldid=4386', 'CC BY-SA 4.0', true
),
(
  'Chitin Bow', 'chitin-bow',
  'https://wiki.korehberi.com/images/c/cb/Itemicon_1_6841_00_0.png',
  'Rogue', 'Weapon', 'Bow', array['chitin bow','cb','bow','rogue','shaula']::text[],
  '{"attackSpeed":"Slow","effectiveRange":40,"weight":3}'::jsonb,
  pg_temp.kotakas_build_variants(
    array[101,103,105,107,109,111,116,125,138,158],
    array[116,118,120,122,125,127,129,131,133,135,138,140,142,144,146,148,150,152,154,156,158],
    array[10,20,30,40,50,60,70,80,90,100],
    array[70,72,75,77,80,81,83,84,86,88,90,91,92,93,94,95,96,97,98,99,100],
    'flameDamage'
  ),
  'Knight Online Wiki', 'https://wiki.korehberi.com/index.php?title=Chitin_Bow&oldid=4375', 'CC BY-SA 4.0', true
),
(
  'Wrath of Erenion', 'wrath-of-erenion',
  'https://wiki.korehberi.com/images/a/aa/Itemicon_1_8111_00_0.png',
  'Mage', 'Weapon', 'Staff', array['wrath of erenion','woe','staff','mage','fire','flame']::text[],
  '{"attackSpeed":"Very Slow","effectiveRange":1,"weight":4,"requiredIntelligence":112}'::jsonb,
  pg_temp.kotakas_build_variants(
    array[65,69,73,77,81,85,91,100,113,133],
    array[91,93,95,97,100,102,104,106,108,110,113,115,117,119,121,123,125,127,129,131,133],
    array[30,38,46,54,62,70,78,86,94,102],
    null,
    'flameDamage'
  ),
  'Knight Online Wiki', 'https://wiki.korehberi.com/index.php?title=Wrath_of_Erenion&oldid=4470', 'CC BY-SA 4.0', true
),
(
  'Scorching Staff', 'scorching-staff',
  'https://wiki.korehberi.com/images/2/2b/Itemicon_1_8930_20_0.png',
  'Mage', 'Weapon', 'Staff', array['scorching staff','scorching','ss','staff','mage','fire','flame']::text[],
  '{"attackSpeed":"Very Slow","effectiveRange":1,"weight":4,"requiredIntelligence":112}'::jsonb,
  pg_temp.kotakas_build_variants(
    array[87,91,95,99,103,107,113,122,135,155],
    array[113,115,117,119,122,124,126,128,130,132,135,137,139,141,143,145,147,149,151,153,155],
    array[8,16,24,32,40,48,56,64,72,80],
    null,
    'flameDamage'
  ),
  'Knight Online Wiki', 'https://wiki.korehberi.com/index.php?title=Scorching_Staff&oldid=4294', 'CC BY-SA 4.0', true
)
on conflict (slug) do update set
  canonical_name=excluded.canonical_name,
  image_url=excluded.image_url,
  class_info=excluded.class_info,
  category=excluded.category,
  subcategory=excluded.subcategory,
  keywords=excluded.keywords,
  base_attributes=excluded.base_attributes,
  variants=excluded.variants,
  source_name=excluded.source_name,
  source_ref=excluded.source_ref,
  source_license=excluded.source_license,
  active=excluded.active,
  updated_at=now();

commit;
