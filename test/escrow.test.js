import test from 'node:test';
import assert from 'node:assert/strict';
import { ESCROW_STATES, assertEscrowTransition, buildEscrowSettlement, buildRefundPlan, buildReleasePlan } from '../src/escrow.js';

test('settlement keeps gross invariant', () => {
  const result = buildEscrowSettlement(100, 0.05);
  assert.equal(result.buyerDebit, 100);
  assert.equal(result.platformCredit, 5);
  assert.equal(result.sellerCredit, 95);
  assert.equal(result.platformCredit + result.sellerCredit, result.buyerDebit);
});

test('release plan moves held to released', () => {
  const plan = buildReleasePlan({ amount: 250.5, commissionRate: 0.04, buyerId: 1, sellerId: 2, orderId: 3 });
  assert.equal(plan.fromState, ESCROW_STATES.HELD);
  assert.equal(plan.toState, ESCROW_STATES.RELEASED);
  assert.equal(plan.platformCredit + plan.sellerCredit, plan.buyerDebit);
});

test('refund returns full held amount to buyer', () => {
  const plan = buildRefundPlan({ amount: 75.25, buyerId: 1, sellerId: 2, orderId: 3 });
  assert.equal(plan.toState, ESCROW_STATES.REFUNDED);
  assert.equal(plan.buyerCredit, 75.25);
  assert.equal(plan.sellerCredit, 0);
  assert.equal(plan.platformCredit, 0);
});

test('released escrow cannot be released twice', () => {
  assert.throws(() => assertEscrowTransition(ESCROW_STATES.RELEASED, ESCROW_STATES.RELEASED));
});
