# Operations

## Requirements

- Node.js 22+
- writable `DATA_DIR`
- TLS reverse proxy for non-local deployment

## Local

```bash
cd /Users/Dr/Documents/deepseek-harness/snap-sync
npm start
```

Read the bootstrap code from the terminal. Without npm, use `node src/server.js`.

## Docker

Production only. Local development does not require Docker.

```bash
docker compose up --build
docker compose logs -f sync
```

Read the bootstrap code from the logs, then call `/v1/enroll`.

The image is Node 24 Alpine, runs as a non-root user, uses a read-only root
filesystem, and stores data in the `sync-data` volume.

## Bootstrap code rotation

- printed at process start;
- one use;
- after a successful project creation, the code is rotated and the new code is
  printed;
- restarting the process also generates a new code;
- old codes are invalid immediately.

If the code is lost:

```bash
docker compose restart sync
docker compose logs sync | grep -A2 'project creation code'
```

Existing projects, users, devices, and tokens are unaffected.

## Backup

Back up the whole `DATA_DIR`:

```text
auth.json
projects/
```

Snapshot and auth writes are atomic, but cross-file consistency is the operator's
responsibility. Stop the service or copy during a quiet period for a simple full
backup.

## Reverse proxy

Terminate TLS at Caddy/Traefik and proxy to port `8787`.

If the browser runs on a different origin:

```text
CORS_ORIGIN=https://spellwell.example.com
```

## Health

```http
GET /health
```

## Single-instance warning

Auth and snapshot locks are in-process. Do not run multiple containers against the
same `DATA_DIR`; there is no distributed lock in v1.
