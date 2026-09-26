import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { Engine } from '../src/engine.js';
import { render } from '../src/template.js';
import { levelFromXp, xpForLevel } from '../src/game.js';
import { CARD_BY_ID } from '../src/cards.js';

let dir;
let engine;
let calls;

const fakePlatform = {
  notify: async (title, message) => calls.push(['notify', title, message]),
  openTarget: async (target) => calls.push(['open', target]),
  runCommand: async (command, env) => {
    calls.push(['command', command, env]);
    return { stdout: 'hi', stderr: '' };
  },
};

function makeEngine(now = () => new Date(2026, 8, 26, 14, 30)) {
  const store = new Store(path.join(dir, 'data'));
  return new Engine({ store, platform: fakePlatform, now });
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowforge-'));
  calls = [];
  engine = makeEngine();
});

afterEach(() => {
  engine.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('render fills nested placeholders and blanks unknown ones', () => {
  assert.equal(render('{{file.name}} at {{ time }}{{nope.x}}', { file: { name: 'a.pdf' }, time: '10:00' }), 'a.pdf at 10:00');
});

test('levels follow the XP curve', () => {
  assert.equal(levelFromXp(0), 1);
  assert.equal(levelFromXp(99), 1);
  assert.equal(levelFromXp(100), 2);
  assert.equal(levelFromXp(400), 3);
  assert.equal(xpForLevel(4), 900);
});

test('forging a combo validates cards and unlock levels', () => {
  assert.throws(() => engine.saveCombo({ name: '', trigger: { card: 'manual' }, actions: [] }), /name.*action/s);
  assert.throws(
    () => engine.saveCombo({ name: 'x', trigger: { card: 'page-changes', params: { url: 'https://a.b' } }, actions: [{ card: 'notify' }] }),
    /unlocks at level 4/,
  );
  assert.throws(() => engine.saveCombo({ name: 'x', trigger: { card: 'notify' }, actions: [{ card: 'notify' }] }), /Unknown trigger/);
});

test('a manual combo runs its actions, fills placeholders and earns XP', async () => {
  const combo = engine.saveCombo({
    name: 'Hello',
    trigger: { card: 'manual' },
    actions: [{ card: 'notify', params: { title: 'Hi', message: '{{combo.name}} on {{weekday}}' } }],
  });
  const result = await engine.fire(combo.id, {}, 'manual');
  assert.equal(result.status, 'ok');
  assert.deepEqual(calls[0], ['notify', 'Hi', 'Hello on Saturday']);
  assert.equal(combo.runs, 1);
  // run XP + "First Forge" + "It Lives!" achievements
  assert.equal(engine.store.profile.xp, 15 + 50 + 25);
  assert.deepEqual(engine.store.profile.achievements.sort(), ['first-forge', 'first-run']);
});

test('conditions can hold a combo back', async () => {
  const combo = engine.saveCombo({
    name: 'Filtered',
    trigger: { card: 'manual' },
    conditions: [{ card: 'text-contains', params: { text: '{{weekday}}', word: 'monday', mode: 'contains' } }],
    actions: [{ card: 'notify' }],
  });
  const result = await engine.fire(combo.id, {}, 'manual');
  assert.equal(result.status, 'skipped');
  assert.equal(calls.length, 0);
  assert.equal(combo.runs, 0);
});

test('time windows work across midnight', () => {
  const check = (h, from, to) => CARD_BY_ID.get('time-window').check({ from, to }, { now: new Date(2026, 0, 1, h) });
  assert.equal(check(23, '22:00', '06:00'), true);
  assert.equal(check(3, '22:00', '06:00'), true);
  assert.equal(check(12, '22:00', '06:00'), false);
  assert.equal(check(12, '09:00', '18:00'), true);
});

test('file combos move, rename and log files without overwriting', async () => {
  const inbox = path.join(dir, 'inbox');
  const sorted = path.join(dir, 'sorted');
  fs.mkdirSync(inbox);
  fs.mkdirSync(path.join(sorted, 'pdf'), { recursive: true });
  fs.writeFileSync(path.join(sorted, 'pdf', 'bill.pdf'), 'already here');
  const file = path.join(inbox, 'bill.pdf');
  fs.writeFileSync(file, 'new');

  const combo = engine.saveCombo({
    name: 'Sorter',
    trigger: { card: 'manual' },
    actions: [
      { card: 'move-file', params: { destination: path.join(sorted, '{{file.ext}}') } },
      { card: 'write-log', params: { file: path.join(dir, 'log.txt'), line: '{{file.name}} in {{file.dir}}' } },
    ],
  });
  const { fileInfo } = await import('../src/cards.js');
  const result = await engine.fire(combo.id, { file: fileInfo(file, fs.statSync(file)) }, 'manual');

  assert.equal(result.status, 'ok', result.error);
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.readFileSync(path.join(sorted, 'pdf', 'bill (1).pdf'), 'utf8'), 'new');
  assert.equal(fs.readFileSync(path.join(sorted, 'pdf', 'bill.pdf'), 'utf8'), 'already here');
  assert.equal(fs.readFileSync(path.join(dir, 'log.txt'), 'utf8'), `bill (1).pdf in ${path.join(sorted, 'pdf')}\n`);
});

test('file actions explain themselves when there is no file', async () => {
  const combo = engine.saveCombo({
    name: 'No file',
    trigger: { card: 'manual' },
    actions: [{ card: 'move-file', params: { destination: dir } }],
  });
  const result = await engine.fire(combo.id, {}, 'manual');
  assert.equal(result.status, 'error');
  assert.match(result.error, /needs a file/);
  assert.equal(combo.failures, 1);
});

test('shell commands receive file details as env vars, not templated text', async () => {
  engine.store.profile.xp = 10000;
  const combo = engine.saveCombo({
    name: 'Cmd',
    trigger: { card: 'manual' },
    actions: [{ card: 'run-command', params: { command: 'echo {{file.name}}' } }],
  });
  await engine.fire(combo.id, { file: { path: '/x/$(rm -rf).txt', name: '$(rm -rf).txt' } }, 'manual');
  const [, command, env] = calls[0];
  assert.equal(command, 'echo {{file.name}}');
  assert.equal(env.FF_FILE_NAME, '$(rm -rf).txt');
});

test('the File Appears trigger fires for new files and ignores our own writes', async () => {
  const inbox = path.join(dir, 'watch');
  const out = path.join(inbox, 'copies');
  fs.mkdirSync(inbox);
  engine.store.profile.xp = 10000;
  const combo = engine.saveCombo({
    name: 'Watcher',
    trigger: { card: 'file-appears', params: { folder: inbox, extensions: 'txt' } },
    // Copying back into the watched folder must not loop forever.
    actions: [{ card: 'copy-file', params: { destination: inbox } }, { card: 'copy-file', params: { destination: out } }],
  });
  assert.equal(engine.armErrors.get(combo.id), undefined);

  const done = new Promise((resolve) => {
    engine.on('event', (e) => e.type === 'activity' && e.entry.level === 'ok' && e.entry.comboId === combo.id && resolve());
  });
  fs.writeFileSync(path.join(inbox, 'ignored.jpg'), 'x');
  fs.writeFileSync(path.join(inbox, 'note.txt'), 'hello');
  await done;
  await new Promise((r) => setTimeout(r, 1500));

  assert.equal(combo.runs, 1);
  assert.deepEqual(fs.readdirSync(out), ['note.txt']);
  assert.ok(fs.existsSync(path.join(inbox, 'note (1).txt')));
});

test('Copycat fires for newly copied text, not what was already on the clipboard', async () => {
  const clips = ['already copied', 'already copied', 'https://example.com/cool', '   ', 'https://example.com/cool'];
  fakePlatform.readClipboard = async () => clips.shift() ?? 'https://example.com/cool';
  engine.store.profile.xp = 100;
  const logFile = path.join(dir, 'links.txt');
  const combo = engine.saveCombo({
    name: 'Link Collector',
    trigger: { card: 'clipboard' },
    conditions: [{ card: 'text-contains', params: { text: '{{clip.text}}', word: 'http', mode: 'contains' } }],
    actions: [{ card: 'write-log', params: { file: logFile, line: '{{clip.snippet}}' } }],
  });
  const { CLIPBOARD_POLL_MS } = await import('../src/cards.js');
  await new Promise((r) => setTimeout(r, CLIPBOARD_POLL_MS * 5.5));
  delete fakePlatform.readClipboard;

  assert.equal(combo.runs, 1);
  assert.equal(fs.readFileSync(logFile, 'utf8'), 'https://example.com/cool\n');
});

test('Copycat shows a clipboard problem on its combo, then clears it once fixed', async () => {
  let broken = true;
  fakePlatform.readClipboard = async () => {
    if (broken) throw new Error('Install xclip');
    return 'hello';
  };
  engine.store.profile.xp = 100;
  const combo = engine.saveCombo({ name: 'Clip', trigger: { card: 'clipboard' }, actions: [{ card: 'notify' }] });
  const armError = () => engine.snapshot().combos.find((c) => c.id === combo.id).armError;
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(armError(), 'Install xclip');

  broken = false;
  const { CLIPBOARD_POLL_MS } = await import('../src/cards.js');
  await new Promise((r) => setTimeout(r, CLIPBOARD_POLL_MS + 300));
  delete fakePlatform.readClipboard;
  assert.equal(armError(), null);
});

test('a missing watch folder is reported instead of crashing', () => {
  const combo = engine.saveCombo({
    name: 'Broken',
    trigger: { card: 'file-appears', params: { folder: path.join(dir, 'nope') } },
    actions: [{ card: 'notify' }],
  });
  assert.match(engine.snapshot().combos.find((c) => c.id === combo.id).armError, /Folder not found/);
});

test('progress survives a restart', async () => {
  const combo = engine.saveCombo({ name: 'Keep', trigger: { card: 'manual' }, actions: [{ card: 'notify' }] });
  await engine.fire(combo.id, {}, 'manual');
  engine.store.flush();
  const reloaded = makeEngine();
  assert.equal(reloaded.store.combos[0].runs, 1);
  assert.equal(reloaded.store.profile.xp, engine.store.profile.xp);
});

test('reaching a new level unlocks cards and announces them', async () => {
  engine.store.profile.xp = 95;
  const toasts = [];
  engine.on('event', (e) => e.type === 'toast' && toasts.push(e));
  const combo = engine.saveCombo({ name: 'Grind', trigger: { card: 'manual' }, actions: [{ card: 'notify' }] });
  await engine.fire(combo.id, {}, 'manual');
  const level = toasts.find((t) => t.kind === 'level');
  assert.ok(level, 'expected a level-up toast');
  assert.match(level.message, /Daily Ritual/);
});
