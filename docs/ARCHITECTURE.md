# Architecture

## Position

`indexDB-snapshot-sync` is a self-hosted sync service for small IndexedDB apps.
It does not run scheduling, judging, or business rules.

```text
Browser A                              Browser B
existing IndexedDB                     existing IndexedDB
        │                                     │
        └──── enroll / sync client ───────────┘
                         │ HTTPS
                         ▼
              snapshot sync service
              users / devices / pairing
              runtime bootstrap code
                         │
                    DATA_DIR volume
```

## Public API

```text
GET  /health
POST /v1/enroll
POST /v1/pairing-codes
GET  /v1/me
GET  /v1/snapshots
PUT  /v1/snapshots
```

## Enrollment model

`POST /v1/enroll` accepts exactly one credential:

| Credential | Result |
|---|---|
| `bootstrapCode` | new project + first user + device token |
| `projectId` | new user in existing project + device token |
| `pairingCode` | new device for an existing user |

The result is always:

```json
{"projectId":"proj_...","deviceToken":"dev_...","user":{},"device":{}}
```

## Project identity

A project has no separate record. A project exists while at least one user has its
`projectId`.

```text
users
  projectId
  userId
  namespace
```

The first enrollment generates a 128-bit `proj_...` ID server-side. Future users
join by presenting that projectId. The client never chooses a project ID.

## Bootstrap code

- generated once when the Node process starts;
- printed to stdout/stderr;
- held only in memory as a SHA-256 hash;
- one use;
- after successful project creation it is rotated and the new code is printed;
- restart generates a new code and invalidates the old one;
- no bootstrap-code API.

If the code is lost, restart the service and read the new code from the logs.

## Storage

```text
DATA_DIR/
  auth.json
  projects/
    <projectId>/
      <namespace>/
        snapshot.json
```

Auth writes and snapshot writes use temp file + `fsync` + `rename`. Auth mutations
are serialized in one Node process.

## Auth boundary

- bootstrap code only permits creation of a new project;
- projectId permits creation of a new user in that project;
- pairing code only joins an existing user;
- device token scopes all snapshot reads/writes;
- scoping comes from the token, never from client-supplied user/namespace IDs.

## Non-goals

- server-side scheduling;
- real-time collaborative editing;
- large blobs;
- enterprise multi-tenant auth;
- multi-instance/HA storage.
