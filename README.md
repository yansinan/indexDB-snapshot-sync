# indexDB-snapshot-sync

Ultra-light, self-hosted snapshot sync service for IndexedDB-based apps.

- Node.js, no framework, no runtime dependencies.
- One JSON snapshot per user, atomic replace.
- Bootstrap-code project creation, per-device tokens, and one-time pairing codes.
- Browser apps keep their existing IndexedDB schema and scheduling logic.
- Server treats snapshots as opaque JSON.
- Intended for small family/small-team datasets.

## Status

Implemented:

- runtime bootstrap code printed at startup and rotated after a successful project creation;
- `POST /v1/enroll` with `bootstrapCode`, `projectId`, or `pairingCode`;
- per-device authentication and revocation;
- `POST /v1/pairing-codes` from any enrolled device;
- revision-checked snapshot GET/PUT;
- Node Alpine production Dockerfile.

Not implemented yet:

- browser sync SDK / merge helper;
- admin HTTP API (project creation is controlled by the bootstrap code);
- multi-instance storage locking;
- snapshot history/retention.

## Requirements

- Node.js 22+
- no npm dependencies

## Start the service

```bash
cd /Users/Dr/Documents/deepseek-harness/snap-sync
npm start
```

The service listens on `http://localhost:8787`.

If `npm` is not on PATH, the equivalent command is:

```bash
node src/server.js
```

On startup the server prints a one-time project creation code:

```text
[bootstrap] project creation code:
[bootstrap] BOOT-...
[bootstrap] one use; a new code is emitted after successful enrollment
```

Create the first project and user:

```bash
curl -sS -X POST http://127.0.0.1:8787/v1/enroll \
  -H 'content-type: application/json' \
  -d '{"bootstrapCode":"BOOT-...","userName":"用户甲","deviceName":"甲的浏览器"}'
```

The response contains:

```json
{
  "projectId": "proj_...",
  "deviceToken": "dev_...",
  "user": {"id":"usr_...","name":"用户甲"},
  "device": {"id":"dev_...","name":"甲的浏览器"}
}
```

The old bootstrap code is invalid immediately. The server prints a new one.

Create another user in the same project:

```bash
curl -sS -X POST http://127.0.0.1:8787/v1/enroll \
  -H 'content-type: application/json' \
  -d '{"projectId":"proj_...","userName":"用户乙","deviceName":"乙的浏览器"}'
```

Add another device to user 甲:

```bash
# 甲's existing device generates a code
curl -sS -X POST http://127.0.0.1:8787/v1/pairing-codes \
  -H "authorization: Bearer $JIA_DEVICE_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"ttlSeconds":600}'

# new device enrolls with the pairing code
curl -sS -X POST http://127.0.0.1:8787/v1/enroll \
  -H 'content-type: application/json' \
  -d '{"pairingCode":"ABCD-EFGH","deviceName":"甲的 iPad"}'
```

The second device receives the same user 甲 and a different device token.

## Snapshot API

```http
GET /v1/snapshots
Authorization: Bearer dev_...
```

```http
PUT /v1/snapshots
Authorization: Bearer dev_...
Content-Type: application/json

{"baseRevision":0,"snapshot":{}}
```

The snapshot project/namespace are derived from the device token; clients cannot
choose another user's namespace.

## Tests

```bash
node --test
```

## Docker (production only)

The service is Node.js. It cannot be compiled into a Go static binary without a
Go rewrite. The Docker image therefore uses Node Alpine.

```bash
docker compose up --build
docker compose logs -f sync
```

Read the bootstrap code from the logs, then call `/v1/enroll`.

Docker is deliberately not required for local development.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Authentication](docs/AUTH.md)
- [API](docs/API.md)
- [Data model](docs/DATA_MODEL.md)
- [Operations](docs/OPERATIONS.md)
- [For maintainers / agents](docs/FOR_AGENTS.md)
- [Roadmap](docs/ROADMAP.md)
