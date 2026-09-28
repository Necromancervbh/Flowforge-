// The card catalog. Every card has game stats (rarity, unlock level, seconds of
// manual work it saves) plus the code that makes it do something real.
//
//   trigger:   start({ params, fire, boot, helpers }) -> stop()
//   condition: check(params, ctx) -> boolean
//   action:    run(params, ctx, helpers) -> string (summary for the activity log)
//
// Settings are rendered with {{placeholders}} before a card sees them.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { expandHome, tildify } from './platform.js';

export const CLIPBOARD_POLL_MS = 1500;

const TEMP_FILE =/(\.(crdownload|part|partial|tmp|download|swp)$)|(^~\$)|(^\.)/i;

export function fileInfo(fullPath, stat) {
  const ext = path.extname(fullPath).slice(1).toLowerCase();
  const name = path.basename(fullPath);
  return {
    path: fullPath,
    name,
    base: ext ? name.slice(0, -(ext.length + 1)) : name,
    ext,
    dir: path.dirname(fullPath),
    size: stat ? stat.size : undefined,
  };
}

function parseMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) throw new Error(`"${hhmm}" is not a time like 18:30`);
  return Number(m[1]) * 60 + Number(m[2]);
}

function requireFile(ctx, cardName) {
  if (!ctx.file?.path) {
    throw new Error(`${cardName} needs a file. Pair it with the "File Appears" trigger.`);
  }
  return ctx.file.path;
}

function resolveFolder(folder) {
  const dir = expandHome(String(folder || '').trim());
  if (!dir) throw new Error('No folder chosen');
  return path.resolve(dir);
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

// "report.pdf" -> "report (1).pdf" when the name is taken.
export async function uniquePath(target) {
  const { dir, name, ext } = path.parse(target);
  let candidate = target;
  for (let i = 1; fs.existsSync(candidate); i++) {
    candidate = path.join(dir, `${name} (${i})${ext}`);
  }
  return candidate;
}

async function moveFile(from, to) {
  try {
    await fsp.rename(from, to);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    await fsp.copyFile(from, to);
    await fsp.unlink(from);
  }
}

// Wait until a new file stops growing (downloads, copies in progress).
async function waitUntilStable(file, { interval = 400, timeout = 30000 } = {}) {
  let last = -1;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    let stat;
    try {
      stat = await fsp.stat(file);
    } catch {
      return null;
    }
    if (stat.size === last) return stat;
    last = stat.size;
    await new Promise((r) => setTimeout(r, interval));
  }
  return fsp.stat(file).catch(() => null);
}

