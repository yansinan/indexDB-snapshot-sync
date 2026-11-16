# Authentication

## Model

```text
user (project-scoped)
  └─ namespace  (the user's snapshot partition)
       └─ device token  (one per browser/device)
```

A browser proves it is a valid client with a **device token**. The token also tells
the server which user and namespace it belongs to.

## Pairing flow

```text
admin CLI
  node src/cli.js pair --project spellwell --user usr_...
        │ one-time code, 10 min by default
        ▼
browser
  POST /v1/auth/pair {code, deviceName}
        │
        ▼
server
  mark code used
  create device
  return deviceId + token (shown once)
        │
        ▼
browser stores token outside the synced snapshot
```

### Create a user

```bash
node src/cli.js user-create \
  --project spellwell \
  --name "Child A" \
  --namespace child-a
```

`namespace` is optional. If omitted, a random `user-xxxxxxxx` namespace is assigned.

### Create a pairing code

```bash
node src/cli.js pair \
  --project spellwell \
  --user usr_... \
  --ttl 10m
```

Codes:

- 8 characters, formatted `XXXX-XXXX`;
- one-time;
- 10 minutes by default;
- only their SHA-256 hash is stored;
- failed attempts are rate-limited in memory per IP.

### Exchange the code

```http
POST /v1/auth/pair
Content-Type: application/json

{"code":"ABCD-EFGH","deviceName":"Child A browser"}
```

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

The `token` is returned once. The server stores only its SHA-256 hash.

## Using the device token

```http
Authorization: Bearer dev_...
```

The server resolves:

```text
device.tokenHash
  → device
  → user
  → project + namespace
```

Client-supplied `userId`, `namespace`, or `project` must not be trusted for
authorization. Current API derives all three from the token.

## Browser storage

Store the token in a non-synced local location, for example:

```text
IndexedDB meta.sync.deviceToken
IndexedDB meta.sync.deviceId
```

Never put the token inside the snapshot passed to `PUT /v1/snapshots`; it would be
copied to other devices by design.

## Revocation

```bash
node src/cli.js devices --project spellwell
node src/cli.js revoke --device dev_...
```

Revocation sets `revokedAt`; all later requests with that token return `401`.
Other devices are unaffected.

## Security notes

- TLS is expected to be terminated by a reverse proxy (Caddy/Traefik).
- Device tokens are long-lived in v1; rotate by pairing a new device and revoking the old one.
- A token stored in JavaScript is exposed to XSS. For stronger browser security, move
  to HttpOnly cookies + same-origin deployment later.
- Pairing codes are short-lived and one-time, but rate limiting is in-memory and resets
  on restart.
- No passwords, JWT, OAuth server, or user database are required in v1.

## Migration from the old shared `SYNC_TOKEN`

The old shared token is removed from the sync path. To keep an existing snapshot that
was stored under `default`:

```bash
node src/cli.js user-create \
  --project spellwell \
  --name "Child A" \
  --namespace default
node src/cli.js pair --project spellwell --user usr_...
```

Then pair each browser and remove `SYNC_TOKEN` from the deployment environment.
