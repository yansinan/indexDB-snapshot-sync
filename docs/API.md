# API

Base URL: `http://localhost:8787`

All responses are JSON. Errors have the shape:

```json
{"error":"error_code","message":"optional detail"}
```

## Health

```http
GET /health
```

No auth.

```json
{
  "status": "ok",
  "service": "indexdb-snapshot-sync",
  "users": 1,
  "activeDevices": 2
}
```

## Pair a device

```http
POST /v1/auth/pair
Content-Type: application/json

{"code":"ABCD-EFGH","deviceName":"Child A browser"}
```

- `201` on success
- `400` invalid/expired/used code
- `429` too many attempts from this IP

Response:

```json
{
  "deviceId": "dev_...",
  "token": "dev_...",
  "deviceName": "Child A browser",
  "project": "spellwell",
  "namespace": "child-a",
  "user": {"id":"usr_...","name":"Child A"}
}
```

## Current identity

```http
GET /v1/me
Authorization: Bearer dev_...
```

```json
{
  "project": "spellwell",
  "namespace": "child-a",
  "user": {"id":"usr_...","name":"Child A"},
  "device": {"id":"dev_...","name":"Child A browser"}
}
```

## Get snapshot

```http
GET /v1/snapshots
Authorization: Bearer dev_...
```

- `200` snapshot envelope
- `401` missing/revoked token
- `404` no snapshot yet

```json
{
  "project": "spellwell",
  "namespace": "child-a",
  "revision": 3,
  "hash": "sha256...",
  "updatedAt": "2026-11-16T15:00:00.000Z",
  "snapshot": {}
}
```

## Put snapshot

```http
PUT /v1/snapshots
Authorization: Bearer dev_...
Content-Type: application/json

{"baseRevision":3,"snapshot":{}}
```

- `201` saved; returns the new envelope
- `400` invalid JSON/baseRevision/snapshot
- `401` unauthorized
- `409` revision conflict; includes `current`
- `413` body over 8 MB

`If-Match: "3"` is also accepted as an alternative to `baseRevision`.

First write:

```json
{"baseRevision":0,"snapshot":{}}
```

## Not found

Unknown routes return `404 {"error":"not_found"}`.
