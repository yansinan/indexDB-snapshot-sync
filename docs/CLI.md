# Admin CLI

The CLI writes directly to `DATA_DIR/auth.json`. It is the admin interface for v1;
there is no public admin HTTP API.

## Commands

```bash
node src/cli.js help
node src/cli.js user-create --project <project> --name <name> [--namespace <ns>]
node src/cli.js users --project <project>
node src/cli.js pair --project <project> --user <user-id> [--ttl 10m]
node src/cli.js devices --project <project>
node src/cli.js revoke --device <device-id>
```

`DATA_DIR` defaults to `./data`.

## Example

```bash
export DATA_DIR=./data
node src/cli.js user-create --project spellwell --name "Child A" --namespace child-a
# {"id":"usr_...","project":"spellwell","name":"Child A","namespace":"child-a",...}

node src/cli.js pair --project spellwell --user usr_... --ttl 10m
# pairing code: ABCD-EFGH
# expires: ...
```

Give the pairing code to the browser once; the code cannot be reused.

## Docker

```bash
docker compose exec sync node src/cli.js users --project spellwell
docker compose exec sync node src/cli.js pair --project spellwell --user usr_...
```

## Notes

- `user-create` namespace must be unique within the project.
- Pairing codes are stored hashed.
- Device tokens are printed only by `POST /v1/auth/pair`, never by the CLI.
- `revoke` is immediate on the next request.
