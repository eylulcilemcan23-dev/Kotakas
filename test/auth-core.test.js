import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmail, validateRegistrationInput } from '../src/auth/users.js';
import { createSessionToken, verifySessionToken } from '../src/auth/session.js';

test('email is normalized consistently', () => {
  assert.equal(normalizeEmail('  Test.User@Example.COM  '), 'test.user@example.com');
});

test('registration validation rejects weak input', () => {
  assert.equal(validateRegistrationInput({ email: 'bad', password: '12345678', displayName: 'Can' }).ok, false);
  assert.equal(validateRegistrationInput({ email: 'a@b.com', password: '123', displayName: 'Can' }).ok, false);
  assert.equal(validateRegistrationInput({ email: 'a@b.com', password: '12345678', displayName: 'C' }).ok, false);
});

test('registration validation accepts normal input', () => {
  const result = validateRegistrationInput({
    email: ' User@Example.com ',
    password: 'StrongPass123',
    displayName: 'KOTAKAS User'
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.email, 'user@example.com');
});

test('session token contains only user identity and verifies', () => {
  const secret = 'test-secret-test-secret-test-secret';
  const token = createSessionToken({ userId: 42, jwtSecret: secret });
  assert.deepEqual(verifySessionToken(token, secret), { userId: '42' });
  assert.equal(verifySessionToken(token, 'wrong-secret'), null);
});
