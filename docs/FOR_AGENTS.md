# For maintainers and agents

Read this before changing the service.

## Stack

- Node.js 22+.
- Pure ESM.
- No framework, no npm runtime dependencies.
- Tests use `node --test`.

## Commands

```bash
npm start
npm test
```

Equivalent without npm:

```bash
node src/server.js
node --test
```

Do not run Docker for local development. The Dockerfile is production packaging only.

## File map

```text
src/server.js         six routes, CORS, limits, enrollment and auth middleware
src/auth-store.js     users, devices, pairing codes, project bootstrap
src/bootstrap-code.js runtime one-time bootstrap code and rotation
src/auth.js           hashing and bearer parsing
src/store.js          snapshot files, revisions, atomic writes
test/                 node:test suites
docs/                 handoff and operations documentation
```

## Public endpoints

```text
GET  /health
POST /v1/enroll
POST /v1/pairing-codes
GET  /v1/me
GET  /v1/snapshots
PUT  /v1/snapshots
```

`POST /v1/enroll` accepts exactly one of:

```text
bootstrapCode  -> new project + first user
projectId      -> new user in existing project
pairingCode    -> new device for existing user
```

## Invariants

1. Exactly one enrollment credential per request.
2. Never accept `userId`, `namespace`, or project scope from the client for
   snapshot authorization; derive it from the device token.
3. Never store plaintext pairing codes, device tokens, or bootstrap codes.
4. Bootstrap code is one-use, in-memory, and must rotate after successful project
   creation. Print the new code.
5. Pairing codes are one-use, expiring, and only join an existing user.
6. Every device of a user can generate pairing codes; all are equal.
7. Project IDs are generated server-side. There is no project table; project
   existence is derived from users.
8. Snapshot writes must be atomic: temp file + fsync + rename.
9. A stale `baseRevision` returns `409`.
10. The server does not inspect or merge snapshot contents.
11. Never put a device token into the snapshot payload.
12. Single process only in v1; do not claim multi-instance safety.
13. Node is the server language. A Go static binary would require a deliberate rewrite.
14. No admin token/CLI in the public path. The bootstrap code is the project
    creation gate.

## Error behavior

- invalid bootstrap code -> `401`
- invalid/used pairing code -> `400`
- missing project for projectId enrollment -> `404`
- missing/revoked device token -> `401`
- stale snapshot revision -> `409`
- too many enrollment attempts -> `429`

## Known limitations

- No browser SDK or merge helper yet.
- No device revocation HTTP API; `AuthStore.revokeDevice()` exists for operations/tests.
- Bootstrap code response-loss edge case.
- Pairing/enrollment rate limits are in-memory.
- No snapshot history/retention.
- Single instance only.
- Docker is not tested in the local environment.

## Next work

1. Browser SDK:
   `enroll() → store deviceToken → exportAll/pull/merge/importAll/push`.
2. Idempotency for bootstrap enrollment.
3. Snapshot history/retention.
4. Device revocation API with separate auth.
5. Optional HttpOnly cookie mode.
6. Production Docker smoke test.

## Migration from the previous shared token model

The old `SYNC_TOKEN`, `/v1/auth/pair`, and CLI-managed users are gone from the
public path. Create a project with the startup bootstrap code, then create additional
users with the returned `projectId`.
