import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SnapshotConflictError, SnapshotStore } from '../src/store.js';

async function withStore(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'snapshot-sync-'));
  try { await fn(new SnapshotStore(dir), dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

test('snapshot store: first save, load, and revision', async () => {
  await withStore(async (store) => {
    assert.equal(await store.load('spellwell', 'default'), null);
    const first = await store.save('spellwell', 'default', 0, { notes: [1, 2] });
    assert.equal(first.revision, 1);
    assert.equal(first.snapshot.notes.length, 2);
    const loaded = await store.load('spellwell', 'default');
    assert.equal(loaded.revision, 1);
    assert.equal(loaded.hash, first.hash);
  });
});

test('snapshot store: stale base revision conflicts', async () => {
  await withStore(async (store) => {
    await store.save('spellwell', 'default', 0, { value: 1 });
    await store.save('spellwell', 'default', 1, { value: 2 });
    await assert.rejects(
      () => store.save('spellwell', 'default', 1, { value: 3 }),
      (error) => error instanceof SnapshotConflictError && error.current.revision === 2,
    );
  });
});
