import test from 'node:test';
import assert from 'node:assert/strict';
import { safeStateEqual } from '../src/google-auth.js';

test('safeStateEqual accepts same non-empty state', () => {
  assert.equal(safeStateEqual('abc123', 'abc123'), true);
});

test('safeStateEqual rejects different or empty state', () => {
  assert.equal(safeStateEqual('abc123', 'abc124'), false);
  assert.equal(safeStateEqual('', ''), false);
  assert.equal(safeStateEqual(null, 'abc'), false);
});
