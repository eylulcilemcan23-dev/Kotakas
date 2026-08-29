import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLES } from '../src/auth/roles.js';
import { canAccessPanel, landingPathForRole } from '../src/auth/panel-access.js';

test('each account type gets its own landing panel', () => {
  assert.equal(landingPathForRole(ROLES.USER), '/dashboard.html');
  assert.equal(landingPathForRole(ROLES.TRADER), '/trader.html');
  assert.equal(landingPathForRole(ROLES.ADMIN_OWNER), '/admin.html');
  assert.equal(landingPathForRole(ROLES.ADMIN_FULL), '/admin.html');
  assert.equal(landingPathForRole(ROLES.ADMIN_LIMITED), '/admin.html');
});

test('normal user cannot enter trader or admin panel', () => {
  assert.equal(canAccessPanel(ROLES.USER, 'user'), true);
  assert.equal(canAccessPanel(ROLES.USER, 'trader'), false);
  assert.equal(canAccessPanel(ROLES.USER, 'admin'), false);
});

test('trader cannot enter admin or user panel', () => {
  assert.equal(canAccessPanel(ROLES.TRADER, 'trader'), true);
  assert.equal(canAccessPanel(ROLES.TRADER, 'admin'), false);
  assert.equal(canAccessPanel(ROLES.TRADER, 'user'), false);
});

test('admins are restricted to admin panel', () => {
  assert.equal(canAccessPanel(ROLES.ADMIN_OWNER, 'admin'), true);
  assert.equal(canAccessPanel(ROLES.ADMIN_FULL, 'admin'), true);
  assert.equal(canAccessPanel(ROLES.ADMIN_LIMITED, 'admin'), true);
  assert.equal(canAccessPanel(ROLES.ADMIN_FULL, 'trader'), false);
  assert.equal(canAccessPanel(ROLES.ADMIN_FULL, 'user'), false);
});
