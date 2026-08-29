import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { pool } from '../src/db.js';
import { detectFinanceWriteCompatibility } from '../src/finance-write-adapter.js';
import { detectAuditCompatibility, listAuditLogs } from '../src/audit-log.js';
import {
  detectDisputeCompatibility,
  hasOpenDispute,
  openDispute,
  resolveDispute,
} from '../src/disputes-api.js';

const dbReady = Boolean(process.env.DATABASE_URL && pool);

async function resetSchema() {
  await pool.query('drop table if exists audit_logs, disputes, commissions, wallet_transactions, orders, listings, wallets cascade');
  await pool.query(`
    create table wallets (
      user_id bigint primary key,
      available_balance numeric(18,2) not null default 0 check (available_balance >= 0),
      held_balance numeric(18,2) not null default 0 check (held_balance >= 0),
      updated_at timestamptz not null default now()
    );
    create table orders (
      id bigserial primary key,
      buyer_id bigint not null,
      seller_id bigint not null,
      amount numeric(18,2) not null,
      commission_rate numeric(8,6) not null,
      commission_amount numeric(18,2) not null,
      seller_net numeric(18,2) not null,
      escrow_state text not null,
      idempotency_key text not null unique,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
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
      amount numeric(18,2) not null,
      rate numeric(8,6) not null,
      created_at timestamptz not null default now()
    );
    create table disputes (
      id bigserial primary key,
      order_id bigint not null references orders(id),
      opened_by bigint not null,
      reason text not null,
      status text not null,
      resolution text,
      resolved_by bigint,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      resolved_at timestamptz
    );
    create unique index disputes_one_open_per_order on disputes(order_id) where status = 'open';
    create table audit_logs (
      id bigserial primary key,
      actor_id bigint,
      actor_role text,
      action text not null,
      target_type text not null,
      target_id text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
    insert into wallets (user_id, available_balance, held_balance) values (101,100,100),(202,0,0);
    insert into orders (buyer_id,seller_id,amount,commission_rate,commission_amount,seller_net,escrow_state,idempotency_key)
    values (101,202,100,0.05,5,95,'held','dispute-order-1');
  `);
  await detectFinanceWriteCompatibility({ force: true });
  await detectDisputeCompatibility({ force: true });
  await detectAuditCompatibility({ force: true });
}

function enableFeatures() {
  const before = {
    finance: config.financeWritesEnabled,
    dispute: config.disputeWritesEnabled,
    audit: config.auditLogEnabled,
  };
  config.financeWritesEnabled = true;
  config.disputeWritesEnabled = true;
  config.auditLogEnabled = true;
  return () => {
    config.financeWritesEnabled = before.finance;
    config.disputeWritesEnabled = before.dispute;
    config.auditLogEnabled = before.audit;
  };
}

test('participant opens dispute and admin refund resolves it with audit log', { skip: !dbReady }, async () => {
  await resetSchema();
  const restore = enableFeatures();
  try {
    const dispute = await openDispute({ orderId: 1, openedBy: 101, reason: 'Ürün teslim edilmedi ve satıcı cevap vermiyor.' });
    assert.equal(dispute.status, 'open');
    assert.equal(await hasOpenDispute(1), true);

    await assert.rejects(
      openDispute({ orderId: 1, openedBy: 202, reason: 'Aynı işlem için ikinci açık ihtilaf denemesi.' }),
      /already open/,
    );

    const resolved = await resolveDispute({ disputeId: dispute.id, adminId: 999, adminRole: 'admin_owner', resolution: 'refund' });
    assert.equal(resolved.status, 'resolved');
    assert.equal(resolved.resolution, 'refund');
    assert.equal(await hasOpenDispute(1), false);

    const wallet = await pool.query('select available_balance::text as available, held_balance::text as held from wallets where user_id=101');
    assert.deepEqual(wallet.rows[0], { available: '200.00', held: '0.00' });
    const order = await pool.query('select escrow_state from orders where id=1');
    assert.equal(order.rows[0].escrow_state, 'refunded');

    const logs = await listAuditLogs({ limit: 10 });
    assert.equal(logs.some((log) => log.action === 'dispute_refund' && log.targetId === dispute.id), true);
  } finally {
    restore();
    await pool.query('drop table if exists audit_logs, disputes, commissions, wallet_transactions, orders, listings, wallets cascade');
  }
});

test('non participant cannot open dispute', { skip: !dbReady }, async () => {
  await resetSchema();
  const restore = enableFeatures();
  try {
    await assert.rejects(
      openDispute({ orderId: 1, openedBy: 303, reason: 'Bu kişi işlem tarafı olmadığı halde ihtilaf açıyor.' }),
      /not order participant/,
    );
  } finally {
    restore();
    await pool.query('drop table if exists audit_logs, disputes, commissions, wallet_transactions, orders, listings, wallets cascade');
  }
});
