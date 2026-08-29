import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAdminLimit, normalizeOrderState } from '../src/admin-finance-api.js';

test('admin finance limit is clamped safely', () => {
  assert.equal(normalizeAdminLimit(undefined), 30);
  assert.equal(normalizeAdminLimit('0'), 1);
  assert.equal(normalizeAdminLimit('25'), 25);
  assert.equal(normalizeAdminLimit('999'), 100);
  assert.equal(normalizeAdminLimit('abc'), 30);
});

test('admin finance order state accepts only escrow states', () => {
  assert.equal(normalizeOrderState('held'), 'held');
  assert.equal(normalizeOrderState('RELEASED'), 'released');
  assert.equal(normalizeOrderState(' refunded '), 'refunded');
  assert.equal(normalizeOrderState('cancelled'), '');
  assert.equal(normalizeOrderState(undefined), '');
});
