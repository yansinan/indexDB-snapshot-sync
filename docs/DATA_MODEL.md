# Data model

## auth.json

One small JSON file in `DATA_DIR`.

```json
{
  "version": 1,
  "users": [
    {
      "id": "usr_...",
      "projectId": "proj_...",
      "name": "用户甲",
      "namespace": "user-...",
      "createdAt": "2026-11-16T15:00:00.000Z"
    }
  ],
  "pairingCodes": [
    {
      "id": "pair_...",
      "codeHash": "sha256...",
      "projectId": "proj_...",
      "userId": "usr_...",
      "expiresAt": "2026-11-16T15:10:00.000Z",
      "usedAt": null,
      "createdAt": "2026-11-16T15:00:00.000Z"
    }
  ],
  "devices": [
    {
      "id": "dev_...",
      "projectId": "proj_...",
      "userId": "usr_...",
      "name": "甲的浏览器",
      "tokenHash": "sha256...",
      "createdAt": "2026-11-16T15:01:00.000Z",
      "lastSeenAt": null,
      "revokedAt": null
    }
  ]
}
```

No plaintext pairing codes or device tokens are stored.

`projectId` is generated server-side as `proj_` + 128 random bits. There is no
`projects` table; a project exists while at least one user references it.

## Snapshot file

`DATA_DIR/projects/<projectId>/<namespace>/snapshot.json`

```json
{
  "projectId": "proj_...",
  "namespace": "user-...",
  "revision": 1,
  "hash": "sha256...",
  "updatedAt": "2026-11-16T15:02:00.000Z",
  "snapshot": {}
}
```

`snapshot` is opaque and comes from the client's `exportAll()`.

## Ownership

```text
deviceToken → device → user → projectId + namespace
```

The device token, not a request parameter, determines snapshot scope.

## Bootstrap code

Not stored in `auth.json`. It lives only in process memory as a hash and is printed
to the server log once at startup and once after each successful project creation.
