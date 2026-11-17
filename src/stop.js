#!/usr/bin/env node
/**
 * npm stop: read the PID written by npm start, send SIGTERM, wait briefly.
 * Uses the same DATA_DIR (and optional PID_FILE) as the server.
 */

import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const dataDir = process.env.DATA_DIR ?? './data';
const pidFile = process.env.PID_FILE ?? path.join(dataDir, 'sync.pid');

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

async function main() {
  let pid;
  try {
    pid = Number((await readFile(pidFile, 'utf8')).trim());
  } catch (error) {
    if (error?.code === 'ENOENT') {
      console.log('indexDB-snapshot-sync is not running (no pid file)');
      return;
    }
    throw error;
  }
  if (!Number.isInteger(pid) || pid <= 1) {
    await rm(pidFile, { force: true });
    throw new Error('invalid pid file');
  }
  if (!alive(pid)) {
    await rm(pidFile, { force: true });
    console.log(`indexDB-snapshot-sync is not running (stale pid ${pid})`);
    return;
  }

  process.kill(pid, 'SIGTERM');
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await delay(100);
    if (!alive(pid)) {
      await rm(pidFile, { force: true });
      console.log(`indexDB-snapshot-sync stopped (pid ${pid})`);
      return;
    }
  }
  throw new Error(`timed out waiting for pid ${pid} to stop`);
}

main().catch((error) => {
  console.error(`stop failed: ${error.message}`);
  process.exitCode = 1;
});
