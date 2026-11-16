# For maintainers and agents

Read this before changing the service.

## Stack

- Node.js 22+.
- Pure ESM.
- No framework, no npm runtime dependencies.
- Tests use `node --test`.

## Commands

```bash
node --test
DATA_DIR=./data node src/server.js
node src/cli.js help
node src/cli.js user-create --project spellwell --name "Child A"
node src/cli.js pair --project spellwell --user usr_...
```

Do not run Docker for local development. The Dockerfile is production packaging only.

## File map

```text
src/server.js       HTTP routes, CORS, limits, auth middleware
src/auth-store.js   users, pairing codes, devices, revocation
src/auth.js         hashing, bearer parsing
src/store.js        snapshot files, revisions, atomic writes
src/cli.js          local admin CLI
test/               node:test suites
docs/               handoff and operations documentation
```

## Invariants

1. Never accept `userId`, `project`, or `namespace` from the client for authorization.
   Resolve them from the device token.
2. Never store plaintext pairing codes or device tokens.
3. Pairing codes are one-time and expiring.
4. Snapshot writes must be atomic: temp file + fsync + rename.
5. Snapshot revision check must remain; a stale `baseRevision` returns `409`.
6. The server does not inspect or merge snapshot contents.
7. The token must never be included in the snapshot payload.
8. All auth and snapshot mutations are serialized in one process. Do not claim
   multi-instance safety without adding a real distributed lock.
9. No new runtime dependency without an explicit architecture decision.
10. Node is the server language. A Go static binary would require a deliberate rewrite.

## Adding an endpoint

1. Add the route in `src/server.js`.
2. Decide whether it is public or requires `authenticate(request)`.
3. Resolve scope from the session, not from client-provided IDs.
4. Add a test under `test/`.
5. Update `docs/API.md` and, if behavior changes, `docs/AUTH.md`.

## Known limitations

- No browser SDK yet.
- No merge helper; client must merge snapshots.
- One device token is long-lived until revoked.
- Pairing rate limit is in-memory.
- No snapshot history/retention.
- No admin HTTP API; use the CLI.
- Single instance only.
- Docker is not tested in the local environment.

## Next work

1. Add a tiny browser sync client:
   `pair(code) → store token → exportAll/pull/merge/importAll/push`.
2. Add `PUT /v1/snapshots` idempotency by hash.
3. Add optional snapshot history/retention.
4. Add HttpOnly cookie mode if same-origin deployment becomes the default.
5. Add a production Docker smoke test outside local development.

## Migration note

The old shared `SYNC_TOKEN` is intentionally gone. If an old snapshot lives in the
`default` namespace, create the user with `--namespace default`, then pair each browser.
