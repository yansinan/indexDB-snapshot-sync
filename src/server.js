/**
 * indexDB-snapshot-sync.
 * Browser clients keep IndexedDB; the server stores opaque snapshots and
 * authenticates each browser/device through a pairing-issued device token.
 */

import { createServer } from 'node:http';
import { bearerToken } from './auth.js';
import { AuthError, AuthStore } from './auth-store.js';
import { SnapshotConflictError, SnapshotStore } from './store.js';

const MAX_BODY = 8 * 1024 * 1024;
const MAX_PAIR_BODY = 16 * 1024;
const PAIR_WINDOW_MS = 60_000;
const PAIR_MAX_ATTEMPTS = 20;

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

/**
 * @param {{dataDir: string, corsOrigin?: string}} options
 */
export function createSnapshotServer({ dataDir, corsOrigin = '' }) {
  const authStore = new AuthStore(dataDir);
  const snapshots = new SnapshotStore(dataDir);
  const pairAttempts = new Map();

  const allowPairAttempt = (request) => {
    const ip = request.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    const record = pairAttempts.get(ip);
    if (!record || record.resetAt <= now) {
      pairAttempts.set(ip, { count: 1, resetAt: now + PAIR_WINDOW_MS });
      return true;
    }
    if (record.count >= PAIR_MAX_ATTEMPTS) return false;
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
          auth: 'pairing-code + device-token',
          endpoints: [
            'POST /v1/auth/pair',
            'GET /v1/me',
            'GET/PUT /v1/snapshots',
            'GET /health',
          ],
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v1/auth/pair') {
        if (!allowPairAttempt(request)) {
          sendJson(response, 429, { error: 'too_many_attempts' });
          return;
        }
        const body = parseJson(await readBody(request, MAX_PAIR_BODY));
        const result = await authStore.pairDevice({
          code: body?.code,
          deviceName: body?.deviceName,
        });
        sendJson(response, 201, {
          deviceId: result.device.id,
          token: result.token,
          deviceName: result.device.name,
          project: result.device.project,
          namespace: result.user.namespace,
          user: { id: result.user.id, name: result.user.name },
        });
        return;
      }

      const session = await authenticate(request);
      if (!session) {
        sendJson(response, 401, { error: 'unauthorized' });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/me') {
        sendJson(response, 200, {
          project: session.device.project,
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
        const snapshot = await snapshots.load(session.device.project, session.user.namespace);
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
            session.device.project,
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
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? '0.0.0.0';
  const dataDir = process.env.DATA_DIR ?? './data';
  const corsOrigin = process.env.CORS_ORIGIN ?? '';
  const server = createSnapshotServer({ dataDir, corsOrigin });
  server.listen(port, host, () => {
    console.log(`indexDB-snapshot-sync → http://${host}:${port}`);
    console.log(`storage → ${dataDir}`);
    console.log('Create users/pairing codes with: node src/cli.js help');
  });
}
