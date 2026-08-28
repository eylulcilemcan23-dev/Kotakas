import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, PERMISSIONS, hasPermission, normalizeRole } from '../src/roles.js';

test('limited admin cannot access finance or admin management', () => {
  assert.equal(hasPermission(ROLES.LIMITED, PERMISSIONS.MEMBERS), true);
  assert.equal(hasPermission(ROLES.LIMITED, PERMISSIONS.FINANCE), false);
  assert.equal(hasPermission(ROLES.LIMITED, PERMISSIONS.ADMIN_MANAGEMENT), false);
});

test('owner and full admin can access sensitive permissions', () => {
  assert.equal(hasPermission(ROLES.OWNER, PERMISSIONS.FINANCE), true);
  assert.equal(hasPermission(ROLES.ADMIN, PERMISSIONS.SECURITY), true);
});

test('legacy admin normalizes to full admin', () => {
  assert.equal(normalizeRole('admin'), ROLES.ADMIN);
});
