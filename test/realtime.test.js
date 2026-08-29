import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSocketToken, socketRoomsForUser } from '../src/realtime.js';

test('socket token prefers auth token then session cookie', () => {
  assert.equal(extractSocketToken({ auth: { token: 'abc' }, headers: { cookie: 'kotakas_session=def' } }), 'abc');
  assert.equal(extractSocketToken({ auth: {}, headers: { cookie: 'x=1; kotakas_session=hello%20world; y=2' } }), 'hello world');
  assert.equal(extractSocketToken({ headers: {} }), null);
});

test('socket rooms separate user and admin capabilities', () => {
  assert.deepEqual(socketRoomsForUser({ id: '42', role: 'user' }), ['user:42']);
  assert.deepEqual(socketRoomsForUser({ id: '43', role: 'admin_limited' }), ['user:43', 'admin:disputes']);
  assert.deepEqual(socketRoomsForUser({ id: '44', role: 'admin_full' }), ['user:44', 'admin:disputes', 'admin:finance', 'admin:security']);
  assert.deepEqual(socketRoomsForUser({ id: 'not-numeric', role: 'admin_full' }), []);
});
