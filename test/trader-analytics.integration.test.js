import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import {
  detectTraderAnalyticsCompatibility,
  getTraderAnalytics,
  normalizeAnalyticsRange,
} from '../src/trader-analytics-api.js';

const dbReady = Boolean(process.env.DATABASE_URL && pool);

async function resetSchema() {
  await pool.query('drop table if exists orders, listings cascade');
  await pool.query(`
    create table listings (
      id bigserial primary key,
      seller_id bigint not null,
      title text not null,
      server text not null,
      price numeric not null,
      status text not null
    );
    create table orders (
      id bigserial primary key,
      listing_id bigint,
      buyer_id bigint not null,
      seller_id bigint not null,
      amount numeric not null,
      commission_amount numeric not null,
      seller_net numeric not null,
      escrow_state text not null,
      updated_at timestamptz not null default now()
    );

    insert into listings (id,seller_id,title,server,price,status) values
      (1,200,'Raptor +8','ZERO',1000,'active'),
      (2,200,'Raptor +8','ZERO',900,'sold'),
      (3,200,'Iron Bow +8','ZERO',800,'active'),
      (4,300,'Mirage Dagger +9','ZERO',950,'sold');

    insert into orders (listing_id,buyer_id,seller_id,amount,commission_amount,seller_net,escrow_state,updated_at) values
      (2,301,200,1000,50,950,'released',now()),
      (2,302,200,600,30,570,'released',now() - interval '1 day'),
      (3,303,200,500,0,0,'refunded',now()),
      (1,304,200,400,20,380,'held',now()),
      (2,305,200,2000,100,1900,'released',now() - interval '120 days'),
      (4,306,300,999,50,949,'released',now());
  `);
  await detectTraderAnalyticsCompatibility({ force: true });
}

test('analytics range accepts only 7/30/90 days', () => {
  assert.equal(normalizeAnalyticsRange(7), 7);
  assert.equal(normalizeAnalyticsRange('90'), 90);
  assert.equal(normalizeAnalyticsRange(12), 30);
});

test('trader analytics builds real period series, commissions and top items without counterpart identities', { skip: !dbReady }, async () => {
  await resetSchema();
  try {
    const analytics = await getTraderAnalytics({ traderId: 200, role: 'trader', range: 7 });
    assert.equal(analytics.rangeDays, 7);
    assert.equal(analytics.period.completedSales, 2);
    assert.equal(analytics.period.refundedSales, 1);
    assert.equal(analytics.period.pendingSales, 1);
    assert.equal(analytics.period.grossRevenue, 1600);
    assert.equal(analytics.period.commissionPaid, 80);
    assert.equal(analytics.period.netEarnings, 1520);
    assert.equal(analytics.period.averageOrderValue, 800);
    assert.equal(analytics.period.completionRate, 66.67);
    assert.equal(analytics.period.activeListings, 2);
    assert.equal(analytics.period.activeStockValue, 1800);
    assert.equal(analytics.series.length, 7);
    assert.equal(analytics.series.reduce((sum, row) => sum + row.gross, 0), 1600);
    assert.equal(analytics.topItems[0].title, 'Raptor +8');
    assert.equal(analytics.topItems[0].sales, 2);
    assert.equal(Object.prototype.hasOwnProperty.call(analytics.topItems[0], 'buyerId'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(analytics, 'buyerId'), false);
    assert.ok(analytics.bestDay);
    await assert.rejects(getTraderAnalytics({ traderId: 200, role: 'user', range: 7 }), /trader role required/);
  } finally {
    await pool.query('drop table if exists orders, listings cascade');
  }
});
