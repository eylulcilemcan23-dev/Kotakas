import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { pool } from '../src/db.js';
import {
  addDisputeMessage,
  detectCommunicationCompatibility,
  listAdminNotifications,
  listDisputeMessages,
  markAdminNotificationRead,
} from '../src/dispute-communications.js';

const dbReady = Boolean(process.env.DATABASE_URL && pool);

async function resetSchema() {
  await pool.query('drop table if exists dispute_messages, admin_notifications, disputes, orders cascade');
  await pool.query(`
    create table orders (
      id bigserial primary key,
      buyer_id bigint not null,
      seller_id bigint not null,
      escrow_state text not null
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
    create table dispute_messages (
      id bigserial primary key,
      dispute_id bigint not null references disputes(id) on delete cascade,
      sender_id bigint not null,
      sender_role text not null,
      body text not null,
      created_at timestamptz not null default now()
    );
    create table admin_notifications (
      id bigserial primary key,
      kind text not null,
      title text not null,
      body text not null,
      target_type text not null,
      target_id text,
      created_by bigint,
      created_at timestamptz not null default now(),
      read_at timestamptz
    );
    insert into orders (id,buyer_id,seller_id,escrow_state) values (10,101,202,'held');
    insert into disputes (id,order_id,opened_by,reason,status) values (20,10,101,'Teslimat sorunu test aciklamasi','open');
  `);
  await detectCommunicationCompatibility({ force: true });
}

function enableWrites() {
  const before = config.communicationWritesEnabled;
  config.communicationWritesEnabled = true;
  return () => { config.communicationWritesEnabled = before; };
}

test('buyer message is stored and creates unread admin notification', { skip: !dbReady }, async () => {
  await resetSchema();
  const restore = enableWrites();
  try {
    const status = await detectCommunicationCompatibility({ force: true });
    assert.equal(status.ready, true);
    const message = await addDisputeMessage({ disputeId: 20, senderId: 101, senderRole: 'user', body: 'Item tarafima teslim edilmedi.' });
    assert.equal(message.disputeId, '20');
    const messages = await listDisputeMessages({ disputeId: 20, actorId: 202, actorRole: 'user' });
    assert.equal(messages.length, 1);
    assert.equal(messages[0].body, 'Item tarafima teslim edilmedi.');
    const notifications = await listAdminNotifications({ unreadOnly: true });
    assert.equal(notifications.unreadCount, 1);
    assert.equal(notifications.notifications[0].kind, 'dispute_message');
    const read = await markAdminNotificationRead(notifications.notifications[0].id);
    assert.equal(read.unread, false);
  } finally {
    restore();
    await pool.query('drop table if exists dispute_messages, admin_notifications, disputes, orders cascade');
  }
});

test('unrelated user cannot read or write dispute messages', { skip: !dbReady }, async () => {
  await resetSchema();
  const restore = enableWrites();
  try {
    await assert.rejects(
      listDisputeMessages({ disputeId: 20, actorId: 303, actorRole: 'user' }),
      /forbidden dispute access/,
    );
    await assert.rejects(
      addDisputeMessage({ disputeId: 20, senderId: 303, senderRole: 'user', body: 'Bu mesaja erisememeliyim.' }),
      /forbidden dispute access/,
    );
  } finally {
    restore();
    await pool.query('drop table if exists dispute_messages, admin_notifications, disputes, orders cascade');
  }
});

test('limited admin can participate in dispute conversation', { skip: !dbReady }, async () => {
  await resetSchema();
  const restore = enableWrites();
  try {
    const message = await addDisputeMessage({ disputeId: 20, senderId: 999, senderRole: 'admin_limited', body: 'Yonetim incelemesi baslatildi.' });
    assert.equal(message.senderRole, 'admin_limited');
    const messages = await listDisputeMessages({ disputeId: 20, actorId: 999, actorRole: 'admin_limited' });
    assert.equal(messages.length, 1);
    const notifications = await listAdminNotifications({ unreadOnly: true });
    assert.equal(notifications.unreadCount, 0);
  } finally {
    restore();
    await pool.query('drop table if exists dispute_messages, admin_notifications, disputes, orders cascade');
  }
});
