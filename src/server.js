/**
 * indexDB-snapshot-sync.
 *
 * Public client entry: POST /v1/enroll with exactly one of
 * bootstrapCode, projectId, or pairingCode. The result is a device token
 * bound to a user/project. Snapshot routes only require that device token.
 */

import { createServer } from 'node:http';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { bearerToken } from './auth.js';
import { AuthError, AuthStore } from './auth-store.js';
import { BootstrapCode, generateBootstrapCode } from './bootstrap-code.js';
import { SnapshotConflictError, SnapshotStore } from './store.js';

const MAX_BODY = 8 * 1024 * 1024;
const MAX_ENROLL_BODY = 32 * 1024;
const ENROLL_WINDOW_MS = 60_000;
const ENROLL_MAX_ATTEMPTS = 30;

function sendJson(response, status, body, extra = {}) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    ...extra,
  });
  response.end(payload);
}

function readBody(request, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('payload_too_large'), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error('invalid_json'), { status: 400, code: 'invalid_json' });
  }
}

function enrollmentResponse(result) {
  return {
    projectId: result.projectId,
    deviceToken: result.token,
    user: { id: result.user.id, name: result.user.name },
    device: { id: result.device.id, name: result.device.name },
  };
}

/**
 * @param {{
 *   dataDir: string,
 *   corsOrigin?: string,
 *   bootstrapCode?: BootstrapCode,
 *   onBootstrapCode?: ((code: string) => void)|null
 * }} options
 */
