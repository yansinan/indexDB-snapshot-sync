/**
 * File-backed identity store.
 *
 * users + one-time pairing codes + devices.
 * No database; the dataset is small and the service is single-instance.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

const NAME = /^[a-zA-Z0-9_-]{1,64}$/;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_TTL_MS = 10 * 60 * 1000;

export class AuthError extends Error {
  constructor(code, status = 400, message = code) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = status;
  }
}

function hash(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeCode(value) {
  return String(value ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function randomCode() {
  let out = '';
  for (let index = 0; index < 8; index += 1) {
    out += CODE_ALPHABET[randomBytes(1)[0] % CODE_ALPHABET.length];
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

function randomToken() {
  return `dev_${randomBytes(32).toString('base64url')}`;
}

function safeName(value, label) {
  if (typeof value !== 'string' || !NAME.test(value)) {
    throw new AuthError('invalid_name', 400, `${label} must match ${NAME}`);
  }
  return value;
}

function safeText(value, label, max = 80) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    throw new AuthError('invalid_text', 400, `${label} is required (max ${max})`);
  }
  return value.trim();
}

/** @param {string} value */
export function pairingCodeHash(value) {
  return hash(normalizeCode(value));
}

export class AuthStore {
  /** @param {string} root */
  constructor(root) {
    this.root = path.resolve(root);
    this.file = path.join(this.root, 'auth.json');
    /** @type {Promise<unknown>} */
    this.tail = Promise.resolve();
  }

  async #withLock(fn) {
    const previous = this.tail;
    const current = previous.then(fn, fn);
    const tail = current.finally(() => {});
    tail.catch(() => {});
    this.tail = tail;
    return current;
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8'));
      return {
        version: 1,
        users: Array.isArray(parsed.users) ? parsed.users : [],
        pairingCodes: Array.isArray(parsed.pairingCodes) ? parsed.pairingCodes : [],
        devices: Array.isArray(parsed.devices) ? parsed.devices : [],
      };
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return { version: 1, users: [], pairingCodes: [], devices: [] };
      }
      throw error;
    }
  }

  async #save(data) {
    await mkdir(this.root, { recursive: true, mode: 0o750 });
    const temp = path.join(this.root, `.auth-${randomUUID()}.tmp`);
    const body = `${JSON.stringify(data, null, 2)}\n`;
    try {
      const handle = await open(temp, 'wx', 0o640);
      try {
        await handle.writeFile(body, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temp, this.file);
    } catch (error) {
      await rm(temp, { force: true }).catch(() => {});
      throw error;
    }
  }

  async createUser({ project, name, namespace }) {
    safeName(project, 'project');
    const userName = safeText(name, 'name');
    return this.#withLock(async () => {
      const data = await this.load();
      const id = `usr_${randomUUID()}`;
      const ns = namespace === undefined || namespace === ''
        ? `user-${id.slice(4, 12)}`
        : safeName(namespace, 'namespace');
      if (data.users.some((user) => user.project === project && user.namespace === ns)) {
        throw new AuthError('namespace_exists', 409, 'namespace already exists in project');
      }
      if (data.users.some((user) => user.project === project && user.name === userName)) {
        throw new AuthError('user_exists', 409, 'user name already exists in project');
      }
      const user = { id, project, name: userName, namespace: ns, createdAt: new Date().toISOString() };
      data.users.push(user);
      await this.#save(data);
      return user;
    });
  }

  async listUsers(project) {
    safeName(project, 'project');
    const data = await this.load();
    return data.users.filter((user) => user.project === project);
  }

  async createPairingCode({ project, userId, ttlMs = DEFAULT_TTL_MS }) {
    safeName(project, 'project');
    if (!Number.isFinite(ttlMs) || ttlMs < 60_000 || ttlMs > 24 * 60 * 60 * 1000) {
      throw new AuthError('invalid_ttl', 400, 'ttl must be between 1 minute and 24 hours');
    }
    return this.#withLock(async () => {
      const data = await this.load();
      const user = data.users.find((item) => item.id === userId && item.project === project);
      if (!user) throw new AuthError('user_not_found', 404, 'user not found');
      const code = randomCode();
      const now = Date.now();
      const record = {
        id: `pair_${randomUUID()}`,
        codeHash: pairingCodeHash(code),
        project,
        userId,
        expiresAt: new Date(now + ttlMs).toISOString(),
        usedAt: null,
        createdAt: new Date(now).toISOString(),
      };
      // Keep the file small: drop expired, unused codes.
      data.pairingCodes = data.pairingCodes
        .filter((item) => item.usedAt !== null || Date.parse(item.expiresAt) > now)
        .concat(record);
      await this.#save(data);
      return { code, expiresAt: record.expiresAt };
    });
  }

  async pairDevice({ code, deviceName }) {
    const normalized = normalizeCode(code);
    if (normalized.length !== 8) {
      throw new AuthError('invalid_pairing_code', 400, 'invalid pairing code');
    }
    const name = safeText(deviceName, 'deviceName');
    return this.#withLock(async () => {
      const data = await this.load();
      const now = Date.now();
      const codeHash = pairingCodeHash(normalized);
      const pairing = data.pairingCodes.find((item) => item.codeHash === codeHash && item.usedAt === null);
      if (!pairing) throw new AuthError('invalid_pairing_code', 400, 'invalid or used pairing code');
      if (Date.parse(pairing.expiresAt) <= now) {
        throw new AuthError('pairing_code_expired', 400, 'pairing code expired');
      }
      pairing.usedAt = new Date(now).toISOString();
      const user = data.users.find((item) => item.id === pairing.userId && item.project === pairing.project);
      if (!user) throw new AuthError('user_not_found', 404, 'user not found');
      const token = randomToken();
      const device = {
        id: `dev_${randomUUID()}`,
        project: pairing.project,
        userId: pairing.userId,
        name,
        tokenHash: hash(token),
        createdAt: new Date(now).toISOString(),
        lastSeenAt: null,
        revokedAt: null,
      };
      data.devices.push(device);
      await this.#save(data);
      return { device, user, token };
    });
  }

  async authenticate(token) {
    if (typeof token !== 'string' || !token.startsWith('dev_')) return null;
    const data = await this.load();
    const tokenHash = hash(token);
    const device = data.devices.find((item) => item.tokenHash === tokenHash && item.revokedAt === null);
    if (!device) return null;
    const user = data.users.find((item) => item.id === device.userId && item.project === device.project);
    return user ? { device, user } : null;
  }

  async listDevices(project) {
    safeName(project, 'project');
    const data = await this.load();
    return data.devices
      .filter((device) => device.project === project)
      .map(({ tokenHash, ...device }) => device);
  }

  async revokeDevice(deviceId) {
    return this.#withLock(async () => {
      const data = await this.load();
      const device = data.devices.find((item) => item.id === deviceId);
      if (!device) throw new AuthError('device_not_found', 404, 'device not found');
      device.revokedAt = new Date().toISOString();
      await this.#save(data);
      return { ...device, tokenHash: undefined };
    });
  }
}
