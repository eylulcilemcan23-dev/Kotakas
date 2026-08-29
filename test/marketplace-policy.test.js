import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import {
  assertListingContentSafe,
  commissionRateForSellerRole,
  externalContactType,
  monthlyListingLimitForRole,
} from '../src/marketplace-policy.js';

test('listing policy blocks external contact channels but allows normal item text', () => {
  assert.equal(externalContactType('Mirage Dagger +8 temiz item'), null);
  assert.equal(externalContactType('whatsapp 0532 123 45 67'), 'social');
  assert.equal(externalContactType('instagram @satici'), 'social');
  assert.throws(() => assertListingContentSafe({ title: 'Raptor +8', description: 'www.ornek.com yaz' }), /external contact info not allowed/);
  assert.equal(assertListingContentSafe({ title: 'Raptor +8', description: 'Teslimat 15 dakika' }), true);
});

test('marketplace commission is trader-only and normal users get one monthly listing', () => {
  const oldRate = config.traderCommissionRate;
  const oldLimit = config.normalUserMonthlyListingLimit;
  config.traderCommissionRate = 0.07;
  config.normalUserMonthlyListingLimit = 1;
  try {
    assert.equal(commissionRateForSellerRole('trader'), 0.07);
    assert.equal(commissionRateForSellerRole('user'), 0);
    assert.equal(commissionRateForSellerRole('admin_full'), 0);
    assert.equal(monthlyListingLimitForRole('user'), 1);
    assert.equal(monthlyListingLimitForRole('trader'), null);
  } finally {
    config.traderCommissionRate = oldRate;
    config.normalUserMonthlyListingLimit = oldLimit;
  }
});
