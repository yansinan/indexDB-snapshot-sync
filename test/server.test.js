import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AuthStore } from '../src/auth-store.js';
import { createSnapshotServer } from '../src/server.js';

test('snapshot HTTP API: pairing, device auth, snapshot revision, revoke', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'snapshot-api-'));
  const auth = new AuthStore(dir);
  const user = await auth.createUser({ project: 'spellwell', name: 'Child A', namespace: 'child-a' });
  const pairing = await auth.createPairingCode({ project: 'spellwell', userId: user.id, ttlMs: 60_000 });
  const server = createSnapshotServer({ dataDir: dir });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await fetch(`${base}/v1/snapshots`)).status, 401);

    const pair = await fetch(`${base}/v1/auth/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: pairing.code, deviceName: 'Test browser' }),
    });
    assert.equal(pair.status, 201);
    const paired = await pair.json();
    assert.equal(paired.user.name, 'Child A');
    assert.equal(paired.namespace, 'child-a');

    const me = await fetch(`${base}/v1/me`, {
      headers: { authorization: `Bearer ${paired.token}` },
    });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).device.name, 'Test browser');

    const put = await fetch(`${base}/v1/snapshots`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${paired.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ baseRevision: 0, snapshot: { hello: 'world' } }),
    });
    assert.equal(put.status, 201);
    const saved = await put.json();
    assert.equal(saved.revision, 1);
    assert.equal(saved.project, 'spellwell');
    assert.equal(saved.namespace, 'child-a');

    const get = await fetch(`${base}/v1/snapshots`, {
      headers: { authorization: `Bearer ${paired.token}` },
    });
    assert.equal(get.status, 200);
    assert.equal((await get.json()).snapshot.hello, 'world');

    await auth.revokeDevice(paired.deviceId);
    const revoked = await fetch(`${base}/v1/me`, {
      headers: { authorization: `Bearer ${paired.token}` },
    });
    assert.equal(revoked.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
