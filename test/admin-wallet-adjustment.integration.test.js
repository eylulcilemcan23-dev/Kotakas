import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { detectUserSchema } from '../src/user-adapter.js';
import { adjustWalletBalance, detectAdminWalletCompatibility } from '../src/admin-wallet-api.js';

const dbReady = Boolean(process.env.DATABASE_URL && pool);

async function resetSchema() {
  await pool.query('drop table if exists admin_wallet_adjustments, wallets, users cascade');
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
      available_balance numeric(18,2) not null default 0,
      held_balance numeric(18,2) not null default 0,
      updated_at timestamptz not null default now()
    );
    create table admin_wallet_adjustments (
      id bigserial primary key,
      actor_id bigint not null,
      actor_role text not null,
      user_id bigint not null,
      amount numeric(18,2) not null,
      reason text not null,
      created_at timestamptz not null default now()
    );
    insert into users (id,email,password_hash,role,name) values
      (10,'owner@test.local','$2b$10$abcdefghijklmnopqrstuuuuuuuuuuuuuuuuuuuuuuuuuuuu','admin_owner','Owner'),
      (20,'user@test.local','$2b$10$abcdefghijklmnopqrstuuuuuuuuuuuuuuuuuuuuuuuuuuuu','user','User');
  `);
  await detectUserSchema({ force: true });
  await detectAdminWalletCompatibility({ force: true });
}

test('finance admin wallet adjustment credits and debits with a permanent ledger', { skip: !dbReady }, async () => {
  await resetSchema();
  const oldFinance = config.financeWritesEnabled;
  const oldAudit = config.auditLogEnabled;
  config.financeWritesEnabled = true;
  config.auditLogEnabled = false;
  try {
    const credit = await adjustWalletBalance({ actorId: 10, actorRole: 'admin_owner', target: 'user@test.local', direction: 'credit', amount: 500, reason: 'Havale bakiye yüklemesi' });
    assert.equal(credit.availableBalance, 500);
    const debit = await adjustWalletBalance({ actorId: 10, actorRole: 'admin_owner', target: '20', direction: 'debit', amount: 125, reason: 'Manuel bakiye düzeltmesi' });
    assert.equal(debit.availableBalance, 375);
    const ledger = await pool.query('select amount::text as amount from admin_wallet_adjustments order by id');
    assert.deepEqual(ledger.rows.map((row) => row.amount), ['500.00','-125.00']);
    await assert.rejects(adjustWalletBalance({ actorId: 10, actorRole: 'admin_owner', target: '20', direction: 'debit', amount: 500, reason: 'Fazla düşüm denemesi' }), /insufficient available balance/);
  } finally {
    config.financeWritesEnabled = oldFinance;
    config.auditLogEnabled = oldAudit;
    await pool.query('drop table if exists admin_wallet_adjustments, wallets, users cascade');
  }
});
