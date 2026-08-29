import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTransactionLimit } from '../src/wallet-api.js';

test('wallet transaction limit is bounded safely', () => {
  assert.equal(normalizeTransactionLimit(undefined), 20);
  assert.equal(normalizeTransactionLimit('10'), 10);
  assert.equal(normalizeTransactionLimit('0'), 1);
  assert.equal(normalizeTransactionLimit('-5'), 1);
  assert.equal(normalizeTransactionLimit('500'), 50);
  assert.equal(normalizeTransactionLimit('abc'), 20);
});
