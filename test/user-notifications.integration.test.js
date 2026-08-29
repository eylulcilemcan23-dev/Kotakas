import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { pool } from '../src/db.js';
import {
  createUserNotification,
  detectUserNotificationCompatibility,
  listUserNotifications,
  markAllUserNotificationsRead,
  markUserNotificationRead,
} from '../src/dispute-communications.js';

const dbReady = Boolean(process.env.DATABASE_URL && pool);

async function resetSchema() {
  await pool.query('drop table if exists user_notifications cascade');
  await pool.query(`
    create table user_notifications (
      id bigserial primary key,
      user_id bigint not null,
      kind text not null,
      title text not null,
      body text not null,
      target_type text not null default 'system',
      target_id text,
      dedupe_key text,
      created_by bigint,
      created_at timestamptz not null default now(),
      read_at timestamptz
    );
    create unique index user_notifications_dedupe_idx
      on user_notifications(user_id, dedupe_key)
      where dedupe_key is not null;
  `);
  await detectUserNotificationCompatibility({ force: true });
}

function enableWrites() {
  const before = config.communicationWritesEnabled;
  config.communicationWritesEnabled = true;
  return () => { config.communicationWritesEnabled = before; };
}

test('persistent user notifications are isolated, deduplicated and readable', { skip: !dbReady }, async () => {
  await resetSchema();
  const restore = enableWrites();
  try {
    const status = await detectUserNotificationCompatibility({ force: true });
    assert.equal(status.ready, true);

    const first = await createUserNotification({
      userId: 101,
      kind: 'sale_completed',
      title: 'Satış tamamlandı',
      body: 'Net tutar bakiyene aktarıldı.',
      targetType: 'order',
      targetId: 55,
      dedupeKey: 'order-55-seller',
      createdBy: 202,
    });
    const duplicate = await createUserNotification({
      userId: 101,
      kind: 'sale_completed',
      title: 'Satış tamamlandı',
      body: 'Net tutar bakiyene aktarıldı.',
      targetType: 'order',
      targetId: 55,
      dedupeKey: 'order-55-seller',
      createdBy: 202,
    });

    assert.equal(first.id, duplicate.id);
    const mine = await listUserNotifications(101);
    assert.equal(mine.unreadCount, 1);
    assert.equal(mine.notifications.length, 1);
    assert.equal(mine.notifications[0].targetId, '55');

    const other = await listUserNotifications(202);
    assert.equal(other.notifications.length, 0);

    await assert.rejects(
      markUserNotificationRead({ notificationId: first.id, userId: 202 }),
      /notification not found/,
    );

    const read = await markUserNotificationRead({ notificationId: first.id, userId: 101 });
    assert.equal(read.unread, false);

    await createUserNotification({
      userId: 101,
      kind: 'admin_dispute_message',
      title: 'Yönetimden mesaj',
      body: 'İhtilafın için yeni cevap var.',
      targetType: 'dispute',
      targetId: 77,
      dedupeKey: 'message-77',
      createdBy: 999,
    });
    const beforeAll = await listUserNotifications(101);
    assert.equal(beforeAll.unreadCount, 1);

    const all = await markAllUserNotificationsRead(101);
    assert.equal(all.updated, 1);
    const afterAll = await listUserNotifications(101);
    assert.equal(afterAll.unreadCount, 0);
  } finally {
    restore();
    await pool.query('drop table if exists user_notifications cascade');
  }
});
