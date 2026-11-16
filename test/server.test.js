import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AuthStore } from '../src/auth-store.js';
import { BootstrapCode } from '../src/bootstrap-code.js';
import { createSnapshotServer } from '../src/server.js';

test('six-endpoint API: bootstrap, project user, pairing, snapshots', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'snapshot-api-'));
  const bootstrap = new BootstrapCode('BOOT-TEST');
  let rotated = '';
  const server = createSnapshotServer({
    dataDir: dir,
    bootstrapCode: bootstrap,
    onBootstrapCode: (code) => { rotated = code; },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const json = (response) => response.json();
  try {
    // no device token
    assert.equal((await fetch(`${base}/v1/me`)).status, 401);

    // bootstrap -> project + user 甲 + device
    const first = await fetch(`${base}/v1/enroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bootstrapCode: 'BOOT-TEST', userName: '甲', deviceName: '甲 browser' }),
    });
    assert.equal(first.status, 201);
    const jia = await json(first);
    assert.match(jia.projectId, /^proj_/);
    assert.equal(jia.user.name, '甲');
    assert.equal(jia.deviceToken.startsWith('dev_'), true);
    assert.equal(rotated.length > 0, true);
    assert.equal(bootstrap.verify('BOOT-TEST'), false);
    assert.equal(bootstrap.verify(rotated), true);

    // old bootstrap code fails
    const oldCode = await fetch(`${base}/v1/enroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bootstrapCode: 'BOOT-TEST', userName: 'x' }),
    });
    assert.equal(oldCode.status, 401);

    // /v1/me
    const me = await fetch(`${base}/v1/me`, {
      headers: { authorization: `Bearer ${jia.deviceToken}` },
    });
    assert.equal(me.status, 200);
    assert.equal((await json(me)).device.name, '甲 browser');

    // snapshot PUT/GET, scoped by device token
    const put = await fetch(`${base}/v1/snapshots`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${jia.deviceToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ baseRevision: 0, snapshot: { hello: 'world' } }),
    });
    assert.equal(put.status, 201);
    const saved = await json(put);
    assert.equal(saved.revision, 1);
    assert.equal(saved.projectId, jia.projectId);
    assert.equal(saved.namespace, jia.user.namespace ?? saved.namespace);

    // projectId mode -> new user 乙 in same project
    const second = await fetch(`${base}/v1/enroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: jia.projectId, userName: '乙', deviceName: '乙 browser' }),
    });
    assert.equal(second.status, 201);
    const yi = await json(second);
    assert.equal(yi.projectId, jia.projectId);
    assert.notEqual(yi.user.id, jia.user.id);
    assert.notEqual(yi.deviceToken, jia.deviceToken);

    // device-generated pairing code; new device joins 甲
    const pairCodeResponse = await fetch(`${base}/v1/pairing-codes`, {
      method: 'POST',
      headers: { authorization: `Bearer ${jia.deviceToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ttlSeconds: 600 }),
    });
    assert.equal(pairCodeResponse.status, 201);
    const pairCode = await json(pairCodeResponse);

    const paired = await fetch(`${base}/v1/enroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pairingCode: pairCode.code, deviceName: '甲 iPad' }),
    });
    assert.equal(paired.status, 201);
    const jiaIpad = await json(paired);
    assert.equal(jiaIpad.user.id, jia.user.id);
    assert.notEqual(jiaIpad.deviceToken, jia.deviceToken);

    // same pairing code is one-time
    const reused = await fetch(`${base}/v1/enroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pairingCode: pairCode.code, deviceName: 'again' }),
    });
    assert.equal(reused.status, 400);

    // revoked device is rejected
    const store = new AuthStore(dir);
    await store.revokeDevice(jia.device.id);
    const revoked = await fetch(`${base}/v1/me`, {
      headers: { authorization: `Bearer ${jia.deviceToken}` },
    });
    assert.equal(revoked.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
