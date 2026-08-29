import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { detectListingDetailCompatibility, getListingDetail } from '../src/listing-detail-api.js';

const dbReady = Boolean(process.env.DATABASE_URL && pool);

async function resetSchema() {
  await pool.query('drop table if exists orders, listings cascade');
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
      created_at timestamptz not null,
      updated_at timestamptz not null
    );
    insert into listings (id,seller_id,title,server,description,price,status)
    values (7,202,'Glave +10','FELIS','Detay sayfasi test ilani',205000,'active');
    insert into orders (seller_id,escrow_state,created_at,updated_at) values
      (202,'released',now() - interval '30 minutes',now() - interval '20 minutes'),
      (202,'released',now() - interval '30 minutes',now() - interval '10 minutes'),
      (202,'refunded',now() - interval '30 minutes',now());
  `);
  await detectListingDetailCompatibility({ force: true });
}

test('listing detail returns real seller sale stats without inventing item metadata', { skip: !dbReady }, async () => {
  await resetSchema();
  try {
    const compatibility = await detectListingDetailCompatibility({ force: true });
    assert.equal(compatibility.ready, true);

    const listing = await getListingDetail(7);
    assert.equal(listing.title, 'Glave +10');
    assert.equal(listing.server, 'FELIS');
    assert.equal(listing.price, 205000);
    assert.equal(listing.enhancement, '+10');
    assert.equal(listing.reverse, null);
    assert.equal(listing.seller.successfulSales, 2);
    assert.equal(listing.seller.averageCompletionMinutes, 15);
    assert.equal(listing.statistics.historyReady, false);
  } finally {
    await pool.query('drop table if exists orders, listings cascade');
  }
});

test('listing detail rejects unknown listing', { skip: !dbReady }, async () => {
  await resetSchema();
  try {
    await assert.rejects(getListingDetail(999), /listing not found/);
  } finally {
    await pool.query('drop table if exists orders, listings cascade');
  }
});
