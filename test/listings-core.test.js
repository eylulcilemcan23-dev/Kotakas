import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLES } from '../src/auth/roles.js';
import { getPublicationDecision, validateListingInput } from '../src/listings/core.js';

test('normal user first listing is free and second requires payment', () => {
  assert.deepEqual(
    getPublicationDecision({ role: ROLES.USER, publishedThisMonth: 0 }),
    { allowed: true, publicationType: 'free', requiresPayment: false, freeRemaining: 0 }
  );

  assert.deepEqual(
    getPublicationDecision({ role: ROLES.USER, publishedThisMonth: 1 }),
    {
      allowed: false,
      publicationType: 'paid',
      requiresPayment: true,
      freeRemaining: 0,
      error: 'paid_listing_required'
    }
  );
});

test('trader listing does not consume normal-user free quota', () => {
  assert.deepEqual(
    getPublicationDecision({ role: ROLES.TRADER, publishedThisMonth: 50 }),
    { allowed: true, publicationType: 'trader', requiresPayment: false, freeRemaining: null }
  );
});

test('listing text blocks outside contact information', () => {
  const result = validateListingInput({
    serverCode: 'ZERO',
    itemName: 'Iron Bow +8',
    category: 'Weapon',
    description: 'WhatsApp 0532 123 45 67',
    priceGb: 30
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'external_contact_blocked');
});

test('normal listing input is accepted and server code normalized', () => {
  const result = validateListingInput({
    serverCode: 'zero',
    itemName: 'Iron Bow +8',
    category: 'Weapon',
    description: 'Temiz item, teklif değerlendirilebilir.',
    priceGb: 30.25
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.serverCode, 'ZERO');
  assert.equal(result.value.priceGb, 30.25);
});
