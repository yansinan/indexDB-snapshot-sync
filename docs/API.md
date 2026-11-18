# API

Base URL: `http://localhost:4010`

A zero-dependency reference client is available at [sdk/client.js](../sdk/client.js).

All responses are JSON. Errors:

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

## Enroll

```http
POST /v1/enroll
Content-Type: application/json
```

Exactly one credential is required.

### New project

```json
{
  "bootstrapCode": "BOOT-...",
  "userName": "用户甲",
  "deviceName": "甲的浏览器"
}
```

### New user in an existing project

```json
{
  "projectId": "proj_...",
  "userName": "用户乙",
  "deviceName": "乙的浏览器"
}
```

### New device for an existing user

```json
{
  "pairingCode": "ABCD-EFGH",
  "deviceName": "甲的 iPad"
}
```

### Success

`201`

```json
{
  "projectId": "proj_...",
  "deviceToken": "dev_...",
  "user": {"id":"usr_...","name":"用户甲"},
  "device": {"id":"dev_...","name":"甲的浏览器"}
}
```

Errors:

- `400 invalid_enrollment` — zero or more than one credential;
- `400 invalid_pairing_code` — bad/used code;
- `400 pairing_code_expired`;
- `401 invalid_bootstrap_code`;
- `404 project_not_found`;
- `429 too_many_attempts`.

The bootstrap code is one-time and is rotated after successful project creation.

## Create pairing code

```http
POST /v1/pairing-codes
Authorization: Bearer dev_...
Content-Type: application/json

{"ttlSeconds":600}
```

`ttlSeconds` is optional, default 600, range 60—86400.

Response `201`:

```json
{"code":"ABCD-EFGH","expiresAt":"..."}
```

Only the user's own enrolled device can create the code; project/user are derived
from the device token.

## Current identity

```http
GET /v1/me
Authorization: Bearer dev_...
```

```json
{
  "projectId": "proj_...",
  "namespace": "user-...",
  "user": {"id":"usr_...","name":"用户甲"},
  "device": {"id":"dev_...","name":"甲的浏览器"}
}
```

## Get snapshot

```http
GET /v1/snapshots
Authorization: Bearer dev_...
```

- `200` snapshot envelope
- `401` missing/revoked token
- `404` no snapshot

```json
{
  "projectId": "proj_...",
  "namespace": "user-...",
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

`If-Match: "3"` is accepted as an alternative to `baseRevision`.

First write:

```json
{"baseRevision":0,"snapshot":{}}
```
