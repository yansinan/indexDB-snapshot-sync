# Architecture

## Position

`indexDB-snapshot-sync` is a self-hosted sync service for small indexes.
It does not run application scheduling or business rules.

```text
Browser A                         Browser B
existing IndexedDB                existing IndexedDB
        │                                │
        └──── snapshot sync SDK ─────────┘
                         │
              snapshot sync service
              SQLite / JSON volume
```

## First version

- One snapshot per `projectId + namespace`.
- Client `exportAll()` → merge → `PUT /snapshot`.
- Client `GET /snapshot` → merge → `importAll()`.
- Revision / `If-Match` optimistic concurrency.
- Opaque JSON; server does not know store schemas.

## Auth

- `ADMIN_TOKEN` only for project/token administration.
- Project/device bearer tokens for sync.
- Tokens stored as SHA-256 hashes.
- No JWT, OAuth server, or user database in v1.

## Storage target

- Default: one small SQLite file, or JSON snapshots for the first bootstrap.
- Docker volume `/data`; no database sidecar.
- Keep old snapshot revisions for recovery.

## Non-goals

- server-side scheduling
- real-time collaborative editing
- large blobs
- multi-tenant enterprise auth
