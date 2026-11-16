# indexDB-snapshot-sync

Ultra-light, self-hosted snapshot sync service for IndexedDB-based apps.

- No framework, no runtime dependencies.
- One Node process, one SQLite/JSON data volume.
- Browser apps keep their existing IndexedDB schema and scheduling logic.
- Server treats snapshots as opaque JSON documents.
- Intended for small family/small-team datasets, not large-scale collaborative editing.

## Status

Bootstrap only: health endpoint, auth primitives, Docker packaging and architecture notes.
The snapshot API will be added next.

## Quick start

```bash
ADMIN_TOKEN="$(openssl rand -base64 32)" docker compose up --build
```

```bash
curl http://127.0.0.1:8787/health
```

## Repository name

`indexDB-snapshot-sync` (repository directory: `snap-sync`).

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Auth](docs/AUTH.md)
