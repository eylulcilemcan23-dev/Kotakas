import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmail, validateLoginInput } from '../src/auth.js';

test('normalizeEmail trims and lowercases', () => {
  assert.equal(normalizeEmail('  USER@Example.COM '), 'user@example.com');
});

test('validateLoginInput accepts normal credentials shape', () => {
  assert.deepEqual(validateLoginInput({ email: 'a@b.com', password: 'secret123' }), {
    ok: true,
    email: 'a@b.com',
    password: 'secret123',
  });
});

test('validateLoginInput returns generic invalid_credentials', () => {
  assert.deepEqual(validateLoginInput({ email: 'bad', password: '' }), {
    ok: false,
    error: 'invalid_credentials',
  });
});
