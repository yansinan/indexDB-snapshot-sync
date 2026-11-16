import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AuthError, AuthStore } from '../src/auth-store.js';
import { BootstrapCode } from '../src/bootstrap-code.js';

async function withStore(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'auth-store-'));
  try { await fn(new AuthStore(dir), dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

test('auth store: bootstrap project, add user, pair device and revoke', async () => {
  await withStore(async (store) => {
    const first = await store.bootstrapProject({ userName: '甲', deviceName: '甲 browser' });
    assert.match(first.projectId, /^proj_[A-Za-z0-9_-]+$/);
    assert.equal(first.user.name, '甲');
    assert.equal(first.device.projectId, first.projectId);
    assert.equal(first.token.startsWith('dev_'), true);

    const second = await store.createUserInProject({
      projectId: first.projectId, userName: '乙', deviceName: '乙 browser',
    });
    assert.equal(second.projectId, first.projectId);
    assert.notEqual(second.user.id, first.user.id);

    const pairing = await store.createPairingCode({
      projectId: first.projectId, userId: first.user.id, ttlMs: 60_000,
    });
    assert.match(pairing.code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const paired = await store.pairDevice({ code: pairing.code, deviceName: '甲 iPad' });
    assert.equal(paired.user.id, first.user.id);
    assert.equal(paired.projectId, first.projectId);

    const session = await store.authenticate(paired.token);
    assert.equal(session.user.name, '甲');
    assert.equal(session.device.name, '甲 iPad');

    await assert.rejects(
      () => store.pairDevice({ code: pairing.code, deviceName: 'again' }),
      (error) => error instanceof AuthError && error.code === 'invalid_pairing_code',
    );

    await store.revokeDevice(paired.device.id);
    assert.equal(await store.authenticate(paired.token), null);
  });
});

test('auth store: secrets are not stored in plaintext', async () => {
  await withStore(async (store, dir) => {
    const first = await store.bootstrapProject({ userName: '甲', deviceName: 'browser' });
    const pairing = await store.createPairingCode({
      projectId: first.projectId, userId: first.user.id, ttlMs: 60_000,
    });
    const paired = await store.pairDevice({ code: pairing.code, deviceName: 'iPad' });
    const raw = await readFile(path.join(dir, 'auth.json'), 'utf8');
    assert.equal(raw.includes(pairing.code), false);
    assert.equal(raw.includes(paired.token), false);
  });
});

test('auth store: project id must exist for new users', async () => {
  await withStore(async (store) => {
    await assert.rejects(
      () => store.createUserInProject({ projectId: 'proj_missing', userName: '乙' }),
      (error) => error instanceof AuthError && error.code === 'project_not_found',
    );
  });
});

test('bootstrap code is one-time and rotates', () => {
  const bootstrap = new BootstrapCode('BOOT-test');
  assert.equal(bootstrap.verify('BOOT-test'), true);
  assert.equal(bootstrap.verify('wrong'), false);
  const next = bootstrap.rotate();
  assert.notEqual(next, 'BOOT-test');
  assert.equal(bootstrap.verify('BOOT-test'), false);
  assert.equal(bootstrap.verify(next), true);
});
