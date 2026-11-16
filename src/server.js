/**
 * indexDB-snapshot-sync bootstrap server.
 * Health endpoint is intentionally unauthenticated; sync endpoints will be authenticated.
 */

import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';
const dataDir = process.env.DATA_DIR ?? '/data';
const adminTokenConfigured = typeof process.env.ADMIN_TOKEN === 'string' && process.env.ADMIN_TOKEN.length > 0;

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  response.end(payload);
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, {
      status: 'ok',
      service: 'indexdb-snapshot-sync',
      dataDir,
      adminTokenConfigured,
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/') {
    sendJson(response, 200, {
      name: 'indexDB-snapshot-sync',
      status: 'bootstrap',
      endpoints: ['/health'],
    });
    return;
  }
  sendJson(response, 404, { error: 'not_found' });
});

server.listen(port, host, () => {
  console.log(`indexDB-snapshot-sync → http://${host}:${port}`);
  if (!adminTokenConfigured) console.warn('ADMIN_TOKEN is not set');
  console.log('Press Ctrl+C to stop.');
});
