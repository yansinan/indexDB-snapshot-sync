import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AuthError, AuthStore } from '../src/auth-store.js';

async function withStore(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'auth-store-'));
  try { await fn(new AuthStore(dir), dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

test('auth store: user, pairing code, device token and revoke', async () => {
  await withStore(async (store) => {
    const user = await store.createUser({ project: 'spellwell', name: 'Child A', namespace: 'child-a' });
    assert.equal(user.namespace, 'child-a');
    const pairing = await store.createPairingCode({ project: 'spellwell', userId: user.id, ttlMs: 60_000 });
    assert.match(pairing.code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const paired = await store.pairDevice({ code: pairing.code, deviceName: 'iPhone' });
    assert.equal(paired.user.id, user.id);
    assert.equal(paired.device.userId, user.id);
    assert.equal(paired.token.startsWith('dev_'), true);

    const session = await store.authenticate(paired.token);
    assert.equal(session.user.namespace, 'child-a');
    assert.equal(session.device.name, 'iPhone');

    await assert.rejects(
      () => store.pairDevice({ code: pairing.code, deviceName: 'iPad' }),
      (error) => error instanceof AuthError && error.code === 'invalid_pairing_code',
    );

    await store.revokeDevice(paired.device.id);
    assert.equal(await store.authenticate(paired.token), null);
  });
});

test('auth store: secrets are not stored in plaintext', async () => {
  await withStore(async (store, dir) => {
    const user = await store.createUser({ project: 'spellwell', name: 'Child A' });
    const pairing = await store.createPairingCode({ project: 'spellwell', userId: user.id, ttlMs: 60_000 });
    const paired = await store.pairDevice({ code: pairing.code, deviceName: 'Browser' });
    const raw = await readFile(path.join(dir, 'auth.json'), 'utf8');
    assert.equal(raw.includes(pairing.code), false);
    assert.equal(raw.includes(paired.token), false);
  });
});

test('auth store: user namespace must be unique per project', async () => {
  await withStore(async (store) => {
    await store.createUser({ project: 'spellwell', name: 'A', namespace: 'same' });
    await assert.rejects(
      () => store.createUser({ project: 'spellwell', name: 'B', namespace: 'same' }),
      (error) => error instanceof AuthError && error.code === 'namespace_exists',
    );
  });
});
