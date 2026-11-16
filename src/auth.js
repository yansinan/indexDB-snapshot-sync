/**
 * Opaque bearer-token primitives.
 * Tokens are hashed before they are ever persisted or compared.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

/** @param {string} token */
export function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** @param {import('node:http').IncomingMessage} request */
export function bearerToken(request) {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return '';
  return header.slice('Bearer '.length).trim();
}

/** @param {string} a @param {string} b */
export function safeTokenEqual(a, b) {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}
