import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { pool } from '../src/db.js';
import { releaseEscrow } from '../src/finance-write-adapter.js';
import {
  createListing,
  detectMarketplaceCompatibility,
  purchaseListing,
  syncListingForOrder,
} from '../src/marketplace.js';

const dbReady = Boolean(process.env.DATABASE_URL && pool);

async function resetSchema() {
  await pool.query('drop table if exists commissions, wallet_transactions, orders, listings, wallets cascade');
  await pool.query(`
    create table wallets (
      user_id bigint primary key,
      available_balance numeric(18,2) not null default 0 check (available_balance >= 0),
      held_balance numeric(18,2) not null default 0 check (held_balance >= 0),
      updated_at timestamptz not null default now()
    );
    create table listings (
      id bigserial primary key,
      seller_id bigint not null,
      title text not null,
      server text not null,
      description text,
      price numeric(18,2) not null check (price > 0),
      status text not null check (status in ('active','reserved','sold','cancelled')),
      order_id bigint,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table orders (
      id bigserial primary key,
      listing_id bigint references listings(id),
      buyer_id bigint not null,
      seller_id bigint not null,
      amount numeric(18,2) not null check (amount > 0),
      commission_rate numeric(8,6) not null check (commission_rate >= 0 and commission_rate <= 1),
      commission_amount numeric(18,2) not null check (commission_amount >= 0),
      seller_net numeric(18,2) not null check (seller_net >= 0),
      escrow_state text not null check (escrow_state in ('held','released','refunded')),
      idempotency_key text not null unique,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    alter table listings add constraint listings_order_fk foreign key (order_id) references orders(id);
    create table wallet_transactions (
      id bigserial primary key,
      order_id bigint not null references orders(id),
      user_id bigint not null,
      kind text not null,
      available_delta numeric(18,2) not null default 0,
      held_delta numeric(18,2) not null default 0,
      created_at timestamptz not null default now()
    );
    create table commissions (
      id bigserial primary key,
      order_id bigint not null unique references orders(id),
      amount numeric(18,2) not null check (amount >= 0),
      rate numeric(8,6) not null check (rate >= 0 and rate <= 1),
      created_at timestamptz not null default now()
    );
    insert into wallets (user_id, available_balance, held_balance)
    values (101,500,0),(202,0,0),(303,500,0);
  `);
  await detectMarketplaceCompatibility({ force: true });
}

async function wallet(id) {
  const result = await pool.query('select available_balance::text as available, held_balance::text as held from wallets where user_id=$1', [id]);
  return result.rows[0];
}

function enableWrites() {
  const before = {
    market: config.marketWritesEnabled,
    finance: config.financeWritesEnabled,
    escrow: config.escrowApiEnabled,
    rate: config.commissionRate,
  };
  config.marketWritesEnabled = true;
  config.financeWritesEnabled = true;
  config.escrowApiEnabled = true;
  config.commissionRate = 0.05;
  return () => {
    config.marketWritesEnabled = before.market;
    config.financeWritesEnabled = before.finance;
    config.escrowApiEnabled = before.escrow;
    config.commissionRate = before.rate;
  };
}

test('listing purchase uses server-side listing price and reserves it atomically', { skip: !dbReady }, async () => {
  await resetSchema();
  const restore = enableWrites();
  try {
    const compatibility = await detectMarketplaceCompatibility({ force: true });
    assert.equal(compatibility.ready, true);

    const listing = await createListing({ sellerId: 202, title: 'Mirage Dagger +8', server: 'ZERO', description: 'Test item', price: 400 });
    const order = await purchaseListing({ buyerId: 101, listingId: listing.id, idempotencyKey: 'listing-buy-1' });

    assert.equal(order.amount, 400);
    assert.equal(order.sellerId, '202');
    assert.equal(order.commissionAmount, 20);
    assert.deepEqual(await wallet(101), { available: '100.00', held: '400.00' });

    const stored = await pool.query('select status, order_id::text as order_id from listings where id=$1', [listing.id]);
    assert.deepEqual(stored.rows[0], { status: 'reserved', order_id: order.id });
  } finally {
    restore();
    await pool.query('drop table if exists commissions, wallet_transactions, orders, listings, wallets cascade');
  }
});

test('two buyers cannot buy the same listing concurrently', { skip: !dbReady }, async () => {
  await resetSchema();
  const restore = enableWrites();
  try {
    const listing = await createListing({ sellerId: 202, title: 'Iron Bow +9', server: 'ZERO', price: 300 });
    const results = await Promise.allSettled([
      purchaseListing({ buyerId: 101, listingId: listing.id, idempotencyKey: 'race-a' }),
      purchaseListing({ buyerId: 303, listingId: listing.id, idempotencyKey: 'race-b' }),
    ]);
    assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
    assert.equal(results.filter((x) => x.status === 'rejected').length, 1);

    const orders = await pool.query('select count(*)::int as count from orders where listing_id=$1', [listing.id]);
    assert.equal(orders.rows[0].count, 1);
    const balances = [await wallet(101), await wallet(303)];
    assert.equal(balances.filter((x) => x.held === '300.00').length, 1);
    assert.equal(balances.filter((x) => x.available === '500.00').length, 1);
  } finally {
    restore();
    await pool.query('drop table if exists commissions, wallet_transactions, orders, listings, wallets cascade');
  }
});

test('buyer cannot purchase own listing', { skip: !dbReady }, async () => {
  await resetSchema();
  const restore = enableWrites();
  try {
    const listing = await createListing({ sellerId: 202, title: 'Self sale', server: 'ZERO', price: 50 });
    await assert.rejects(
      purchaseListing({ buyerId: 202, listingId: listing.id, idempotencyKey: 'self-buy' }),
      /buyer and seller must differ/,
    );
    const orders = await pool.query('select count(*)::int as count from orders');
    assert.equal(orders.rows[0].count, 0);
  } finally {
    restore();
    await pool.query('drop table if exists commissions, wallet_transactions, orders, listings, wallets cascade');
  }
});

test('released listing becomes sold after escrow reconciliation', { skip: !dbReady }, async () => {
  await resetSchema();
  const restore = enableWrites();
  try {
    const listing = await createListing({ sellerId: 202, title: 'Complete sale', server: 'ZERO', price: 200 });
    const order = await purchaseListing({ buyerId: 101, listingId: listing.id, idempotencyKey: 'complete-sale' });
    await releaseEscrow(order.id);
    const synced = await syncListingForOrder(order.id);
    assert.equal(synced.status, 'sold');
    assert.equal((await wallet(202)).available, '190.00');
  } finally {
    restore();
    await pool.query('drop table if exists commissions, wallet_transactions, orders, listings, wallets cascade');
  }
});