function htmlToText(html) {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const TRIGGERS = [
  {
    id: 'manual',
    name: 'Hand Play',
    emoji: '🖐️',
    rarity: 'common',
    unlock: 1,
    text: 'Fires when you press ▶ Play on the combo.',
    params: [],
    start: () => () => {},
  },
  {
    id: 'file-appears',
    name: 'File Appears',
    emoji: '📥',
    rarity: 'rare',
    unlock: 1,
    text: 'Fires when a new file lands in a folder (e.g. Downloads).',
    params: [
      { key: 'folder', label: 'Watch folder', type: 'text', default: '~/Downloads', required: true },
      { key: 'extensions', label: 'Only these types (optional)', type: 'text', placeholder: 'pdf, jpg, png' },
    ],
    start({ params, fire, helpers }) {
      const dir = resolveFolder(params.folder);
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        throw new Error(`Folder not found: ${tildify(dir)}`);
      }
      const exts = String(params.extensions || '')
        .split(/[\s,]+/)
        .map((e) => e.replace(/^\./, '').toLowerCase())
        .filter(Boolean);
      const pending = new Set();
      const lastFired = new Map();

      const watcher = fs.watch(dir, (_event, filename) => {
        if (!filename) return;
        const name = String(filename);
        if (TEMP_FILE.test(name)) return;
        const full = path.join(dir, name);
        if (pending.has(full) || helpers.wasWrittenByUs(full)) return;
        pending.add(full);
        waitUntilStable(full).then((stat) => {
          pending.delete(full);
          if (!stat || !stat.isFile()) return;
          const info = fileInfo(full, stat);
          if (exts.length && !exts.includes(info.ext)) return;
          const prev = lastFired.get(full);
          if (prev && Date.now() - prev < 5000) return;
          lastFired.set(full, Date.now());
          fire({ file: info });
        });
      });
      watcher.on('error', (err) => helpers.log('error', `Stopped watching ${dir}: ${err.message}`));
      return () => watcher.close();
    },
  },
  {
    id: 'interval',
    name: 'Ticking Clock',
    emoji: '⏱️',
    rarity: 'common',
    unlock: 1,
    text: 'Fires every N minutes.',
    params: [{ key: 'minutes', label: 'Every (minutes)', type: 'number', default: 30, min: 1, required: true }],
    start({ params, fire }) {
      const minutes = Math.max(1, Number(params.minutes) || 30);
      const timer = setInterval(() => fire({}), minutes * 60000);
      return () => clearInterval(timer);
    },
  },
  {
    id: 'daily',
    name: 'Daily Ritual',
    emoji: '🌅',
    rarity: 'rare',
    unlock: 2,
    text: 'Fires once a day at a set time.',
    params: [{ key: 'time', label: 'At (24h)', type: 'time', default: '09:00', required: true }],
    start({ params, fire }) {
      const target = parseMinutes(params.time);
      let lastDay = null;
      const tick = () => {
        const now = new Date();
        const today = now.toDateString();
        if (now.getHours() * 60 + now.getMinutes() === target && lastDay !== today) {
          lastDay = today;
          fire({});
        }
      };
      const timer = setInterval(tick, 15000);
      return () => clearInterval(timer);
    },
  },
  {
    id: 'clipboard',
    name: 'Copycat',
    emoji: '📋',
    rarity: 'rare',
    unlock: 2,
    text: 'Fires when you copy new text. Use {{clip.text}} in other cards.',
    params: [],
    start({ fire, problem, helpers }) {
      let last = null;
      let lastError = null;
      let busy = false;
      const poll = async () => {
        if (busy) return;
        busy = true;
        try {
          const text = (await helpers.platform.readClipboard()).slice(0, 10000);
          if (lastError) problem(null);
          lastError = null;
          // Blank copies are ignored; the first read is only a baseline so
          // what was already on the clipboard doesn't fire.
          if (text.trim() || last === null) {
            if (last !== null && text !== last) {
              fire({ clip: { text, snippet: text.trim().slice(0, 100) } });
            }
            last = text;
          }
        } catch (err) {
          if (err.message !== lastError) {
            helpers.log('error', `Copycat can't read the clipboard: ${err.message}`);
            problem(err.message);
          }
          lastError = err.message;
        } finally {
          busy = false;
        }
      };
      poll();
      const timer = setInterval(poll, CLIPBOARD_POLL_MS);
      return () => clearInterval(timer);
    },
  },
  {
    id: 'on-start',
    name: 'Power On',
    emoji: '🔌',
    rarity: 'common',
    unlock: 3,
    text: 'Fires once each time FlowForge starts (add FlowForge to your startup apps).',
    params: [],
    start({ fire, boot }) {
      if (!boot) return () => {};
      const timer = setTimeout(() => fire({}), 1500);
      return () => clearTimeout(timer);
    },
  },
  {
    id: 'page-changes',
    name: 'Web Watcher',
    emoji: '🔭',
    rarity: 'epic',
    unlock: 4,
    text: 'Checks a web page every N minutes and fires when its text changes.',
    params: [
      { key: 'url', label: 'Page URL', type: 'text', placeholder: 'https://example.com/prices', required: true },
      { key: 'minutes', label: 'Check every (minutes)', type: 'number', default: 15, min: 5, required: true },
    ],
    start({ params, fire, helpers }) {
      const url = String(params.url || '').trim();
      if (!/^https?:\/\//i.test(url)) throw new Error('Page URL must start with http:// or https://');
      const minutes = Math.max(5, Number(params.minutes) || 15);
      let lastHash = null;
      const check = async () => {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'FlowForge/0.1' } });
          const html = await res.text();
          const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '').trim();
          const text = htmlToText(html);
          const hash = crypto.createHash('sha1').update(text).digest('hex');
          if (lastHash && hash !== lastHash) {
            fire({ page: { url, title, text: text.slice(0, 5000), snippet: text.slice(0, 200) } });
          }
          lastHash = hash;
        } catch (err) {
          helpers.log('error', `Web Watcher could not load ${url}: ${err.message}`);
        }
      };
      check();
      const timer = setInterval(check, minutes * 60000);
      return () => clearInterval(timer);
    },
  },
];

