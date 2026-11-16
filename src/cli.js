#!/usr/bin/env node
/**
 * Local admin CLI. This is the only way to create users/pairing codes in v1.
 * It writes files under DATA_DIR directly; keep it on a trusted host.
 */

import { AuthStore } from './auth-store.js';

const dataDir = process.env.DATA_DIR ?? './data';
const store = new AuthStore(dataDir);
const argv = process.argv.slice(2);
const command = argv[0];
const options = {};
for (let index = 1; index < argv.length; index += 1) {
  const token = argv[index];
  if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
  const key = token.slice(2);
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`missing value for --${key}`);
  options[key] = value;
  index += 1;
}

function required(name) {
  if (!options[name]) throw new Error(`--${name} is required`);
  return options[name];
}

function parseTtl(value) {
  const match = /^(\d+)(m|h|d)$/.exec(value ?? '10m');
  if (!match) throw new Error('--ttl must look like 10m, 1h, or 1d');
  const unit = { m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  return Number(match[1]) * unit;
}

function usage() {
  console.log(`indexDB-snapshot-sync CLI

Usage:
  node src/cli.js user-create --project <id> --name <name> [--namespace <ns>]
  node src/cli.js users --project <id>
  node src/cli.js pair --project <id> --user <user-id> [--ttl 10m]
  node src/cli.js devices --project <id>
  node src/cli.js revoke --device <device-id>

Environment:
  DATA_DIR  storage directory (default: ./data)

The pairing command prints a one-time code. The browser exchanges it at
POST /v1/auth/pair and receives its own device token.
`);
}

async function main() {
  if (!command || command === 'help' || command === '--help') {
    usage();
    return;
  }
  if (command === 'user-create') {
    const user = await store.createUser({
      project: required('project'),
      name: required('name'),
      namespace: options.namespace,
    });
    console.log(JSON.stringify(user, null, 2));
    return;
  }
  if (command === 'users') {
    const users = await store.listUsers(required('project'));
    console.table(users.map(({ id, project, name, namespace, createdAt }) => ({ id, project, name, namespace, createdAt })));
    return;
  }
  if (command === 'pair') {
    const result = await store.createPairingCode({
      project: required('project'),
      userId: required('user'),
      ttlMs: parseTtl(options.ttl),
    });
    console.log(`pairing code: ${result.code}`);
    console.log(`expires:      ${result.expiresAt}`);
    console.log('Use it once at POST /v1/auth/pair.');
    return;
  }
  if (command === 'devices') {
    const devices = await store.listDevices(required('project'));
    console.table(devices.map(({ id, userId, name, createdAt, lastSeenAt, revokedAt }) => ({
      id, userId, name, createdAt, lastSeenAt: lastSeenAt ?? '', revokedAt: revokedAt ?? '',
    })));
    return;
  }
  if (command === 'revoke') {
    const device = await store.revokeDevice(required('device'));
    console.log(`revoked: ${device.id}`);
    return;
  }
  throw new Error(`unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`error: ${error.code ?? error.name}: ${error.message}`);
  process.exitCode = 1;
});
