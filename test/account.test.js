import test from 'node:test';
import assert from 'node:assert/strict';
import { createPasswordResetToken, validatePassword, validateRegistrationInput, verifyPasswordResetToken } from '../src/account.js';

const TEST_SECRET = 'test-only-password-reset-secret-123456789';

test('registration input normalizes email and accepts strong enough password', () => {
  const result = validateRegistrationInput({
    email: '  User@Example.COM ',
    password: 'uzun-guvenli-123',
    name: ' Test User ',
  });
  assert.equal(result.ok, true);
  assert.equal(result.email, 'user@example.com');
  assert.equal(result.name, 'Test User');
});

test('registration rejects short password', () => {
  const result = validateRegistrationInput({ email: 'user@example.com', password: '12345' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'password_policy');
});

test('password policy accepts 10 to 128 characters', () => {
  assert.equal(validatePassword('1234567890').ok, true);
  assert.equal(validatePassword('123456789').ok, false);
  assert.equal(validatePassword('x'.repeat(129)).ok, false);
});

test('password reset token is purpose-bound and verifies email', () => {
  const token = createPasswordResetToken('User@Example.com', TEST_SECRET);
  const payload = verifyPasswordResetToken(token, TEST_SECRET);
  assert.deepEqual(payload, { email: 'user@example.com' });
});

test('password reset token rejects wrong secret', () => {
  const token = createPasswordResetToken('user@example.com', TEST_SECRET);
  assert.equal(verifyPasswordResetToken(token, 'another-test-secret-123456789'), null);
});