const CONDITIONS = [
  {
    id: 'text-contains',
    name: 'Keyword Filter',
    emoji: '🔎',
    rarity: 'common',
    unlock: 1,
    text: 'Continue only if some text contains (or doesn\'t contain) a word.',
    params: [
      { key: 'text', label: 'Look in', type: 'text', default: '{{file.name}}', required: true },
      { key: 'word', label: 'Word', type: 'text', placeholder: 'invoice', required: true },
      { key: 'mode', label: 'Mode', type: 'select', options: ['contains', 'does not contain'], default: 'contains' },
    ],
    check(params) {
      const hit = String(params.text).toLowerCase().includes(String(params.word).toLowerCase());
      return params.mode === 'does not contain' ? !hit : hit;
    },
  },
  {
    id: 'time-window',
    name: 'Office Hours',
    emoji: '🕘',
    rarity: 'common',
    unlock: 2,
    text: 'Continue only between two times (works overnight too).',
    params: [
      { key: 'from', label: 'From', type: 'time', default: '09:00', required: true },
      { key: 'to', label: 'To', type: 'time', default: '18:00', required: true },
    ],
    check(params, ctx) {
      const now = ctx.now.getHours() * 60 + ctx.now.getMinutes();
      const from = parseMinutes(params.from);
      const to = parseMinutes(params.to);
      return from <= to ? now >= from && now < to : now >= from || now < to;
    },
  },
  {
    id: 'day-type',
    name: 'Calendar Gate',
    emoji: '📅',
    rarity: 'common',
    unlock: 2,
    text: 'Continue only on weekdays or only on weekends.',
    params: [{ key: 'days', label: 'Days', type: 'select', options: ['weekdays', 'weekends'], default: 'weekdays' }],
    check(params, ctx) {
      const weekend = [0, 6].includes(ctx.now.getDay());
      return params.days === 'weekends' ? weekend : !weekend;
    },
  },
  {
    id: 'file-type',
    name: 'Type Gate',
    emoji: '🧩',
    rarity: 'common',
    unlock: 1,
    text: 'Continue only if the file type is (or is not) in a list, e.g. pdf, docx.',
    params: [
      { key: 'mode', label: 'File type', type: 'select', options: ['is one of', 'is not one of'], default: 'is one of' },
      { key: 'types', label: 'Types', type: 'text', placeholder: 'pdf, docx, xlsx', required: true },
    ],
    check(params, ctx) {
      requireFile(ctx, 'Type Gate');
      const types = String(params.types).split(/[\s,]+/).map((t) => t.replace(/^\./, '').toLowerCase()).filter(Boolean);
      const hit = types.includes(ctx.file.ext);
      return params.mode === 'is not one of' ? !hit : hit;
    },
  },
  {
    id: 'file-size',
    name: 'Heavy Load',
    emoji: '⚖️',
    rarity: 'rare',
    unlock: 3,
    text: 'Continue only if the file is bigger / smaller than a size.',
    params: [
      { key: 'op', label: 'File is', type: 'select', options: ['bigger than', 'smaller than'], default: 'bigger than' },
      { key: 'mb', label: 'Size (MB)', type: 'number', default: 50, min: 0, required: true },
    ],
    check(params, ctx) {
      requireFile(ctx, 'Heavy Load');
      const mb = (ctx.file.size ?? fs.statSync(ctx.file.path).size) / 1024 / 1024;
      return params.op === 'smaller than' ? mb < Number(params.mb) : mb > Number(params.mb);
    },
  },
];

