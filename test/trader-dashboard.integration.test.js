import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { detectTraderDashboardCompatibility, getTraderDashboard } from '../src/trader-dashboard-api.js';

const dbReady = Boolean(process.env.DATABASE_URL && pool);

async function resetSchema() {
  await pool.query('drop table if exists swap_requests, listing_questions, listing_offers, orders, wallets, listings cascade');
  await pool.query(`
    create table listings (
      id bigserial primary key,
      seller_id bigint not null,
      title text not null,
      server text not null,
      price numeric not null,
      status text not null,
      order_id bigint,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table wallets (
      user_id bigint primary key,
      available_balance numeric not null default 0,
      held_balance numeric not null default 0,
      updated_at timestamptz not null default now()
    );
    create table orders (
      id bigserial primary key,
      listing_id bigint,
      buyer_id bigint not null,
      seller_id bigint not null,
      amount numeric not null,
      commission_rate numeric not null,
      commission_amount numeric not null,
      seller_net numeric not null,
      escrow_state text not null,
      idempotency_key text unique,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table listing_offers (
      id bigserial primary key,
      listing_id bigint not null references listings(id),
      offered_by bigint not null,
      amount numeric not null,
      status text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table listing_questions (
      id bigserial primary key,
      listing_id bigint not null references listings(id),
      buyer_id bigint not null,
      seller_id bigint not null,
      question_code text not null,
      answer_code text,
      status text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table swap_requests (
      id bigserial primary key,
      proposer_id bigint not null,
      recipient_id bigint not null,
      offered_listing_id bigint not null references listings(id),
      requested_listing_id bigint not null references listings(id),
      status text not null,
      proposer_received_at timestamptz,
      recipient_received_at timestamptz,
      accepted_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    insert into wallets (user_id,available_balance,held_balance) values (200,1250,150);
    insert into listings (id,seller_id,title,server,price,status) values
      (1,200,'Raptor +8','ZERO',1000,'active'),
      (2,200,'Iron Bow +8','ZERO',1000,'sold'),
      (3,200,'Glave +9','ZERO',1200,'swapped'),
      (4,300,'Mirage Dagger +9','ZERO',950,'active');
    insert into orders (listing_id,buyer_id,seller_id,amount,commission_rate,commission_amount,seller_net,escrow_state,idempotency_key) values
      (2,301,200,1000,0.05,50,950,'released','sale-1'),
      (1,302,200,400,0.05,20,380,'held','sale-2');
    insert into listing_offers (listing_id,offered_by,amount,status) values
      (1,401,900,'open'),
      (1,402,850,'rejected');
    insert into listing_questions (listing_id,buyer_id,seller_id,question_code,status) values
      (1,501,200,'DELIVERY_TIME','pending'),
      (1,502,200,'STILL_AVAILABLE','answered');
    insert into swap_requests (proposer_id,recipient_id,offered_listing_id,requested_listing_id,status) values
      (300,200,4,1,'pending');
  `);
  await detectTraderDashboardCompatibility({ force: true });
}

test('trader dashboard aggregates real seller finance, marketplace and inbox data without exposing counterpart identities', { skip: !dbReady }, async () => {
  await resetSchema();
  const oldRate = config.traderCommissionRate;
  config.traderCommissionRate = 0.05;
  try {
    const dashboard = await getTraderDashboard({ traderId: 200, role: 'trader', limit: 10 });
    assert.equal(dashboard.wallet.availableBalance, 1250);
    assert.equal(dashboard.wallet.heldBalance, 150);
    assert.equal(dashboard.summary.activeListings, 1);
    assert.equal(dashboard.summary.soldListings, 1);
    assert.equal(dashboard.summary.swappedListings, 1);
    assert.equal(dashboard.summary.totalSales, 2);
    assert.equal(dashboard.summary.completedSales, 1);
    assert.equal(dashboard.summary.pendingSales, 1);
    assert.equal(dashboard.summary.grossRevenue, 1000);
    assert.equal(dashboard.summary.netEarnings, 950);
    assert.equal(dashboard.summary.commissionPaid, 50);
    assert.equal(dashboard.summary.openOffers, 1);
    assert.equal(dashboard.summary.pendingQuestions, 1);
    assert.equal(dashboard.summary.pendingSwaps, 1);
    assert.equal(dashboard.offers[0].amount, 900);
    assert.equal(Object.prototype.hasOwnProperty.call(dashboard.offers[0], 'offeredBy'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(dashboard.swaps[0], 'proposerId'), false);
    assert.equal(dashboard.commissionRate, 0.05);
    assert.deepEqual(dashboard.readiness, { wallet: true, marketplace: true, offers: true, questions: true, swaps: true });
    await assert.rejects(getTraderDashboard({ traderId: 200, role: 'user' }), /trader role required/);
  } finally {
    config.traderCommissionRate = oldRate;
    await pool.query('drop table if exists swap_requests, listing_questions, listing_offers, orders, wallets, listings cascade');
  }
});
