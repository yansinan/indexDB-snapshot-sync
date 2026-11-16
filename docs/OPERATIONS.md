# Operations

## Requirements

- Node.js 22+
- a writable `DATA_DIR`
- TLS reverse proxy for any non-local deployment

## Docker

Production only. Local development does not require Docker.

```bash
docker compose up --build
docker compose exec sync node src/cli.js user-create \
  --project spellwell --name "Child A" --namespace child-a
```

The image is Node 24 Alpine, runs as a non-root user, uses a read-only root filesystem,
and stores data in the `sync-data` volume.

## Backup

Back up the whole `DATA_DIR`:

```text
auth.json
projects/
```

SQLite is not used. Snapshot writes are atomic, but backup consistency across files is
the operator's responsibility. Stop the service or copy the directory during a quiet
period for a simple full backup.

## Reverse proxy

Terminate TLS at Caddy/Traefik and proxy to port `8787`.

If the browser runs on a different origin, set:

```text
CORS_ORIGIN=https://spellwell.example.com
```

## Health

```http
GET /health
```

## Single-instance warning

Auth and snapshot locks are in-process. Do not run multiple containers against the same
`DATA_DIR`; there is no distributed lock in v1.
