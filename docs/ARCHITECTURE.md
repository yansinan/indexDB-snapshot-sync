# Architecture

## Position

`indexDB-snapshot-sync` is a self-hosted sync service for small IndexedDB apps.
It does not run application scheduling, judging, or business rules.

```text
Browser A                              Browser B
existing IndexedDB                     existing IndexedDB
        │                                     │
        └──── snapshot sync client ───────────┘
                         │ HTTPS
                         ▼
              snapshot sync service
              users / pairing / devices
              JSON file snapshots
                         │
                    DATA_DIR volume
```

## Components

| Component | File | Responsibility |
|---|---|---|
| HTTP API | `src/server.js` | routes, auth middleware, request limits |
| Auth store | `src/auth-store.js` | users, one-time pairing codes, device tokens |
| Snapshot store | `src/store.js` | revisioned JSON snapshots, atomic writes |
| Token helpers | `src/auth.js` | hashing, bearer parsing |
| Admin CLI | `src/cli.js` | create users, pair codes, list/revoke devices |

## Sync model

The browser remains responsible for its data model and scheduling. The server stores
one opaque JSON snapshot per `project + user namespace`.

```text
GET  /v1/snapshots   → {revision, hash, updatedAt, snapshot}
PUT  /v1/snapshots   → baseRevision + snapshot
```

The client should:

1. export its local DB;
2. fetch the remote snapshot;
3. merge locally (application-specific);
4. import the merged snapshot;
5. PUT with the remote revision (or `If-Match`);
6. on 409, fetch again and retry with a bounded number of attempts.

The server does not merge data and does not inspect snapshot fields.

## Storage

```text
DATA_DIR/
  auth.json
  projects/
    <project>/
      <namespace>/
        snapshot.json
```

All writes use a temporary file, `fsync`, then `rename`. Auth mutations are serialized
inside one Node process. This is a single-instance design; do not run multiple replicas
against the same `DATA_DIR`.

## Auth boundary

- pairing code is public only at `POST /v1/auth/pair`;
- all snapshot and identity routes require a device bearer token;
- device project/namespace are resolved from the token, never from client-supplied
  URL parameters;
- the server never returns another user's namespace.

See [AUTH.md](AUTH.md).

## Non-goals

- server-side scheduling or question generation;
- real-time collaborative editing;
- large blobs;
- enterprise multi-tenant auth;
- multi-instance/HA storage.
