import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSnapshotServer } from '../src/server.js';

test('snapshot HTTP API: auth and revision', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'snapshot-api-'));
  const server = createSnapshotServer({ dataDir: dir, token: 'test-token' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await fetch(`${base}/v1/snapshots/spellwell/default`)).status, 401);
    const put = await fetch(`${base}/v1/snapshots/spellwell/default`, {
      method: 'PUT',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({ baseRevision: 0, snapshot: { hello: 'world' } }),
    });
    assert.equal(put.status, 201);
    const saved = await put.json();
    assert.equal(saved.revision, 1);
    const get = await fetch(`${base}/v1/snapshots/spellwell/default`, {
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(get.status, 200);
    assert.equal((await get.json()).snapshot.hello, 'world');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
