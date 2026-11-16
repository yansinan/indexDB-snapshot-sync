# Data model

## auth.json

```json
{
  "version": 1,
  "users": [
    {
      "id": "usr_...",
      "project": "spellwell",
      "name": "Child A",
      "namespace": "child-a",
      "createdAt": "2026-11-16T15:00:00.000Z"
    }
  ],
  "pairingCodes": [
    {
      "id": "pair_...",
      "codeHash": "sha256...",
      "project": "spellwell",
      "userId": "usr_...",
      "expiresAt": "2026-11-16T15:10:00.000Z",
      "usedAt": null,
      "createdAt": "2026-11-16T15:00:00.000Z"
    }
  ],
  "devices": [
    {
      "id": "dev_...",
      "project": "spellwell",
      "userId": "usr_...",
      "name": "Child A browser",
      "tokenHash": "sha256...",
      "createdAt": "2026-11-16T15:01:00.000Z",
      "lastSeenAt": null,
      "revokedAt": null
    }
  ]
}
```

No plaintext pairing codes or device tokens are stored.

## Snapshot file

`DATA_DIR/projects/<project>/<namespace>/snapshot.json`

```json
{
  "project": "spellwell",
  "namespace": "child-a",
  "revision": 1,
  "hash": "sha256...",
  "updatedAt": "2026-11-16T15:02:00.000Z",
  "snapshot": {}
}
```

`snapshot` is opaque to the server and comes from the client's `exportAll()`.

## Ownership

```text
device → user → project + namespace
```

The token, not the request URL, determines the snapshot scope.
