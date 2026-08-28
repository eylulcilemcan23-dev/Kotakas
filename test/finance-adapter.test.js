import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCommission } from '../src/finance-adapter.js';

test('commission is deducted from seller net', () => {
  const result = calculateCommission(1000, 0.05);
  assert.deepEqual(result, { gross: 1000, commission: 50, sellerNet: 950 });
});

test('commission calculation rejects invalid rate', () => {
  assert.throws(() => calculateCommission(100, 1.5), /invalid rate/);
});
