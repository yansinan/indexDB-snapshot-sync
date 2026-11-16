# indexDB-snapshot-sync

Ultra-light, self-hosted snapshot sync service for IndexedDB-based apps.

- Node.js, no framework, no runtime dependencies.
- One JSON file per `project/namespace`, atomic replace.
- Browser apps keep their existing IndexedDB schema and scheduling logic.
- Server treats snapshots as opaque JSON documents.
- Intended for small family/small-team datasets.

## Status

Implemented: health, opaque bearer auth, revision-checked snapshot GET/PUT.
Not implemented yet: project token admin API, client SDK, merge helper.

## Local development (no Docker)

```bash
DATA_DIR=./data SYNC_TOKEN=dev-token node src/server.js
```

```bash
curl http://127.0.0.1:8787/health
```

## API

```http
GET /v1/snapshots/:project/:namespace
Authorization: Bearer <SYNC_TOKEN>
```

```http
PUT /v1/snapshots/:project/:namespace
Authorization: Bearer <SYNC_TOKEN>
Content-Type: application/json

{"baseRevision":0,"snapshot":{}}
```

- First write uses `baseRevision: 0`.
- Successful write returns `revision`.
- Stale revision returns `409 revision_conflict`.
- Snapshot storage: `DATA_DIR/projects/<project>/<namespace>/snapshot.json`.

## Docker (production only)

`Dockerfile` uses Node Alpine, not Go. The service is Node.js; it cannot be compiled
into a Go static binary without rewriting the service.

```bash
SYNC_TOKEN="$(openssl rand -base64 32)" docker compose up --build
```

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Auth](docs/AUTH.md)
