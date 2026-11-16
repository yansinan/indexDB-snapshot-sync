/**
 * Opaque bearer-token primitives.
 * Tokens are generated once, shown once, and stored only as SHA-256 hashes.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

/** @param {string} token */
export function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** @param {string} a @param {string} b */
export function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** @param {import('node:http').IncomingMessage} request */
export function bearerToken(request) {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return '';
  return header.slice('Bearer '.length).trim();
}

/** @param {import('node:http').IncomingMessage} request @param {string} expectedHash */
export function isAuthorized(request, expectedHash) {
  const token = bearerToken(request);
  return token.length > 0 && safeEqualHex(hashToken(token), expectedHash);
}