export function createSnapshotServer({
  dataDir,
  corsOrigin = '',
  bootstrapCode = new BootstrapCode(),
  onBootstrapCode = null,
}) {
  const authStore = new AuthStore(dataDir);
  const snapshots = new SnapshotStore(dataDir);
  const enrollAttempts = new Map();

  const allowEnrollAttempt = (request) => {
    const ip = request.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    const record = enrollAttempts.get(ip);
    if (!record || record.resetAt <= now) {
      enrollAttempts.set(ip, { count: 1, resetAt: now + ENROLL_WINDOW_MS });
      return true;
    }
    if (record.count >= ENROLL_MAX_ATTEMPTS) return false;
    record.count += 1;
    return true;
  };

  const authenticate = async (request) => {
    const token = bearerToken(request);
    if (!token) return null;
    return authStore.authenticate(token);
  };

  const server = createServer(async (request, response) => {
    if (corsOrigin) {
      response.setHeader('access-control-allow-origin', corsOrigin);
      response.setHeader('access-control-allow-headers', 'authorization, content-type, if-match');
      response.setHeader('access-control-allow-methods', 'GET, PUT, POST, OPTIONS');
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url ?? '/', 'http://localhost');
    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        const auth = await authStore.load();
        sendJson(response, 200, {
          status: 'ok',
          service: 'indexdb-snapshot-sync',
          users: auth.users.length,
          activeDevices: auth.devices.filter((device) => !device.revokedAt).length,
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/') {
        sendJson(response, 200, {
          name: 'indexDB-snapshot-sync',
          enroll: ['bootstrapCode', 'projectId', 'pairingCode'],
          endpoints: [
            'POST /v1/enroll',
            'POST /v1/pairing-codes',
            'GET /v1/me',
            'GET/PUT /v1/snapshots',
            'GET /health',
          ],
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/enroll') {
        if (!allowEnrollAttempt(request)) {
          sendJson(response, 429, { error: 'too_many_attempts' });
          return;
        }
        const body = parseJson(await readBody(request, MAX_ENROLL_BODY));
        const modes = ['bootstrapCode', 'projectId', 'pairingCode']
          .filter((key) => typeof body?.[key] === 'string' && body[key].trim().length > 0);
        if (modes.length !== 1) {
          sendJson(response, 400, {
            error: 'invalid_enrollment',
            message: 'exactly one of bootstrapCode, projectId, or pairingCode is required',
          });
          return;
        }

        if (modes[0] === 'bootstrapCode') {
          if (!bootstrapCode.verify(body.bootstrapCode)) {
            sendJson(response, 401, { error: 'invalid_bootstrap_code' });
            return;
          }
          const result = await authStore.bootstrapProject({
            userName: body.userName,
            deviceName: body.deviceName,
          });
          const nextCode = bootstrapCode.rotate();
          try {
            onBootstrapCode?.(nextCode);
          } catch (error) {
            console.error('[bootstrap] failed to emit rotated code', error);
          }
          sendJson(response, 201, enrollmentResponse(result));
          return;
        }

        if (modes[0] === 'projectId') {
          const result = await authStore.createUserInProject({
            projectId: body.projectId,
            userName: body.userName,
            deviceName: body.deviceName,
          });
          sendJson(response, 201, enrollmentResponse(result));
          return;
        }

        const result = await authStore.pairDevice({
          code: body.pairingCode,
          deviceName: body.deviceName,
        });
        sendJson(response, 201, enrollmentResponse(result));
        return;
      }

      const session = await authenticate(request);
      if (!session) {
        sendJson(response, 401, { error: 'unauthorized' });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/pairing-codes') {
        const text = await readBody(request, MAX_ENROLL_BODY);
        const body = text.length > 0 ? parseJson(text) : {};
        const ttlSeconds = body?.ttlSeconds === undefined ? 600 : Number(body.ttlSeconds);
        if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 86_400) {
          sendJson(response, 400, { error: 'invalid_ttl' });
          return;
        }
        const result = await authStore.createPairingCode({
          projectId: session.device.projectId,
          userId: session.user.id,
          ttlMs: ttlSeconds * 1000,
        });
        sendJson(response, 201, result);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/me') {
        sendJson(response, 200, {
          projectId: session.device.projectId,
          namespace: session.user.namespace,
          user: { id: session.user.id, name: session.user.name },
          device: { id: session.device.id, name: session.device.name },
        });
        return;
      }

      if (url.pathname !== '/v1/snapshots') {
        sendJson(response, 404, { error: 'not_found' });
        return;
      }

      if (request.method === 'GET') {
        const snapshot = await snapshots.load(session.device.projectId, session.user.namespace);
        if (!snapshot) {
          sendJson(response, 404, { error: 'snapshot_not_found' });
          return;
        }
        sendJson(response, 200, snapshot, { etag: `"${snapshot.revision}"` });
        return;
      }

      if (request.method === 'PUT') {
        const body = parseJson(await readBody(request));
        let baseRevision = body?.baseRevision;
        const ifMatch = request.headers['if-match'];
        if (typeof ifMatch === 'string' && ifMatch.length > 0) {
          const parsed = Number(ifMatch.replaceAll('"', ''));
          if (Number.isInteger(parsed)) baseRevision = parsed;
        }
        if (!Number.isInteger(baseRevision) || baseRevision < 0) {
          sendJson(response, 400, { error: 'invalid_base_revision' });
          return;
        }
        if (body?.snapshot === null || typeof body?.snapshot !== 'object') {
          sendJson(response, 400, { error: 'invalid_snapshot' });
          return;
        }
        try {
          const saved = await snapshots.save(
            session.device.projectId,
            session.user.namespace,
            baseRevision,
            body.snapshot,
          );
          sendJson(response, 201, saved, { etag: `"${saved.revision}"` });
        } catch (error) {
          if (error instanceof SnapshotConflictError) {
            sendJson(response, 409, { error: 'revision_conflict', current: error.current });
            return;
          }
          throw error;
        }
        return;
      }

      sendJson(response, 405, { error: 'method_not_allowed' });
    } catch (error) {
      if (error instanceof AuthError) {
        sendJson(response, error.status, { error: error.code, message: error.message });
        return;
      }
      if (error?.status === 413) {
        sendJson(response, 413, { error: 'payload_too_large' });
        return;
      }
      if (error?.status === 400 && error.code === 'invalid_json') {
        sendJson(response, 400, { error: 'invalid_json' });
        return;
      }
      console.error('[snapshot-sync]', error);
      sendJson(response, 500, { error: 'internal_error' });
    }
  });

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 4010);
  const host = process.env.HOST ?? '0.0.0.0';
  const dataDir = process.env.DATA_DIR ?? './data';
  const corsOrigin = process.env.CORS_ORIGIN ?? '';
  const initialCode = generateBootstrapCode();
  const bootstrapCode = new BootstrapCode(initialCode);
  const printBootstrap = (code) => {
    console.log('[bootstrap] project creation code:');
    console.log(`[bootstrap] ${code}`);
    console.log('[bootstrap] one use; a new code is emitted after successful enrollment');
  };
  printBootstrap(initialCode);
  const server = createSnapshotServer({
    dataDir,
    corsOrigin,
    bootstrapCode,
    onBootstrapCode: printBootstrap,
  });
  const pidFile = process.env.PID_FILE ?? path.join(dataDir, 'sync.pid');
  server.listen(port, host, async () => {
    console.log(`indexDB-snapshot-sync → http://${host}:${port}`);
    console.log(`storage → ${dataDir}`);
    try {
      await mkdir(dataDir, { recursive: true, mode: 0o750 });
      await writeFile(pidFile, `${process.pid}\n`, { mode: 0o640 });
      console.log(`pid file → ${pidFile}`);
    } catch (error) {
      console.error('[pid] failed to write pid file; npm stop may not work', error);
    }
  });

  const shutdown = (signal) => {
    console.log(`\n[shutdown] ${signal}`);
    server.close(async () => {
      await rm(pidFile, { force: true }).catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}