const ACTIONS = [
  {
    id: 'notify',
    name: 'Town Crier',
    emoji: '🔔',
    rarity: 'common',
    unlock: 1,
    saves: 5,
    text: 'Pop up a desktop notification.',
    params: [
      { key: 'title', label: 'Title', type: 'text', default: 'FlowForge', required: true },
      { key: 'message', label: 'Message', type: 'text', default: '{{combo.name}} ran at {{time}}' },
    ],
    async run(params, _ctx, helpers) {
      helpers.toast(params.title, params.message);
      await helpers.platform.notify(params.title, params.message);
      return `Notified: ${params.title}`;
    },
  },
  {
    id: 'move-file',
    name: 'Sorting Hat',
    emoji: '🎩',
    rarity: 'rare',
    unlock: 1,
    saves: 15,
    text: 'Move the file into a folder. Use {{year}}/{{month}} for dated sub-folders.',
    params: [{ key: 'destination', label: 'Move to folder', type: 'text', default: '~/Documents/Sorted/{{ext}}', required: true }],
    async run(params, ctx, helpers) {
      const src = requireFile(ctx, 'Sorting Hat');
      const dir = resolveFolder(params.destination);
      await fsp.mkdir(dir, { recursive: true });
      const dest = await uniquePath(path.join(dir, path.basename(src)));
      helpers.markWritten(dest);
      await moveFile(src, dest);
      ctx.file = fileInfo(dest, await fsp.stat(dest));
      return `Moved ${ctx.file.name} → ${tildify(dir)}`;
    },
  },
  {
    id: 'write-log',
    name: 'Scribe',
    emoji: '📜',
    rarity: 'common',
    unlock: 1,
    saves: 20,
    text: 'Append a line to a text file — a diary, tracker or CSV.',
    params: [
      { key: 'file', label: 'Log file', type: 'text', default: '~/Documents/flowforge-log.txt', required: true },
      { key: 'line', label: 'Line', type: 'text', default: '{{datetime}} {{combo.name}} {{file.name}}' },
    ],
    async run(params, _ctx, helpers) {
      const file = path.resolve(expandHome(params.file));
      await fsp.mkdir(path.dirname(file), { recursive: true });
      helpers.markWritten(file);
      await fsp.appendFile(file, `${params.line}\n`);
      return `Wrote a line to ${path.basename(file)}`;
    },
  },
  {
    id: 'open-url',
    name: 'Portal',
    emoji: '🌀',
    rarity: 'common',
    unlock: 2,
    saves: 10,
    text: 'Open a website in your browser.',
    params: [{ key: 'url', label: 'URL', type: 'text', placeholder: 'https://', required: true }],
    async run(params, _ctx, helpers) {
      const url = String(params.url).trim();
      if (!/^https?:\/\//i.test(url)) throw new Error('URL must start with http:// or https://');
      await helpers.platform.openTarget(url);
      return `Opened ${url}`;
    },
  },
  {
    id: 'open-file',
    name: 'Summon',
    emoji: '📂',
    rarity: 'common',
    unlock: 2,
    saves: 10,
    text: 'Open a file, folder or app with its default program.',
    params: [{ key: 'path', label: 'File / folder / app', type: 'text', default: '{{file.path}}', required: true }],
    async run(params, _ctx, helpers) {
      const target = path.resolve(expandHome(String(params.path).trim()));
      if (!fs.existsSync(target)) throw new Error(`Nothing at ${target}`);
      await helpers.platform.openTarget(target);
      return `Opened ${path.basename(target)}`;
    },
  },
  {
    id: 'copy-file',
    name: 'Mirror Image',
    emoji: '🪞',
    rarity: 'rare',
    unlock: 3,
    saves: 15,
    text: 'Copy the file into a folder (a quick backup).',
    params: [{ key: 'destination', label: 'Copy to folder', type: 'text', default: '~/Documents/Backup', required: true }],
    async run(params, ctx, helpers) {
      const src = requireFile(ctx, 'Mirror Image');
      const dir = resolveFolder(params.destination);
      await fsp.mkdir(dir, { recursive: true });
      const dest = await uniquePath(path.join(dir, path.basename(src)));
      helpers.markWritten(dest);
      await fsp.copyFile(src, dest);
      return `Copied ${path.basename(src)} → ${tildify(dir)}`;
    },
  },
  {
    id: 'compress-file',
    name: 'Compactor',
    emoji: '🗜️',
    rarity: 'rare',
    unlock: 3,
    saves: 20,
    text: 'Squeeze the file into a .gz next to it. Great for big logs and exports.',
    params: [
      { key: 'original', label: 'Original file', type: 'select', options: ['keep', 'delete'], default: 'keep' },
    ],
    async run(params, ctx, helpers) {
      const src = requireFile(ctx, 'Compactor');
      if (src.toLowerCase().endsWith('.gz')) return `${path.basename(src)} is already compressed`;
      const dest = await uniquePath(`${src}.gz`);
      helpers.markWritten(dest);
      await pipeline(fs.createReadStream(src), zlib.createGzip(), fs.createWriteStream(dest));
      const before = (await fsp.stat(src)).size;
      const after = (await fsp.stat(dest)).size;
      if (params.original === 'delete') {
        await fsp.unlink(src);
        ctx.file = fileInfo(dest, await fsp.stat(dest));
      }
      return `Compressed ${path.basename(src)} (${formatBytes(before)} → ${formatBytes(after)})`;
    },
  },
  {
    id: 'rename-file',
    name: 'True Name',
    emoji: '🏷️',
    rarity: 'rare',
    unlock: 3,
    saves: 15,
    text: 'Rename the file, e.g. {{date}} {{file.name}}.',
    params: [{ key: 'name', label: 'New name', type: 'text', default: '{{date}} {{file.name}}', required: true }],
    async run(params, ctx, helpers) {
      const src = requireFile(ctx, 'True Name');
      const name = String(params.name).trim().replace(/[\\/:*?"<>|]/g, '-');
      if (!name) throw new Error('New name is empty');
      const dest = await uniquePath(path.join(path.dirname(src), name));
      helpers.markWritten(dest);
      await fsp.rename(src, dest);
      ctx.file = fileInfo(dest, await fsp.stat(dest));
      return `Renamed to ${ctx.file.name}`;
    },
  },
  {
    id: 'discord',
    name: 'Raven',
    emoji: '🐦‍⬛',
    rarity: 'epic',
    unlock: 4,
    saves: 30,
    text: 'Send a message to a Discord channel via webhook.',
    params: [
      { key: 'webhook', label: 'Webhook URL', type: 'text', placeholder: 'https://discord.com/api/webhooks/…', required: true, secret: true },
      { key: 'message', label: 'Message', type: 'text', default: '⚒️ {{combo.name}} fired at {{time}}' },
    ],
    async run(params) {
      const url = String(params.webhook).trim();
      if (!/^https:\/\/(\w+\.)?discord(app)?\.com\/api\/webhooks\//.test(url)) {
        throw new Error('That is not a Discord webhook URL');
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: String(params.message).slice(0, 2000) || '(empty)' }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`Discord said ${res.status}`);
      return 'Sent a Discord message';
    },
  },
  {
    id: 'run-command',
    name: 'Arcane Command',
    emoji: '🪄',
    rarity: 'legendary',
    unlock: 5,
    saves: 30,
    raw: ['command'],
    text: 'Run a shell command. File details are in $FF_FILE_PATH, $FF_FILE_NAME (%FF_FILE_PATH% on Windows).',
    params: [{ key: 'command', label: 'Command', type: 'text', placeholder: 'echo "$FF_FILE_NAME"', required: true }],
    async run(params, ctx, helpers) {
      const env = {
        FF_COMBO: ctx.combo?.name ?? '',
        FF_FILE_PATH: ctx.file?.path ?? '',
        FF_FILE_NAME: ctx.file?.name ?? '',
        FF_FILE_EXT: ctx.file?.ext ?? '',
        FF_PAGE_URL: ctx.page?.url ?? '',
      };
      const { stdout } = await helpers.platform.runCommand(params.command, env);
      return stdout ? `Command said: ${stdout.slice(0, 200)}` : 'Command finished';
    },
  },
];

for (const card of TRIGGERS) card.type = 'trigger';
for (const card of CONDITIONS) card.type = 'condition';
for (const card of ACTIONS) card.type = 'action';

export const CARDS = [...TRIGGERS, ...CONDITIONS, ...ACTIONS];
export const CARD_BY_ID = new Map(CARDS.map((c) => [c.id, c]));

// What the browser sees: stats and settings, no functions.
export function publicCard(card, playerLevel) {
  const { start, check, run, ...rest } = card;
  return { ...rest, unlocked: playerLevel >= card.unlock };
}
