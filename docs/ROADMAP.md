# Roadmap

## Done

- [x] one-time runtime bootstrap code
- [x] server-generated project IDs, no project table
- [x] `POST /v1/enroll` with bootstrap/project/pairing modes
- [x] device-generated one-time pairing codes
- [x] per-device opaque tokens
- [x] device revocation primitive
- [x] revision-checked JSON snapshots
- [x] atomic snapshot writes
- [x] Node Alpine production Dockerfile

## Next

- [ ] browser sync SDK (enroll, token storage, export/import, retry)
- [ ] snapshot merge helper for IndexedDB stores
- [ ] bootstrap enrollment idempotency
- [ ] snapshot history/pruning
- [ ] device revocation HTTP API with separate auth
- [ ] optional HttpOnly cookie mode
- [ ] production Docker smoke test

## Later

- [ ] multi-instance storage backend
- [ ] admin API
- [ ] WebSocket/SSE remote-change signal
- [ ] per-project quotas/metrics
