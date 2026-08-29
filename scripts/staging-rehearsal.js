import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config.js';
import { pool } from '../src/db.js';
import { detectUserSchema } from '../src/user-adapter.js';
import { detectFinanceWriteCompatibility, releaseEscrow } from '../src/finance-write-adapter.js';
import { detectMarketplaceCompatibility, createListing, purchaseListing } from '../src/marketplace.js';
import { detectOfferCompatibility, createOrUpdateOffer, acceptOffer } from '../src/offers-api.js';
import { detectSwapCompatibility, createSwapRequest, acceptSwap, confirmSwapReceipt } from '../src/swaps-api.js';
import { detectItemCatalogCompatibility, searchItemCatalog } from '../src/item-catalog-core.js';
import {
  applyProviderPaymentEvent,
  createDepositIntent,
  detectPaymentFundingCompatibility,
} from '../src/payment-funding.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

if (!process.env.DATABASE_URL || !pool) throw new Error('DATABASE_URL is required for staging rehearsal');
if (process.env.NODE_ENV !== 'test' || process.env.KOTAKAS_STAGING_REHEARSAL !== '1') {
  throw new Error('Refusing destructive rehearsal outside isolated CI test database');
}

async function resetBaseSchema() {
  await pool.query('drop schema if exists public cascade; create schema public;');
  await pool.query(`
    create table users (
      id bigint primary key,
      email text not null unique,
      password_hash text not null,
      role text not null,
      name text
    );

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

    insert into users (id,email,password_hash,role,name) values
      (101,'buyer@test.local','$2b$10$abcdefghijklmnopqrstuuuuuuuuuuuuuuuuuuuuuuuuuuuu','user','Buyer'),
      (202,'trader@test.local','$2b$10$abcdefghijklmnopqrstuuuuuuuuuuuuuuuuuuuuuuuuuuuu','trader','Trader'),
      (303,'swapper@test.local','$2b$10$abcdefghijklmnopqrstuuuuuuuuuuuuuuuuuuuuuuuuuuuu','user','Swapper'),
      (404,'buyer2@test.local','$2b$10$abcdefghijklmnopqrstuuuuuuuuuuuuuuuuuuuuuuuuuuuu','user','Buyer 2');

    insert into wallets (user_id,available_balance,held_balance) values
      (101,600,0),(202,0,0),(303,0,0),(404,500,0);
  `);
}

async function applyStagingMigrations() {
  const dir = path.join(root, 'migrations');
  const files = (await fs.readdir(dir))
    .filter((name) => /^\d{3}_.+\.sql$/.test(name))
    .sort();
  const expected = Array.from({ length: 11 }, (_, index) => String(index + 2).padStart(3, '0'));
  assert.deepEqual(files.map((name) => name.slice(0, 3)), expected, 'migration sequence must be 002-012 without gaps');
  for (const file of files) {
    const sql = await fs.readFile(path.join(dir, file), 'utf8');
    await pool.query(sql);
    console.log(`[rehearsal] applied ${file}`);
  }
  return files;
}

function enableRehearsalFlags() {
  config.marketWritesEnabled = true;
  config.swapWritesEnabled = true;
  config.financeWritesEnabled = true;
  config.escrowApiEnabled = true;
  config.paymentWritesEnabled = true;
  config.withdrawalWritesEnabled = false;
  config.communicationWritesEnabled = true;
  config.auditLogEnabled = true;
  config.paymentProvider = 'sandbox';
  config.paymentWebhookSecret = 'ci-rehearsal-payment-secret-123456789';
  config.commissionRate = 0;
  config.traderCommissionRate = 0.05;
  config.normalUserMonthlyListingLimit = 1;
}

async function assertCompatibility() {
  await detectUserSchema({ force: true });
  const checks = {
    marketplace: await detectMarketplaceCompatibility({ force: true }),
    finance: await detectFinanceWriteCompatibility({ force: true }),
    offers: await detectOfferCompatibility({ force: true }),
    swaps: await detectSwapCompatibility({ force: true }),
    catalog: await detectItemCatalogCompatibility({ force: true }),
    funding: await detectPaymentFundingCompatibility({ force: true }),
  };
  for (const [name, status] of Object.entries(checks)) {
    assert.equal(status.ready, true, `${name} blockers: ${(status.blockers || []).join(', ')}`);
  }
  return checks;
}

async function wallet(userId) {
  const result = await pool.query(
    'select available_balance::text as available,held_balance::text as held from wallets where user_id=$1',
    [userId],
  );
  return result.rows[0];
}

