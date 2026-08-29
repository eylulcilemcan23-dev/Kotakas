import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { createCatalogListing } from '../src/catalog-marketplace.js';
import {
  detectItemCatalogCompatibility,
  listCatalogMarketListings,
  searchItemCatalog,
} from '../src/item-catalog-core.js';

const dbReady = Boolean(process.env.DATABASE_URL && pool);

async function resetSchema() {
  await pool.query('drop table if exists listing_item_metadata, item_catalog, listings cascade');
  await pool.query(`
    create table listings (
      id bigserial primary key,
      seller_id bigint not null,
      title text not null,
      server text not null,
      description text,
      price numeric not null,
      status text not null,
      order_id bigint,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table item_catalog (
      id bigserial primary key,
      canonical_name text not null,
      slug text not null unique,
      image_url text,
      class_info text,
      base_attributes jsonb not null default '{}'::jsonb,
      category text,
      subcategory text,
      keywords text[] not null default '{}'::text[],
      variants jsonb not null default '{}'::jsonb,
      source_name text,
      source_ref text,
      source_license text,
      active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table listing_item_metadata (
      listing_id bigint primary key references listings(id) on delete cascade,
      item_id bigint references item_catalog(id),
      enhancement smallint,
      reverse boolean,
      delivery_window text,
      attributes jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    insert into item_catalog (
      id,canonical_name,slug,image_url,class_info,base_attributes,category,subcategory,keywords,variants,
      source_name,source_ref,source_license,active
    ) values (
      10,'Iron Bow','iron-bow','https://example.com/ib.png','Rogue',
      '{"attackSpeed":"Slow","effectiveRange":40}'::jsonb,'Weapon','Bow',array['iron bow','ib','bow'],
      '{"normal":{"8":{"attackPower":128,"poisonDamage":80,"requiredDexterity":168}},"reverse":{"5":{"attackPower":128,"poisonDamage":80}}}'::jsonb,
      'Verified Source','https://example.com/source','CC BY-SA 4.0',true
    );
  `);
  await detectItemCatalogCompatibility({ force: true });
}

test('catalog search uses aliases and returns verified source metadata', { skip: !dbReady }, async () => {
  await resetSchema();
  try {
    const items = await searchItemCatalog({ q: 'ib', limit: 10 });
    assert.equal(items.length, 1);
    assert.equal(items[0].canonicalName, 'Iron Bow');
    assert.deepEqual(items[0].normalLevels, [8]);
    assert.equal(items[0].source.name, 'Verified Source');
  } finally {
    await pool.query('drop table if exists listing_item_metadata, item_catalog, listings cascade');
  }
});

test('catalog listing derives title and item stats server-side and appears in enriched market search', { skip: !dbReady }, async () => {
  await resetSchema();
  const oldWrites = config.marketWritesEnabled;
  config.marketWritesEnabled = true;
  try {
    const listing = await createCatalogListing({
      sellerId: 200,
      sellerRole: 'trader',
      itemId: 10,
      server: 'zero',
      enhancement: 8,
      reverse: false,
      deliveryWindow: '30 dk içinde',
      description: 'Hızlı teslim',
      price: 1250,
    });
    assert.equal(listing.title, 'Iron Bow +8');
    assert.equal(listing.item.attributes.attackPower, 128);
    assert.equal(listing.item.attributes.attackSpeed, 'Slow');

    const meta = await pool.query('select enhancement,reverse,delivery_window,attributes from listing_item_metadata where listing_id=$1', [listing.id]);
    assert.equal(Number(meta.rows[0].enhancement), 8);
    assert.equal(meta.rows[0].reverse, false);
    assert.equal(meta.rows[0].delivery_window, '30 dk içinde');
    assert.equal(Number(meta.rows[0].attributes.attackPower), 128);

    const results = await listCatalogMarketListings({ q: 'ib', server: 'ZERO', category: 'Weapon' });
    assert.equal(results.length, 1);
    assert.equal(results[0].title, 'Iron Bow +8');
    assert.equal(results[0].item.subcategory, 'Bow');
    assert.equal(Object.prototype.hasOwnProperty.call(results[0], 'buyerId'), false);
  } finally {
    config.marketWritesEnabled = oldWrites;
    await pool.query('drop table if exists listing_item_metadata, item_catalog, listings cascade');
  }
});
