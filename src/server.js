/**
 * indexDB-snapshot-sync.
 * Browser clients keep their IndexedDB; this service only stores opaque snapshots.
 */

import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { hashToken, bearerToken } from './auth.js';
import { SnapshotConflictError, SnapshotStore } from './store.js';

const MAX_BODY = 8 * 1024 * 1024;
const NAME_PATH = /^\/v1\/snapshots\/([a-zA-Z0-9_-]{1,64})\/([a-zA-Z0-9_-]{1,64})$/;

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

function safeTokenEqual(given, expected) {
  const left = Buffer.from(given, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
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

/**
 * @param {{dataDir: string, token: string, corsOrigin?: string}} options
 */
export function createSnapshotServer({ dataDir, token, corsOrigin = '' }) {
  const store = new SnapshotStore(dataDir);
  const tokenHash = token.length > 0 ? hashToken(token) : '';

  const authorized = (request) => {
    if (tokenHash.length === 0) return false;
    const provided = bearerToken(request);
    return provided.length > 0 && safeTokenEqual(hashToken(provided), tokenHash);
  };

  const server = createServer(async (request, response) => {
    if (corsOrigin) {
      response.setHeader('access-control-allow-origin', corsOrigin);
      response.setHeader('access-control-allow-headers', 'authorization, content-type, if-match');
      response.setHeader('access-control-allow-methods', 'GET, PUT, OPTIONS');
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url ?? '/', 'http://localhost');
    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        sendJson(response, 200, {
          status: 'ok',
          service: 'indexdb-snapshot-sync',
          dataDir,
          syncConfigured: tokenHash.length > 0,
        });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/') {
        sendJson(response, 200, {
          name: 'indexDB-snapshot-sync',
          storage: 'json-file',
          endpoints: ['GET/PUT /v1/snapshots/:project/:namespace', 'GET /health'],
        });
        return;
      }

      const match = NAME_PATH.exec(url.pathname);
      if (!match) {
        sendJson(response, 404, { error: 'not_found' });
        return;
      }
      if (!authorized(request)) {
        sendJson(response, tokenHash.length === 0 ? 503 : 401, {
          error: tokenHash.length === 0 ? 'sync_disabled' : 'unauthorized',
        });
        return;
      }
      const [, project, namespace] = match;

      if (request.method === 'GET') {
        const snapshot = await store.load(project, namespace);
        if (!snapshot) {
          sendJson(response, 404, { error: 'snapshot_not_found' });
          return;
        }
        sendJson(response, 200, snapshot, { etag: `"${snapshot.revision}"` });
        return;
      }

      if (request.method === 'PUT') {
        const text = await readBody(request);
        let body;
        try {
          body = JSON.parse(text);
        } catch {
          sendJson(response, 400, { error: 'invalid_json' });
          return;
        }
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
          const saved = await store.save(project, namespace, baseRevision, body.snapshot);
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
      if (error?.status === 413) {
        sendJson(response, 413, { error: 'payload_too_large' });
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
  const token = process.env.SYNC_TOKEN ?? process.env.ADMIN_TOKEN ?? '';
  const corsOrigin = process.env.CORS_ORIGIN ?? '';
  if (!token) console.warn('SYNC_TOKEN is not set; sync endpoints return 503');
  const server = createSnapshotServer({ dataDir, token, corsOrigin });
  server.listen(port, host, () => {
    console.log(`indexDB-snapshot-sync → http://${host}:${port}`);
    console.log(`storage → ${dataDir}`);
  });
}
