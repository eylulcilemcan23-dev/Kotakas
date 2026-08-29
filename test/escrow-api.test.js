import test from 'node:test';
import assert from 'node:assert/strict';
import { canReleaseEscrow } from '../src/escrow-api.js';
import { ROLES } from '../src/roles.js';

const order = { buyer_id: '101', seller_id: '202' };

test('buyer can confirm delivery and release escrow', () => {
  assert.equal(canReleaseEscrow({ id: '101', role: ROLES.USER }, order), true);
});

test('seller cannot release own sale escrow', () => {
  assert.equal(canReleaseEscrow({ id: '202', role: ROLES.TRADER }, order), false);
});

test('unrelated user cannot release escrow', () => {
  assert.equal(canReleaseEscrow({ id: '303', role: ROLES.USER }, order), false);
});

test('finance admin can release escrow for dispute resolution', () => {
  assert.equal(canReleaseEscrow({ id: '999', role: ROLES.ADMIN }, order), true);
  assert.equal(canReleaseEscrow({ id: '998', role: ROLES.OWNER }, order), true);
});

test('limited admin cannot release financial escrow', () => {
  assert.equal(canReleaseEscrow({ id: '997', role: ROLES.LIMITED }, order), false);
});
