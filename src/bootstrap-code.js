/**
 * Runtime-only bootstrap code.
 * The plaintext code is printed once; only its hash is retained in memory.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

function hash(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function generateBootstrapCode() {
  return `BOOT-${randomBytes(24).toString('base64url')}`;
}

export class BootstrapCode {
  /** @param {string} [code] */
  constructor(code = generateBootstrapCode()) {
    this.hash = hash(code);
  }

  /** @param {string} code */
  verify(code) {
    if (typeof code !== 'string' || code.length === 0) return false;
    const left = Buffer.from(hash(code), 'hex');
    const right = Buffer.from(this.hash, 'hex');
    return left.length === right.length && timingSafeEqual(left, right);
  }

  /** Invalidate the current code and return the next one for logging. */
  rotate() {
    const code = generateBootstrapCode();
    this.hash = hash(code);
    return code;
  }
}
