# Auth decision

Use an opaque Bearer token (`SYNC_TOKEN`) for the first version.

## Why this is enough for v1

- one small self-hosted service;
- one family/small trusted group;
- immediate rotate/revoke by changing the env token;
- no user accounts, JWT, OAuth server, or signing-key rotation.

## Request

```http
Authorization: Bearer <SYNC_TOKEN>
```

## Future

If multiple projects need separate credentials, add a project-token table/file with
SHA-256 hashes and an `ADMIN_TOKEN`-protected token-management endpoint.

## Operational rules

- TLS terminated by a reverse proxy;
- CORS allowlist via `CORS_ORIGIN`;
- request body limit 8 MB;
- do not put tokens in URLs;
- rotate token on device loss;
- back up `DATA_DIR`.
