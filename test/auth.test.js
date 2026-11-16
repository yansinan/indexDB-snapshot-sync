import test from 'node:test';
import assert from 'node:assert/strict';
import { bearerToken, hashToken, isAuthorized, safeEqualHex } from '../src/auth.js';

test('hash is stable and token comparison is safe', () => {
  const token = 'sync_test_token';
  const hash = hashToken(token);
  assert.equal(hash, hashToken(token));
  assert.equal(safeEqualHex(hash, hash), true);
  assert.equal(safeEqualHex(hash, hashToken('other')), false);
});

test('bearer header parsing', () => {
  assert.equal(bearerToken({ headers: { authorization: 'Bearer abc' } }), 'abc');
  assert.equal(bearerToken({ headers: {} }), '');
  assert.equal(isAuthorized({ headers: { authorization: `Bearer ${'x'}` } }, hashToken('x')), true);
});
