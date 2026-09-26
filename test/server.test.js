import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { Engine } from '../src/engine.js';
import { createServer } from '../src/server.js';

let dir;
let server;
let base;
let engine;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowforge-srv-'));
  engine = new Engine({ store: new Store(dir), platform: { notify: async () => {}, openTarget: async () => {}, runCommand: async () => ({}) } });
  server = createServer(engine, { port: 0 });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  // createServer was told port 0, so rebuild with the real port for the Host allow-list.
  server.close();
  server = createServer(engine, { port });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  base = `http://127.0.0.1:${port}`;
});

after(() => {
  server.close();
  engine.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

const headers = { 'content-type': 'application/json', 'x-flowforge': '1' };

test('serves the UI and state', async () => {
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /FlowForge/);
  const state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.player.level, 1);
  assert.ok(state.cards.some((c) => c.id === 'file-appears' && c.unlocked));
  assert.ok(state.cards.every((c) => !('run' in c) && !('start' in c)));
});

test('rejects writes without the X-FlowForge header (cross-site requests)', async () => {
  const res = await fetch(`${base}/api/combos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 403);
});

test('rejects foreign Host headers (DNS rebinding)', async () => {
  const http = await import('node:http');
  const status = await new Promise((resolve) => {
    http.get(`${base}/api/state`, { headers: { host: 'evil.example:80' } }, (res) => resolve(res.statusCode));
  });
  assert.equal(status, 403);
});

test('does not serve files outside public/', async () => {
  const res = await fetch(`${base}/..%2Fpackage.json`);
  assert.notEqual(res.status, 200);
});

test('create, play, pause and delete a combo over the API', async () => {
  const body = JSON.stringify({ name: 'API combo', trigger: { card: 'manual' }, actions: [{ card: 'notify' }] });
  const created = await fetch(`${base}/api/combos`, { method: 'POST', headers, body });
  assert.equal(created.status, 201);
  const { id } = await created.json();

  const played = await (await fetch(`${base}/api/combos/${id}/play`, { method: 'POST', headers })).json();
  assert.equal(played.status, 'ok');

  const paused = await (await fetch(`${base}/api/combos/${id}/enabled`, { method: 'POST', headers, body: '{"enabled":false}' })).json();
  assert.equal(paused.enabled, false);

  const bad = await fetch(`${base}/api/combos/${id}`, { method: 'PUT', headers, body: '{"name":""}' });
  assert.equal(bad.status, 400);

  assert.equal((await fetch(`${base}/api/combos/${id}`, { method: 'DELETE', headers })).status, 200);
  assert.equal((await fetch(`${base}/api/combos/${id}/play`, { method: 'POST', headers })).status, 404);
});
