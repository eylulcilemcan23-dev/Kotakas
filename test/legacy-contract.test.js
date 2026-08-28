import test from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSIONS } from '../src/roles.js';
import { findLiveContract } from '../src/legacy-contract.js';

test('wallet and commission endpoints are sensitive', () => {
  assert.equal(findLiveContract('/api/admin/wallets')?.permission, PERMISSIONS.WALLET);
  assert.equal(findLiveContract('/api/admin/commissions')?.permission, PERMISSIONS.COMMISSION);
});

test('security and settings endpoints require sensitive permissions', () => {
  assert.equal(findLiveContract('/api/admin/security-events')?.permission, PERMISSIONS.SECURITY);
  assert.equal(findLiveContract('/api/admin/settings')?.permission, PERMISSIONS.PLATFORM_SETTINGS);
});

test('public market endpoints remain public', () => {
  assert.equal(findLiveContract('/api/listings')?.access, 'public');
  assert.equal(findLiveContract('/api/stats')?.access, 'public');
});
