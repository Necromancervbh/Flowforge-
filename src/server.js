#!/usr/bin/env node
// FlowForge: runs the automation engine and serves the card-game UI on
// http://localhost:4777. Only listens on 127.0.0.1.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { Engine } from './engine.js';
import { openTarget, expandHome } from './platform.js';
import { fileInfo } from './cards.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
const MAX_BODY = 256 * 1024;

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Request too large'), { status: 413 }));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

export function createServer(engine, { port }) {
  const allowedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
  const clients = new Set();

  engine.on('event', (event) => {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of clients) res.write(data);
  });

  const api = async (req, res, url) => {
    // Browsers send a CORS preflight for custom headers, which we never
    // approve, so other websites can't drive the engine.
    if (req.method !== 'GET' && req.headers['x-flowforge'] !== '1') {
      return send(res, 403, { error: 'Missing X-FlowForge header' });
    }
    const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

    if (req.method === 'GET' && url.pathname === '/api/state') return send(res, 200, engine.snapshot());

    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write('retry: 2000\n\n');
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => {
        clearInterval(ping);
        clients.delete(res);
      });
      return;
    }

    if (parts[1] === 'combos') {
      const id = parts[2];
      if (req.method === 'POST' && !id) return send(res, 201, engine.saveCombo(await readJson(req)));
      if (req.method === 'PUT' && id && !parts[3]) return send(res, 200, engine.saveCombo(await readJson(req), id));
      if (req.method === 'DELETE' && id) {
        return engine.deleteCombo(id) ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Combo not found' });
      }
      if (req.method === 'POST' && parts[3] === 'play') {
        if (!engine.store.combos.some((c) => c.id === id)) return send(res, 404, { error: 'Combo not found' });
        // Optional test file, so file combos can be played by hand.
        const { file } = await readJson(req);
        const extra = {};
        if (file) {
          const full = path.resolve(expandHome(String(file).trim().replace(/^["']|["']$/g, '')));
          const stat = fs.statSync(full, { throwIfNoEntry: false });
          if (!stat?.isFile()) return send(res, 400, { error: `No file at ${full}` });
          extra.file = fileInfo(full, stat);
        }
        return send(res, 200, await engine.fire(id, extra, 'manual'));
      }
      if (req.method === 'POST' && parts[3] === 'enabled') {
        const { enabled } = await readJson(req);
        const combo = engine.setEnabled(id, enabled);
        return combo ? send(res, 200, combo) : send(res, 404, { error: 'Combo not found' });
      }
    }
    return send(res, 404, { error: 'Not found' });
  };

  const serveStatic = (res, pathname) => {
    const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
    const file = path.resolve(PUBLIC_DIR, rel);
    if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
    fs.readFile(file, (err, body) => {
      if (err) return send(res, 404, 'Not found', 'text/plain');
      send(res, 200, body, MIME[path.extname(file)] || 'application/octet-stream');
    });
  };

  return http.createServer(async (req, res) => {
    // Rejecting unknown Host headers blocks DNS-rebinding attacks.
    if (!allowedHosts.has(req.headers.host)) return send(res, 403, { error: 'Forbidden host' });
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else if (req.method === 'GET') serveStatic(res, url.pathname);
      else send(res, 405, { error: 'Method not allowed' });
    } catch (err) {
      if (!res.headersSent) send(res, err.status || 500, { error: err.message });
    }
  });
}

async function main() {
  const port = Number(process.env.PORT) || 4777;
  const dataDir = process.env.FLOWFORGE_DATA || path.join(os.homedir(), '.flowforge');
  const store = new Store(dataDir);
  const engine = new Engine({ store });
  engine.on('event', (e) => {
    if (e.type === 'activity') console.log(`[${e.entry.level}] ${e.entry.message}`);
  });

  const server = createServer(engine, { port });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is busy. Is FlowForge already running? Try PORT=4778 npm start`);
      process.exit(1);
    }
    throw err;
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}`;
    console.log(`⚒️  FlowForge is running at ${url}  (saves in ${dataDir})`);
    engine.start();
    if (!process.argv.includes('--no-open')) openTarget(url).catch(() => {});
  });

  const shutdown = () => {
    engine.stop();
    store.flush();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
