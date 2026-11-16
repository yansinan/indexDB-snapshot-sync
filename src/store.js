/**
 * Ultra-light snapshot store:
 * one JSON file per project/namespace, atomic replace, revision check.
 * No database and no external dependency.
 */

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

const NAME = /^[a-zA-Z0-9_-]{1,64}$/;

export class SnapshotConflictError extends Error {
  constructor(current) {
    super('revision_conflict');
    this.name = 'SnapshotConflictError';
    this.current = current;
  }
}

export class SnapshotStore {
  /** @param {string} root */
  constructor(root) {
    this.root = path.resolve(root);
    /** @type {Map<string, Promise<unknown>>} */
    this.locks = new Map();
  }

  #checkName(value, label) {
    if (typeof value !== 'string' || !NAME.test(value)) {
      throw new RangeError(`${label} must match ${NAME}`);
    }
  }

  #dir(project, namespace) {
    this.#checkName(project, 'project');
    this.#checkName(namespace, 'namespace');
    return path.join(this.root, 'projects', project, namespace);
  }

  #file(project, namespace) {
    return path.join(this.#dir(project, namespace), 'snapshot.json');
  }

  async #withLock(key, fn) {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const current = previous.then(fn, fn);
    const tail = current.finally(() => {
      if (this.locks.get(key) === tail) this.locks.delete(key);
    });
    // The tail exists only to serialize/cleanup; its rejection is already
    // observed by the caller through `current`. Prevent an unhandled rejection.
    tail.catch(() => {});
    this.locks.set(key, tail);
    return current;
  }

  async load(project, namespace) {
    try {
      const text = await readFile(this.#file(project, namespace), 'utf8');
      const parsed = JSON.parse(text);
      if (!Number.isInteger(parsed?.revision) || parsed.revision < 1 || !parsed.snapshot) {
        throw new Error('invalid snapshot file');
      }
      return { ...parsed, projectId: parsed.projectId ?? parsed.project };
    } catch (error) {
      if (error && error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async save(project, namespace, baseRevision, snapshot) {
    if (!Number.isInteger(baseRevision) || baseRevision < 0) {
      throw new RangeError('baseRevision must be a non-negative integer');
    }
    if (snapshot === null || typeof snapshot !== 'object') {
      throw new TypeError('snapshot must be a JSON object');
    }
    const key = `${project}/${namespace}`;
    return this.#withLock(key, async () => {
      const current = await this.load(project, namespace);
      const currentRevision = current?.revision ?? 0;
      if (baseRevision !== currentRevision) {
        throw new SnapshotConflictError(current);
      }
      const compact = JSON.stringify(snapshot);
      const revision = currentRevision + 1;
      const envelope = {
        projectId: project,
        namespace,
        revision,
        hash: createHash('sha256').update(compact, 'utf8').digest('hex'),
        updatedAt: new Date().toISOString(),
        snapshot,
      };
      await this.#atomicWrite(this.#file(project, namespace), envelope);
      return envelope;
    });
  }

  async #atomicWrite(file, envelope) {
    const dir = path.dirname(file);
    await mkdir(dir, { recursive: true, mode: 0o750 });
    const temp = path.join(dir, `.snapshot-${randomUUID()}.tmp`);
    const body = `${JSON.stringify(envelope, null, 2)}\n`;
    try {
      const handle = await open(temp, 'wx', 0o640);
      try {
        await handle.writeFile(body, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temp, file);
    } catch (error) {
      await rm(temp, { force: true }).catch(() => {});
      throw error;
    }
  }
}
