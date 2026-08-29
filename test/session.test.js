import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken, sanitizeSessionUser, verifySessionToken } from '../src/session.js';

test('session token preserves normalized public user', () => {
  const secret = 'test-secret-only';
  const token = createSessionToken({ id: 42, email: 'a@example.com', name: 'A', role: 'admin' }, secret);
  const user = verifySessionToken(token, secret);
  assert.equal(user.id, '42');
  assert.equal(user.email, 'a@example.com');
  assert.equal(user.name, 'A');
  assert.equal(user.role, 'admin_full');
});

test('invalid session token is rejected', () => {
  assert.equal(verifySessionToken('not-a-token', 'test-secret-only'), null);
});

test('public user does not expose password fields', () => {
  const user = sanitizeSessionUser({ id: 1, email: 'x@y.z', role: 'user', password_hash: 'hidden' });
  assert.deepEqual(user, { id: 1, email: 'x@y.z', name: null, role: 'user' });
});
