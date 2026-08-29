import test from 'node:test';
import assert from 'node:assert/strict';
import {
  READY_SELLER_QUESTIONS,
  READY_SELLER_ANSWERS,
  canSendSellerQuestion,
  canSendSellerAnswer
} from '../src/domain/marketplace-policy.js';

test('prepared seller questions are accepted', () => {
  for (const question of READY_SELLER_QUESTIONS) {
    assert.equal(canSendSellerQuestion(question).ok, true);
  }
});

test('free-form seller questions are rejected', () => {
  assert.equal(canSendSellerQuestion('Numaranı ver WhatsApp üzerinden konuşalım').ok, false);
  assert.equal(canSendSellerQuestion('Bana özel mesaj atar mısın?').ok, false);
});

test('prepared seller answers are accepted', () => {
  for (const answer of READY_SELLER_ANSWERS) {
    assert.equal(canSendSellerAnswer(answer).ok, true);
  }
});

test('free-form seller answers are rejected', () => {
  assert.equal(canSendSellerAnswer('Instagramdan yaz, daha ucuza bırakırım').ok, false);
  assert.equal(canSendSellerAnswer('0532 123 45 67').ok, false);
});
