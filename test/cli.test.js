import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseCli } from '../src/server.js';

const SERVER = fileURLToPath(new URL('../src/server.js', import.meta.url));
const cli = (...args) => spawnSync(process.execPath, [SERVER, ...args], { encoding: 'utf8', timeout: 10000 });

test('defaults, environment variables, then flags', () => {
  assert.deepEqual(parseCli([], {}), {
    port: 4777, dataDir: path.join(os.homedir(), '.flowforge'), open: true, help: false, version: false,
  });
  const env = { PORT: '5000', FLOWFORGE_DATA: '/tmp/ff-env' };
  assert.equal(parseCli([], env).port, 5000);
  assert.equal(parseCli([], env).dataDir, path.resolve('/tmp/ff-env'));
  const flags = parseCli(['-p', '6000', '--data', '~/ff', '--no-open'], env);
  assert.equal(flags.port, 6000);
  assert.equal(flags.dataDir, path.join(os.homedir(), 'ff'));
  assert.equal(flags.open, false);
});

test('bad ports and unknown flags are rejected', () => {
  assert.throws(() => parseCli(['--port', 'abc'], {}), /not a valid port/);
  assert.throws(() => parseCli(['--port', '70000'], {}), /not a valid port/);
  assert.throws(() => parseCli(['--bogus'], {}), /Unknown option/);
});

test('--help, --version and bad flags from the real command line', () => {
  const help = cli('--help');
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage: flowforge/);

  const version = cli('-v');
  assert.equal(version.status, 0);
  assert.match(version.stdout.trim(), /^\d+\.\d+\.\d+$/);

  const bad = cli('--port', 'nope');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /not a valid port/);
});
