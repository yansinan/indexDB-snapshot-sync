# Auth decision

Use opaque bearer tokens.

## Tokens

- `ADMIN_TOKEN`: deployment secret, only for creating/revoking project tokens.
- `project token`: one per project/namespace, used by browser sync clients.
- Generate 32 random bytes, encode base64url, show once.
- Store only `sha256(token)` on the server.

## Request

```http
Authorization: Bearer <project-token>
```

## Why not JWT

- no token server needed;
- revocation is immediate (delete/rotate hash);
- no signing key rotation;
- small scope, few clients;
- no claims/refresh flow required.

## Operational rules

- TLS terminated by a reverse proxy;
- CORS allowlist per project;
- rate limit per token/IP;
- request body limit;
- rotate tokens on device loss;
- never put tokens in URLs.
