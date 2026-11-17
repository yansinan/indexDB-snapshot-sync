import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BootstrapCode } from '../src/bootstrap-code.js';
import { createSnapshotServer } from '../src/server.js';
import { createSyncClient, SyncHttpError } from '../sdk/client.js';

test('reference SDK: enroll, pairing, pull and push', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'snapshot-sdk-'));
  const server = createSnapshotServer({
    dataDir: dir,
    bootstrapCode: new BootstrapCode('BOOT-SDK'),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const first = createSyncClient({ baseUrl });
    const jia = await first.enroll({
      bootstrapCode: 'BOOT-SDK', userName: '甲', deviceName: 'browser',
    });
    assert.equal(first.deviceToken, jia.deviceToken);
    assert.equal((await first.me()).user.name, '甲');
    assert.equal(await first.pull(), null);

    const saved = await first.push({ baseRevision: 0, snapshot: { value: 1 } });
    assert.equal(saved.revision, 1);
    assert.equal((await first.pull()).snapshot.value, 1);

    const pair = await first.createPairingCode({ ttlSeconds: 600 });
    const second = createSyncClient({ baseUrl });
    const iPad = await second.enroll({ pairingCode: pair.code, deviceName: 'iPad' });
    assert.equal(iPad.user.id, jia.user.id);
    assert.equal((await second.me()).device.name, 'iPad');

    await assert.rejects(
      () => second.push({ baseRevision: 0, snapshot: {} }),
      (error) => error instanceof SyncHttpError && error.status === 409,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
