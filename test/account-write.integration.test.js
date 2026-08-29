import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { createLocalUser, detectAccountWriteCompatibility, updateUserPasswordByEmail } from '../src/account-write-adapter.js';
import { detectUserSchema, findUserByEmail, verifyUserPassword } from '../src/user-adapter.js';

const dbReady = Boolean(process.env.DATABASE_URL && pool);

test('account write adapter creates and updates a user against an isolated postgres schema', { skip: !dbReady }, async () => {
  await pool.query('drop table if exists users cascade');
  await pool.query(`
    create table users (
      id bigserial primary key,
      email text not null unique,
      password_hash text not null,
      role text not null default 'user',
      name text,
      created_at timestamptz not null default now()
    )
  `);

  try {
    await detectUserSchema({ force: true });
    const compatibility = await detectAccountWriteCompatibility({ force: true });
    assert.equal(compatibility.ready, true);
    assert.deepEqual(compatibility.blockers, []);

    const created = await createLocalUser({
      email: 'integration@example.com',
      password: 'integration-password-123',
      name: 'Integration User',
    });
    assert.equal(created.email, 'integration@example.com');
    assert.equal(created.role, 'user');

    const first = await findUserByEmail('integration@example.com');
    assert.equal(await verifyUserPassword(first, 'integration-password-123'), true);

    assert.equal(await updateUserPasswordByEmail('integration@example.com', 'new-integration-password-456'), true);
    const updated = await findUserByEmail('integration@example.com');
    assert.equal(await verifyUserPassword(updated, 'integration-password-123'), false);
    assert.equal(await verifyUserPassword(updated, 'new-integration-password-456'), true);
  } finally {
    await pool.query('drop table if exists users cascade');
  }
});

test('registration compatibility blocks unknown required columns', { skip: !dbReady }, async () => {
  await pool.query('drop table if exists users cascade');
  await pool.query(`
    create table users (
      id bigserial primary key,
      email text not null unique,
      password_hash text not null,
      required_legacy_code text not null
    )
  `);

  try {
    await detectUserSchema({ force: true });
    const compatibility = await detectAccountWriteCompatibility({ force: true });
    assert.equal(compatibility.ready, false);
    assert.equal(compatibility.blockers.includes('required:required_legacy_code'), true);
  } finally {
    await pool.query('drop table if exists users cascade');
  }
});