async function main() {
  await resetBaseSchema();
  const migrations = await applyStagingMigrations();
  enableRehearsalFlags();
  const compatibility = await assertCompatibility();

  const catalog = await searchItemCatalog({ q: 'IB8', limit: 10 });
  assert.ok(catalog.some((row) => row.canonicalName === 'Iron Bow' && row.matchedEnhancement === 8), 'IB8 must resolve to Iron Bow +8');

  const deposit = await createDepositIntent({
    userId: 101,
    amount: 100,
    idempotencyKey: 'rehearsal:deposit:101:100',
    provider: 'sandbox',
  });
  const depositEvent = {
    eventId: 'rehearsal-deposit-event-1',
    merchantReference: deposit.merchantReference,
    providerPaymentId: 'rehearsal-payment-1',
    status: 'paid',
    amount: 100,
    currency: 'TRY',
  };
  const credited = await applyProviderPaymentEvent(depositEvent, { provider: 'sandbox' });
  const duplicateCredit = await applyProviderPaymentEvent(depositEvent, { provider: 'sandbox' });
  assert.equal(credited.credited, true);
  assert.equal(duplicateCredit.credited, false);
  assert.equal((await wallet(101)).available, '700.00');

  const offerListing = await createListing({
    sellerId: 202,
    sellerRole: 'trader',
    title: 'Mirage Dagger +8',
    server: 'ZERO',
    description: 'Rehearsal offer listing',
    price: 400,
  });
  const offer = await createOrUpdateOffer({ listingId: offerListing.id, buyerId: 101, amount: 350 });
  const offerAcceptance = await acceptOffer({
    offerId: offer.id,
    sellerId: 202,
    idempotencyKey: 'rehearsal:offer:accept:1',
  });
  const offerOrder = offerAcceptance.order;
  assert.equal(offerOrder.amount, 350);
  assert.equal(offerOrder.commissionAmount, 17.5);
  await releaseEscrow(offerOrder.id);

  const directListing = await createListing({
    sellerId: 202,
    sellerRole: 'trader',
    title: 'Raptor +8',
    server: 'ZERO',
    description: 'Rehearsal direct purchase listing',
    price: 120,
  });
  const directOrder = await purchaseListing({
    buyerId: 404,
    listingId: directListing.id,
    idempotencyKey: 'rehearsal:direct:purchase:1',
  });
  assert.equal(directOrder.commissionAmount, 6);
  await releaseEscrow(directOrder.id);

  const swapOffered = await createListing({
    sellerId: 303,
    sellerRole: 'user',
    title: 'Iron Bow +8',
    server: 'ZERO',
    description: 'Rehearsal swap offered item',
    price: 200,
  });
  const swapRequested = await createListing({
    sellerId: 202,
    sellerRole: 'trader',
    title: 'Shard +8',
    server: 'ZERO',
    description: 'Rehearsal swap requested item',
    price: 210,
  });
  const swap = await createSwapRequest({
    proposerId: 303,
    offeredListingId: swapOffered.id,
    requestedListingId: swapRequested.id,
  });
  await acceptSwap({ swapId: swap.id, recipientId: 202 });
  await confirmSwapReceipt({ swapId: swap.id, userId: 303 });
  const completedSwap = await confirmSwapReceipt({ swapId: swap.id, userId: 202 });
  assert.equal(completedSwap.status, 'completed');

  const listingStates = await pool.query(
    'select id::text,status from listings where id=any($1::bigint[]) order by id',
    [[swapOffered.id, swapRequested.id]],
  );
  assert.deepEqual(listingStates.rows.map((row) => row.status), ['swapped', 'swapped']);

  const commission = await pool.query('select coalesce(sum(amount),0)::text as total,count(*)::int as count from commissions');
  assert.equal(commission.rows[0].total, '23.50');
  assert.equal(commission.rows[0].count, 2);
  assert.deepEqual(await wallet(101), { available: '350.00', held: '0.00' });
  assert.deepEqual(await wallet(404), { available: '380.00', held: '0.00' });
  assert.deepEqual(await wallet(202), { available: '446.50', held: '0.00' });

  const summary = {
    migrations: migrations.length,
    compatibility: Object.fromEntries(Object.entries(compatibility).map(([name, status]) => [name, status.ready])),
    catalogProbe: 'IB8 -> Iron Bow +8',
    deposit: { firstCredit: credited.credited, duplicateCredit: duplicateCredit.credited },
    offerOrder: offerOrder.id,
    directOrder: directOrder.id,
    swap: completedSwap.id,
    commissions: commission.rows[0],
  };
  console.log('[rehearsal] PASS', JSON.stringify(summary));
}

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error('[rehearsal] FAIL', error);
    await pool.end().catch(() => {});
    process.exitCode = 1;
  });
