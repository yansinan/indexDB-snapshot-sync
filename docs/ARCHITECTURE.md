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
              JSON file storage
```

## First version

- One snapshot per `projectId + namespace`.
- Client `exportAll()` → merge → `PUT /snapshot`.
- Client `GET /snapshot` → merge → `importAll()`.
- Revision / `If-Match` optimistic concurrency.
- Opaque JSON; server does not know store schemas.
- One file per snapshot; atomic temp-file + rename.

## Storage layout

```text
DATA_DIR/
  projects/
    <project>/
      <namespace>/
        snapshot.json
```

No database, no migration, no sidecar.

## Auth

- One `SYNC_TOKEN` per service instance in v1.
- Bearer token only; SHA-256 comparison in constant time.
- Project token administration is a future extension.

## Non-goals

- server-side scheduling
- real-time collaborative editing
- large blobs
- multi-tenant enterprise auth
