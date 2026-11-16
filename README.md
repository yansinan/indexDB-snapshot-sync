# indexDB-snapshot-sync

Ultra-light, self-hosted snapshot sync service for IndexedDB-based apps.

- Node.js, no framework, no runtime dependencies.
- One JSON file per user/namespace snapshot, atomic replace.
- Per-device authentication: a browser pairs once with a one-time code, then uses its own device token.
- Browser apps keep their existing IndexedDB schema and scheduling logic.
- Server treats snapshots as opaque JSON documents.
- Intended for small family/small-team datasets.

## Status

Implemented:

- file-backed users, pairing codes and devices;
- pairing-code → device-token exchange;
- device revocation;
- revision-checked snapshot GET/PUT;
- local admin CLI;
- Node Alpine production Dockerfile.

Not implemented yet:

- browser sync SDK / merge helper;
- admin HTTP API (use the CLI);
- multi-instance storage locking;
- snapshot history/retention.

## Requirements

- Node.js 22+
- no npm dependencies

## Local development (no Docker)

```bash
export DATA_DIR=./data

# 1. create a user and remember the returned user id
node src/cli.js user-create --project spellwell --name "Child A" --namespace child-a

# 2. create a one-time pairing code for that user
node src/cli.js pair --project spellwell --user usr_...

# 3. start the service in another terminal
node src/server.js
```

Pair the browser:

```bash
curl -sS -X POST http://127.0.0.1:8787/v1/auth/pair \
  -H 'content-type: application/json' \
  -d '{"code":"ABCD-EFGH","deviceName":"Child A browser"}'
```

Store the returned `token` in the browser outside the synced snapshot, then:

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

## Tests

```bash
node --test
```

## Docker (production only)

The service is Node.js. It cannot be compiled into a Go static binary without a
Go rewrite. The Docker image therefore uses Node Alpine.

```bash
docker compose up --build
docker compose exec sync node src/cli.js user-create \
  --project spellwell --name "Child A" --namespace child-a
docker compose exec sync node src/cli.js pair \
  --project spellwell --user usr_...
```

Docker is deliberately not required for local development.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Authentication](docs/AUTH.md)
- [API](docs/API.md)
- [CLI](docs/CLI.md)
- [Data model](docs/DATA_MODEL.md)
- [Operations](docs/OPERATIONS.md)
- [For maintainers / agents](docs/FOR_AGENTS.md)
- [Roadmap](docs/ROADMAP.md)
