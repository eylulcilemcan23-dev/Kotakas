import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLES } from '../src/auth/roles.js';
import { calculateSettlement, validateBalanceAdjustment } from '../src/finance/core.js';

test('normal user settlement uses normal commission', () => {
  assert.deepEqual(
    calculateSettlement({ sellerRole: ROLES.USER, grossAmount: 1000, normalRate: 4, traderRate: 3 }),
    { gross: 1000, commissionRate: 4, commission: 40, sellerNet: 960 }
  );
});

test('trader settlement uses trader commission', () => {
  assert.deepEqual(
    calculateSettlement({ sellerRole: ROLES.TRADER, grossAmount: 1000, normalRate: 4, traderRate: 3 }),
    { gross: 1000, commissionRate: 3, commission: 30, sellerNet: 970 }
  );
});

test('balance adjustment rejects zero and accepts add/remove', () => {
  assert.throws(() => validateBalanceAdjustment(0), /zero_adjustment_not_allowed/);
  assert.equal(validateBalanceAdjustment(250.55), 250.55);
  assert.equal(validateBalanceAdjustment(-25.25), -25.25);
});
