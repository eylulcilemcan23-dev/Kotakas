import test from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSIONS, ROLES } from '../src/roles.js';
import { isAdminRole, roleCan } from '../src/authz.js';

test('limited admin remains admin but cannot reach sensitive finance', () => {
  assert.equal(isAdminRole(ROLES.LIMITED), true);
  assert.equal(roleCan(ROLES.LIMITED, PERMISSIONS.MEMBERS), true);
  assert.equal(roleCan(ROLES.LIMITED, PERMISSIONS.WALLET), false);
  assert.equal(roleCan(ROLES.LIMITED, PERMISSIONS.COMMISSION), false);
  assert.equal(roleCan(ROLES.LIMITED, PERMISSIONS.SECURITY), false);
});

test('owner and full admin can reach sensitive finance', () => {
  assert.equal(roleCan(ROLES.OWNER, PERMISSIONS.WALLET), true);
  assert.equal(roleCan(ROLES.ADMIN, PERMISSIONS.COMMISSION), true);
});

test('normal user and trader are not admin roles', () => {
  assert.equal(isAdminRole(ROLES.USER), false);
  assert.equal(isAdminRole(ROLES.TRADER), false);
});
