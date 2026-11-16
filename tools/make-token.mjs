import { randomBytes } from 'node:crypto';
import { hashToken } from '../src/auth.js';

const token = randomBytes(32).toString('base64url');
console.log(`token: ${token}`);
console.log(`sha256: ${hashToken(token)}`);
