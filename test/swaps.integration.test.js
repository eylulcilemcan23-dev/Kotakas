import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { pool } from '../src/db.js';
import {
  acceptSwap,
  confirmSwapReceipt,
  createSwapRequest,
  detectSwapCompatibility,
  listMySwaps,
  reportSwapProblem,
  resolveSwapDispute,
} from '../src/swaps-api.js';

const dbReady = Boolean(process.env.DATABASE_URL && pool);

async function resetSchema() {
  await pool.query('drop table if exists swap_disputes, swap_requests, listing_offers, listings cascade');
  await pool.query(`
    create table listings (
      id bigserial primary key,
      seller_id bigint not null,
      title text not null,
      server text not null,
      description text,
      price numeric(18,2) not null,
      status text not null check (status in ('active','reserved','sold','cancelled','swapped')),
      order_id bigint,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table listing_offers (
      id bigserial primary key,
      listing_id bigint not null references listings(id),
      offered_by bigint not null,
      amount numeric(18,2) not null,
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
    create table swap_disputes (
      id bigserial primary key,
      swap_id bigint not null references swap_requests(id),
      opened_by bigint not null,
      reason text not null,
      status text not null,
      resolution text,
      resolved_by bigint,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      resolved_at timestamptz
    );
  `);
  await detectSwapCompatibility({ force: true });
}

async function addListing(sellerId, title, server = 'ZERO', price = 100) {
  const result = await pool.query(`
    insert into listings (seller_id,title,server,description,price,status,order_id,created_at,updated_at)
    values ($1,$2,$3,null,$4,'active',null,now(),now()) returning id
  `, [sellerId, title, server, price]);
  return String(result.rows[0].id);
}

async function status(id) {
  const result = await pool.query('select status from listings where id=$1', [id]);
  return result.rows[0]?.status;
}

function enableWrites() {
  const before = { market: config.marketWritesEnabled, swap: config.swapWritesEnabled, communication: config.communicationWritesEnabled, audit: config.auditLogEnabled };
  config.marketWritesEnabled = true;
  config.swapWritesEnabled = true;
  config.communicationWritesEnabled = false;
  config.auditLogEnabled = false;
  return () => Object.assign(config, {
    marketWritesEnabled: before.market,
    swapWritesEnabled: before.swap,
    communicationWritesEnabled: before.communication,
    auditLogEnabled: before.audit,
  });
}

test('accepted swap reserves both listings and completes only after both receipt confirmations', { skip: !dbReady }, async () => {
  await resetSchema();
  const restore = enableWrites();
  try {
    const a = await addListing(101, 'Mirage Dagger +8');
    const b = await addListing(202, 'Iron Bow +9');
    const created = await createSwapRequest({ proposerId: 101, offeredListingId: a, requestedListingId: b });
    assert.equal(created.status, 'pending');
    const accepted = await acceptSwap({ swapId: created.id, recipientId: 202 });
    assert.equal(accepted.status, 'active');
    assert.equal(await status(a), 'reserved');
    assert.equal(await status(b), 'reserved');

    const first = await confirmSwapReceipt({ swapId: created.id, userId: 101 });
    assert.equal(first.status, 'active');
    assert.ok(first.myReceivedAt);
    assert.equal(await status(a), 'reserved');

    const second = await confirmSwapReceipt({ swapId: created.id, userId: 202 });
    assert.equal(second.status, 'completed');
    assert.equal(await status(a), 'swapped');
    assert.equal(await status(b), 'swapped');
  } finally {
    restore();
    await pool.query('drop table if exists swap_disputes, swap_requests, listing_offers, listings cascade');
  }
});

test('same server and ownership are enforced and competing accepted swaps cannot reuse a locked listing', { skip: !dbReady }, async () => {
  await resetSchema();
  const restore = enableWrites();
  try {
    const a = await addListing(101, 'A');
    const b = await addListing(202, 'B');
    const c = await addListing(303, 'C');
    const wrongServer = await addListing(404, 'D', 'FELIS');
    await assert.rejects(createSwapRequest({ proposerId: 101, offeredListingId: a, requestedListingId: wrongServer }), /server mismatch/);
    await assert.rejects(createSwapRequest({ proposerId: 999, offeredListingId: a, requestedListingId: b }), /forbidden offered listing/);

    const first = await createSwapRequest({ proposerId: 101, offeredListingId: a, requestedListingId: b });
    const second = await createSwapRequest({ proposerId: 303, offeredListingId: c, requestedListingId: b });
    await acceptSwap({ swapId: first.id, recipientId: 202 });
    await assert.rejects(acceptSwap({ swapId: second.id, recipientId: 202 }), /not available/);
  } finally {
    restore();
    await pool.query('drop table if exists swap_disputes, swap_requests, listing_offers, listings cascade');
  }
});

test('swap dispute keeps listings locked until admin resolution and cancel reactivates both', { skip: !dbReady }, async () => {
  await resetSchema();
  const restore = enableWrites();
  try {
    const a = await addListing(101, 'Raptor +8');
    const b = await addListing(202, 'Shard +8');
    const created = await createSwapRequest({ proposerId: 101, offeredListingId: a, requestedListingId: b });
    await acceptSwap({ swapId: created.id, recipientId: 202 });
    const disputed = await reportSwapProblem({ swapId: created.id, userId: 101, reason: 'Karşı item henüz hesabıma teslim edilmedi.' });
    assert.equal(disputed.status, 'disputed');
    assert.equal(await status(a), 'reserved');
    assert.equal(await status(b), 'reserved');
    await assert.rejects(confirmSwapReceipt({ swapId: created.id, userId: 202 }), /not confirmable/);

    const resolved = await resolveSwapDispute({ swapId: created.id, adminId: 900, adminRole: 'admin_full', resolution: 'cancel' });
    assert.equal(resolved.status, 'cancelled');
    assert.equal(await status(a), 'active');
    assert.equal(await status(b), 'active');
    const mine = await listMySwaps(101);
    assert.equal(mine[0].status, 'cancelled');
  } finally {
    restore();
    await pool.query('drop table if exists swap_disputes, swap_requests, listing_offers, listings cascade');
  }
});
