import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_SERVERS, normalizeServer } from '../src/market-rates/repository.js';

test('supported Knight Online servers are normalized', () => {
  assert.deepEqual(SUPPORTED_SERVERS, ['ZERO', 'AGARTHA', 'PANDORA', 'FELIS']);
  assert.equal(normalizeServer(' zero '), 'ZERO');
  assert.equal(normalizeServer('Pandora'), 'PANDORA');
});

test('unsupported server is rejected', () => {
  assert.throws(() => normalizeServer('fake-server'), /unsupported_server/);
});
