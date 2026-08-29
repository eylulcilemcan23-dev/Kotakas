import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLES } from '../src/auth/roles.js';
import {
  READY_SELLER_QUESTIONS,
  canSendSellerQuestion,
  containsExternalContact,
  userCanPublishFree,
  calculateCommission
} from '../src/domain/marketplace-policy.js';

test('normal user gets one free listing per month', () => {
  assert.equal(userCanPublishFree({ role: ROLES.USER, publishedThisMonth: 0 }), true);
  assert.equal(userCanPublishFree({ role: ROLES.USER, publishedThisMonth: 1 }), false);
  assert.equal(userCanPublishFree({ role: ROLES.TRADER, publishedThisMonth: 0 }), false);
});

test('free-form seller chat is blocked but ready questions pass', () => {
  assert.equal(canSendSellerQuestion(READY_SELLER_QUESTIONS[0]).ok, true);
  assert.equal(canSendSellerQuestion('WhatsApp ver konuşalım').ok, false);
  assert.equal(canSendSellerQuestion('Başka bir şey soracağım').ok, false);
});

test('external contact details are detected', () => {
  assert.equal(containsExternalContact('instagram @ornekhesap'), true);
  assert.equal(containsExternalContact('0532 123 45 67'), true);
  assert.equal(containsExternalContact('Ürün hâlâ satılık mı?'), false);
});

test('commission differs for user and trader', () => {
  assert.deepEqual(
    calculateCommission({ role: ROLES.USER, grossAmount: 100, normalRate: 4, traderRate: 3 }),
    { gross: 100, rate: 4, fee: 4, net: 96 }
  );
  assert.deepEqual(
    calculateCommission({ role: ROLES.TRADER, grossAmount: 100, normalRate: 4, traderRate: 3 }),
    { gross: 100, rate: 3, fee: 3, net: 97 }
  );
});
