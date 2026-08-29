import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pool } from '../src/db.js';

const dbReady = Boolean(process.env.DATABASE_URL && pool);
const migrationUrl = new URL('../migrations/006_notification_preferences.sql', import.meta.url);

async function cleanup() {
  await pool.query('drop table if exists user_notifications cascade');
  await pool.query('drop table if exists user_notification_preferences cascade');
  await pool.query('drop function if exists kotakas_user_notification_preference_filter() cascade');
}

async function setup() {
  await cleanup();
  await pool.query(`
    create table user_notifications (
      id bigserial primary key,
      user_id bigint not null,
      kind text not null,
      title text,
      body text,
      created_at timestamptz not null default now()
    )
  `);
  const sql = await readFile(migrationUrl, 'utf8');
  await pool.query(sql);
}

test('notification preferences suppress optional categories but never finance/security', { skip: !dbReady }, async () => {
  await setup();
  try {
    await pool.query(`
      insert into user_notification_preferences
        (user_id,messages_enabled,market_enabled,disputes_enabled,system_enabled)
      values (7,false,false,false,false)
    `);

    const optionalKinds = ['dispute_message', 'listing_offer', 'dispute_opened', 'system_news'];
    for (const kind of optionalKinds) {
      const result = await pool.query('insert into user_notifications (user_id,kind,title) values (7,$1,$2) returning id', [kind, kind]);
      assert.equal(result.rowCount, 0, `${kind} should be suppressed`);
    }

    const criticalKinds = ['dispute_resolved', 'wallet_balance_changed', 'security_login_alert'];
    for (const kind of criticalKinds) {
      const result = await pool.query('insert into user_notifications (user_id,kind,title) values (7,$1,$2) returning id', [kind, kind]);
      assert.equal(result.rowCount, 1, `${kind} should always be delivered`);
    }

    const count = await pool.query('select count(*)::int as count from user_notifications where user_id = 7');
    assert.equal(count.rows[0].count, 3);
  } finally {
    await cleanup();
  }
});

test('users without a preference row keep backward-compatible all-on delivery', { skip: !dbReady }, async () => {
  await setup();
  try {
    const result = await pool.query(`
      insert into user_notifications (user_id,kind,title)
      values (8,'dispute_message','message') returning id
    `);
    assert.equal(result.rowCount, 1);
  } finally {
    await cleanup();
  }
});
