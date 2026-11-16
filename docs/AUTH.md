# Authentication

## Three credentials

```text
bootstrapCode
  → create a new project

projectId
  → create a new user inside an existing project

pairingCode
  → add a device to an existing user
```

All three are exchangeable at `POST /v1/enroll` for a **deviceToken**.

```text
deviceToken
  → identifies device + user + project + namespace
```

## 1. Bootstrap code

Created when the server starts:

```text
[bootstrap] project creation code:
[bootstrap] BOOT-...
```

- 128-bit random value;
- only its SHA-256 hash is kept in memory;
- no database and no API to retrieve it;
- one use;
- valid until used or process restart;
- after successful project creation it is rotated and the new code is printed.

Request:

```http
POST /v1/enroll
Content-Type: application/json

{
  "bootstrapCode": "BOOT-...",
  "userName": "用户甲",
  "deviceName": "甲的浏览器"
}
```

Success creates:

```text
projectId (server-generated)
user 甲
device 1
deviceToken
```

The old bootstrap code is invalid after success.

### Lost bootstrap code

```bash
docker compose restart sync
docker compose logs sync | grep -A2 'project creation code'
```

Existing projects, users, and device tokens are not affected.

## 2. Project ID

A project is not a table; it exists while one or more users reference its
`projectId`.

```http
POST /v1/enroll
Content-Type: application/json

{
  "projectId": "proj_...",
  "userName": "用户乙",
  "deviceName": "乙的浏览器"
}
```

- projectId is a server-generated, unguessable join capability;
- anyone who knows it can create a **new user** in that project;
- it cannot read an existing user's data;
- it cannot join an existing user (that requires a pairing code).

## 3. Pairing code

Any enrolled device can generate a code for its own user:

```http
POST /v1/pairing-codes
Authorization: Bearer dev_...
Content-Type: application/json

{"ttlSeconds":600}
```

Response:

```json
{"code":"ABCD-EFGH","expiresAt":"..."}
```

A new browser exchanges it:

```http
POST /v1/enroll
Content-Type: application/json

{"pairingCode":"ABCD-EFGH","deviceName":"甲的 iPad"}
```

The new device receives:

```json
{
  "projectId": "proj_...",
  "deviceToken": "dev_...",
  "user": {"id":"usr_甲","name":"用户甲"},
  "device": {"id":"dev_...","name":"甲的 iPad"}
}
```

Pairing codes:

- one-time;
- short TTL;
- only hashed at rest;
- only join an existing user;
- never create a new user or project.

Every device of the user has equal ability to generate pairing codes.

## Browser storage

Store only local, non-synced values:

```text
meta.sync.projectId
meta.sync.deviceId
meta.sync.deviceToken
```

Never put `deviceToken` inside the snapshot payload. It must not be synchronized to
other devices.

## Revocation

There is no admin HTTP endpoint in v1. A directly accessible Node CLI is not part of
the public API. Device revocation is a future admin operation; for now the file-backed
store supports `AuthStore.revokeDevice()` for tests/operations.

When adding a revocation API later, it must be separately authenticated and must not
use the device token of the device being revoked.

## Security notes

- TLS is expected to be terminated by a reverse proxy.
- Device tokens are long-lived until revoked.
- A token in JavaScript is exposed to XSS; HttpOnly cookie mode is a later option.
- Bootstrap codes are printed in server logs: protect log access.
- Pairing and enrollment attempts are rate-limited in memory; limits reset on restart.
- No passwords, JWT, OAuth server, or admin token are required in v1.

## Lost-response edge case

If project creation succeeds but the HTTP response is lost, the bootstrap code has
already rotated and the client did not receive the device token. v1 accepts this
small failure window; a future idempotency key can close it.
