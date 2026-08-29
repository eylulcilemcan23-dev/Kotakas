import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { detectMarketplaceCompatibility } from '../src/marketplace.js';
import { acceptOffer, createOrUpdateOffer, detectOfferCompatibility } from '../src/offers-api.js';

const dbReady = Boolean(process.env.DATABASE_URL && pool);

async function resetSchema() {
  await pool.query('drop table if exists wallet_transactions, listing_offers, orders, wallets, listings cascade');
  await pool.query(`
    create table listings (
      id bigserial primary key,
      seller_id bigint not null,
      title text not null,
      server text not null,
      description text,
      price numeric(18,2) not null,
      status text not null,
      order_id bigint,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table listing_offers (
      id bigserial primary key,
      listing_id bigint not null references listings(id) on delete cascade,
      offered_by bigint not null,
      amount numeric(18,2) not null,
      status text not null default 'open',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table wallets (
      user_id bigint primary key,
      available_balance numeric(18,2) not null default 0,
      held_balance numeric(18,2) not null default 0,
      updated_at timestamptz not null default now()
    );
    create table orders (
      id bigserial primary key,
      listing_id bigint,
      buyer_id bigint not null,
      seller_id bigint not null,
      amount numeric(18,2) not null,
      commission_rate numeric(18,6) not null,
      commission_amount numeric(18,2) not null,
      seller_net numeric(18,2) not null,
      escrow_state text not null,
      idempotency_key text not null unique,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table wallet_transactions (
      id bigserial primary key,
      order_id bigint,
      user_id bigint not null,
      kind text not null,
      available_delta numeric(18,2) not null,
      held_delta numeric(18,2) not null,
      created_at timestamptz not null default now()
    );
  `);
  await detectOfferCompatibility({ force: true });
  await detectMarketplaceCompatibility({ force: true });
}

function enableWrites() {
  const old = {
    marketWritesEnabled: config.marketWritesEnabled,
    financeWritesEnabled: config.financeWritesEnabled,
    escrowApiEnabled: config.escrowApiEnabled,
    commissionRate: config.commissionRate,
  };
  config.marketWritesEnabled = true;
  config.financeWritesEnabled = true;
  config.escrowApiEnabled = true;
  config.commissionRate = 0.05;
  return () => Object.assign(config, old);
}

test('buyer can create one open offer and update its amount', { skip: !dbReady }, async () => {
  const restore = enableWrites();
  await resetSchema();
  try {
    await pool.query(`insert into listings (id,seller_id,title,server,price,status) values (10,200,'Glave +10','FELIS',100,'active')`);
    const first = await createOrUpdateOffer({ listingId: 10, buyerId: 300, amount: 70 });
    const second = await createOrUpdateOffer({ listingId: 10, buyerId: 300, amount: 75 });
    assert.equal(first.id, second.id);
    assert.equal(second.amount, 75);
    const rows = await pool.query(`select count(*)::int as count from listing_offers where listing_id = 10 and offered_by = 300 and status = 'open'`);
    assert.equal(rows.rows[0].count, 1);
    await assert.rejects(createOrUpdateOffer({ listingId: 10, buyerId: 300, amount: 100 }), /below listing price/);
    await assert.rejects(createOrUpdateOffer({ listingId: 10, buyerId: 200, amount: 50 }), /buyer and seller/);
  } finally {
    restore();
    await pool.query('drop table if exists wallet_transactions, listing_offers, orders, wallets, listings cascade');
  }
});

test('seller accepting offer atomically holds buyer funds, reserves listing and rejects other offers', { skip: !dbReady }, async () => {
  const restore = enableWrites();
  await resetSchema();
  try {
    await pool.query(`
      insert into listings (id,seller_id,title,server,price,status) values (11,201,'Raptor +8','ZERO',100,'active');
      insert into wallets (user_id,available_balance,held_balance) values (301,100,0),(302,100,0);
      insert into listing_offers (id,listing_id,offered_by,amount,status) values
        (51,11,301,80,'open'),(52,11,302,70,'open');
    `);
    const result = await acceptOffer({ offerId: 51, sellerId: 201, idempotencyKey: 'offer-accept-test-51' });
    assert.equal(result.order.amount, 80);
    assert.equal(result.order.escrowState, 'held');
    assert.equal(result.offer.status, 'accepted');

    const wallet = await pool.query('select available_balance,held_balance from wallets where user_id = 301');
    assert.equal(Number(wallet.rows[0].available_balance), 20);
    assert.equal(Number(wallet.rows[0].held_balance), 80);
    const listing = await pool.query('select status,order_id from listings where id = 11');
    assert.equal(listing.rows[0].status, 'reserved');
    assert.equal(String(listing.rows[0].order_id), result.order.id);
    const other = await pool.query('select status from listing_offers where id = 52');
    assert.equal(other.rows[0].status, 'rejected');
    const ledger = await pool.query(`select available_delta,held_delta from wallet_transactions where order_id = $1 and user_id = 301`, [result.order.id]);
    assert.equal(Number(ledger.rows[0].available_delta), -80);
    assert.equal(Number(ledger.rows[0].held_delta), 80);

    const again = await acceptOffer({ offerId: 51, sellerId: 201, idempotencyKey: 'offer-accept-test-51' });
    assert.equal(again.order.id, result.order.id);
    const orders = await pool.query('select count(*)::int as count from orders where listing_id = 11');
    assert.equal(orders.rows[0].count, 1);
  } finally {
    restore();
    await pool.query('drop table if exists wallet_transactions, listing_offers, orders, wallets, listings cascade');
  }
});

test('insufficient buyer balance leaves offer and listing untouched', { skip: !dbReady }, async () => {
  const restore = enableWrites();
  await resetSchema();
  try {
    await pool.query(`
      insert into listings (id,seller_id,title,server,price,status) values (12,202,'Iron Bow +8','ZERO',120,'active');
      insert into wallets (user_id,available_balance,held_balance) values (303,25,0);
      insert into listing_offers (id,listing_id,offered_by,amount,status) values (53,12,303,90,'open');
    `);
    await assert.rejects(acceptOffer({ offerId: 53, sellerId: 202, idempotencyKey: 'offer-accept-insufficient' }), /insufficient balance/);
    const offer = await pool.query('select status from listing_offers where id = 53');
    const listing = await pool.query('select status,order_id from listings where id = 12');
    const wallet = await pool.query('select available_balance,held_balance from wallets where user_id = 303');
    assert.equal(offer.rows[0].status, 'open');
    assert.equal(listing.rows[0].status, 'active');
    assert.equal(listing.rows[0].order_id, null);
    assert.equal(Number(wallet.rows[0].available_balance), 25);
    assert.equal(Number(wallet.rows[0].held_balance), 0);
  } finally {
    restore();
    await pool.query('drop table if exists wallet_transactions, listing_offers, orders, wallets, listings cascade');
  }
});
