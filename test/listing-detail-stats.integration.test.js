import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import {
  detectListingDetailCompatibility,
  getListingDetail,
  getListingStatistics,
} from '../src/listing-detail-api.js';

const dbReady = Boolean(process.env.DATABASE_URL && pool);

async function dropSchema() {
  await pool.query('drop table if exists listing_offers, listing_price_history, listing_item_metadata, item_catalog, orders, listings cascade');
  await pool.query('drop function if exists kotakas_record_listing_price_history() cascade');
}

async function baseSchema() {
  await dropSchema();
  await pool.query(`
    create table listings (
      id bigserial primary key,
      seller_id bigint not null,
      title text not null,
      server text not null,
      description text,
      price numeric(18,2) not null,
      status text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table orders (
      id bigserial primary key,
      seller_id bigint not null,
      escrow_state text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
}

async function optionalSchema() {
  await pool.query(`
    create table item_catalog (
      id bigserial primary key,
      canonical_name text not null,
      slug text not null unique,
      image_url text,
      class_info text,
      base_attributes jsonb not null default '{}'::jsonb,
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
    create table listing_price_history (
      id bigserial primary key,
      listing_id bigint not null references listings(id) on delete cascade,
      price numeric(18,2) not null,
      source text not null,
      recorded_at timestamptz not null default now()
    );
    create table listing_offers (
      id bigserial primary key,
      listing_id bigint not null references listings(id) on delete cascade,
      offered_by bigint not null,
      amount numeric(18,2) not null,
      status text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
}

test('item metadata and real market statistics are returned without exposing offer identities', { skip: !dbReady }, async () => {
  await baseSchema();
  await optionalSchema();
  try {
    await pool.query(`
      insert into listings (id, seller_id, title, server, description, price, status, created_at, updated_at)
      values (10, 202, 'Glave +10', 'FELIS', 'PK item', 205000, 'active', now() - interval '20 days', now() - interval '1 hour');
      insert into orders (seller_id, escrow_state, created_at, updated_at)
      values (202, 'released', now() - interval '2 hours', now() - interval '90 minutes'),
             (202, 'released', now() - interval '80 minutes', now() - interval '50 minutes');
      insert into item_catalog (id, canonical_name, slug, image_url, class_info, base_attributes)
      values (7, 'Glave', 'glave', 'https://cdn.example.com/glave.png', 'Warrior, Priest, Kurian', '{"attackPower":225,"attackSpeed":"Very Slow","weight":15}');
      insert into listing_item_metadata (listing_id, item_id, enhancement, reverse, delivery_window, attributes)
      values (10, 7, 10, false, '09:00 - 18:00', '{"poisonDamage":100,"requiredStrength":226}');
      insert into listing_price_history (listing_id, price, source, recorded_at)
      values (10, 225999, 'migration_seed', now() - interval '6 days'),
             (10, 215000, 'listing_price_changed', now() - interval '3 days'),
             (10, 205000, 'listing_price_changed', now() - interval '1 hour');
      insert into listing_offers (listing_id, offered_by, amount, status, created_at)
      values (10, 101, 190000, 'rejected', now() - interval '5 days'),
             (10, 303, 198000, 'open', now() - interval '2 days'),
             (10, 404, 200000, 'accepted', now() - interval '1 day');
    `);

    const compatibility = await detectListingDetailCompatibility({ force: true });
    assert.equal(compatibility.ready, true);
    assert.equal(compatibility.features.itemMetadataReady, true);
    assert.equal(compatibility.features.priceHistoryReady, true);
    assert.equal(compatibility.features.offerStatsReady, true);

    const detail = await getListingDetail(10);
    assert.equal(detail.enhancement, 10);
    assert.equal(detail.enhancementLabel, '+10');
    assert.equal(detail.reverse, false);
    assert.equal(detail.deliveryWindow, '09:00 - 18:00');
    assert.equal(detail.item.canonicalName, 'Glave');
    assert.equal(detail.item.imageUrl, 'https://cdn.example.com/glave.png');
    assert.equal(detail.item.attributes.attackPower, 225);
    assert.equal(detail.item.attributes.poisonDamage, 100);
    assert.equal(detail.seller.successfulSales, 2);

    const stats = await getListingStatistics(10, 'weekly');
    assert.equal(stats.historyReady, true);
    assert.equal(stats.offersReady, true);
    assert.equal(stats.priceHistory.length, 3);
    assert.equal(stats.priceSummary.min, 205000);
    assert.equal(stats.priceSummary.max, 225999);
    assert.ok(stats.priceSummary.changePercent < 0);
    assert.equal(stats.offersSummary.count, 3);
    assert.equal(stats.offersSummary.openCount, 1);
    assert.equal(stats.offersSummary.acceptedCount, 1);
    assert.equal(Object.hasOwn(stats.offersSummary, 'offeredBy'), false);
  } finally {
    await dropSchema();
  }
});

test('detail stays usable when optional item/stat tables are not migrated yet', { skip: !dbReady }, async () => {
  await baseSchema();
  try {
    await pool.query(`
      insert into listings (id, seller_id, title, server, description, price, status)
      values (20, 202, 'Mirage Dagger +8', 'ZERO', '', 350, 'active');
    `);
    const compatibility = await detectListingDetailCompatibility({ force: true });
    assert.equal(compatibility.ready, true);
    assert.equal(compatibility.features.itemMetadataReady, false);
    assert.equal(compatibility.features.priceHistoryReady, false);
    assert.equal(compatibility.features.offerStatsReady, false);

    const detail = await getListingDetail(20);
    assert.equal(detail.enhancement, 8);
    assert.equal(detail.enhancementLabel, '+8');
    assert.equal(detail.item, null);

    const stats = await getListingStatistics(20, 'monthly');
    assert.equal(stats.range, 'monthly');
    assert.equal(stats.historyReady, false);
    assert.equal(stats.offersReady, false);
    assert.deepEqual(stats.priceHistory, []);
    assert.equal(stats.offersSummary.count, 0);
  } finally {
    await dropSchema();
  }
});
