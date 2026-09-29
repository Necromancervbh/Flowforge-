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

test('each combo keeps its last 5 outcomes, newest first', async () => {
  const combo = engine.saveCombo({
    name: 'Picky',
    trigger: { card: 'manual' },
    conditions: [{ card: 'text-contains', params: { text: '{{file.name}}', word: 'yes', mode: 'contains' } }],
    actions: [{ card: 'move-file', params: { destination: path.join(dir, 'out') } }],
  });
  await engine.fire(combo.id, {}, 'manual'); // held back: no file name
  await engine.fire(combo.id, { file: { name: 'yes.txt', path: path.join(dir, 'missing', 'yes.txt') } }, 'manual'); // error
  for (let i = 0; i < 5; i++) {
    const file = path.join(dir, `yes-${i}.txt`);
    fs.writeFileSync(file, 'x');
    await engine.fire(combo.id, { file: { name: `yes-${i}.txt`, path: file } }, 'manual');
  }
  assert.equal(combo.history.length, 5);
  assert.deepEqual(combo.history.map((h) => h.status), ['ok', 'ok', 'ok', 'ok', 'ok']);
  assert.match(combo.history[0].text, /Moved yes-4\.txt/);

  const fresh = engine.saveCombo({ name: 'Fresh', trigger: { card: 'manual' }, conditions: combo.conditions, actions: combo.actions });
  await engine.fire(fresh.id, {}, 'manual');
  await engine.fire(fresh.id, { file: { name: 'yes.txt', path: path.join(dir, 'missing', 'yes.txt') } }, 'manual');
  assert.deepEqual(fresh.history.map((h) => h.status), ['error', 'skip']);
  assert.match(fresh.history[0].text, /Sorting Hat failed/);
});

test('Hourglass waits between actions, and is capped', async () => {
  const { MAX_WAIT_SECONDS } = await import('../src/cards.js');
  engine.store.profile.xp = 100;
  const combo = engine.saveCombo({
    name: 'Slow',
    trigger: { card: 'manual' },
    actions: [{ card: 'notify', params: { title: 'one' } }, { card: 'wait', params: { seconds: 1 } }, { card: 'notify', params: { title: 'two' } }],
  });
  const started = Date.now();
  const result = await engine.fire(combo.id, {}, 'manual');
  assert.equal(result.status, 'ok');
  assert.ok(Date.now() - started >= 950, 'should wait about a second');
  assert.deepEqual(calls.map((c) => c[1]), ['one', 'two']);
  assert.equal(result.summaries[1], 'Waited 1s');
  assert.equal(MAX_WAIT_SECONDS, 300);
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

test('Type Gate matches file extensions case-insensitively, with or without dots', () => {
  const check = (mode, types, name) => CARD_BY_ID.get('file-type').check({ mode, types }, { file: { path: `/x/${name}`, ext: name.split('.').pop().toLowerCase() } });
  assert.equal(check('is one of', 'pdf, .DOCX', 'Report.Docx'), true);
  assert.equal(check('is one of', 'pdf docx', 'photo.jpg'), false);
  assert.equal(check('is not one of', 'exe,msi', 'setup.EXE'), false);
  assert.equal(check('is not one of', 'exe,msi', 'notes.txt'), true);
  assert.throws(() => CARD_BY_ID.get('file-type').check({ mode: 'is one of', types: 'pdf' }, {}), /needs a file/);
});

test('Calendar Gate supports weekdays, weekends and a list of specific days', () => {
  const gate = CARD_BY_ID.get('day-type');
  const on = (y, m, d) => ({ now: new Date(y, m, d, 12) }); // 2026-09-28 is a Monday
  assert.equal(gate.check({ days: 'weekdays' }, on(2026, 8, 28)), true);
  assert.equal(gate.check({ days: 'weekends' }, on(2026, 8, 27)), true);
  assert.equal(gate.check({ days: 'these days', list: 'Mon, wednesday fri' }, on(2026, 8, 28)), true);
  assert.equal(gate.check({ days: 'these days', list: 'Mon, wednesday fri' }, on(2026, 8, 29)), false);
  assert.equal(gate.check({ days: 'these days', list: 'sun' }, on(2026, 8, 27)), true);
  assert.throws(() => gate.check({ days: 'these days', list: 'mon, funday' }, on(2026, 8, 28)), /"funday" is not a day/);
  assert.throws(() => gate.check({ days: 'these days', list: '' }, on(2026, 8, 28)), /at least one day/);
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

test('Compactor gzips a file and can delete the original', async () => {
  const zlib = await import('node:zlib');
  const { fileInfo } = await import('../src/cards.js');
  engine.store.profile.xp = 10000;
  const file = path.join(dir, 'server.log');
  const text = 'GET /index.html 200\n'.repeat(5000);
  fs.writeFileSync(file, text);
  const combo = engine.saveCombo({
    name: 'Squash',
    trigger: { card: 'manual' },
    actions: [
      { card: 'compress-file', params: { original: 'delete' } },
      { card: 'write-log', params: { file: path.join(dir, 'out.txt'), line: '{{file.name}}' } },
    ],
  });
  const result = await engine.fire(combo.id, { file: fileInfo(file, fs.statSync(file)) }, 'manual');
  assert.equal(result.status, 'ok', result.error);
  assert.match(result.summaries[0], /Compressed server\.log \(98 KB → .* B\)/);
  assert.equal(fs.existsSync(file), false);
  assert.equal(zlib.gunzipSync(fs.readFileSync(`${file}.gz`)).toString(), text);
  assert.equal(fs.readFileSync(path.join(dir, 'out.txt'), 'utf8'), 'server.log.gz\n', 'later cards see the .gz');
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

test('the File Appears trigger fires for new files and ignores our own writes', { timeout: 15000 }, async () => {
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
  // macOS (FSEvents) can miss files created the instant a watch starts.
  await new Promise((r) => setTimeout(r, 500));
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

test('Echo copies text, and Copycat ignores what Echo wrote (no loop)', async () => {
  let clipboard = 'already there';
  fakePlatform.readClipboard = async () => clipboard;
  fakePlatform.writeClipboard = async (text) => { clipboard = text; };
  engine.store.profile.xp = 100;
  const combo = engine.saveCombo({
    name: 'Shout',
    trigger: { card: 'clipboard' },
    actions: [{ card: 'copy-text', params: { text: 'You copied: {{clip.text}}' } }],
  });
  const { CLIPBOARD_POLL_MS } = await import('../src/cards.js');
  await new Promise((r) => setTimeout(r, 100));
  clipboard = 'hello';
  await new Promise((r) => setTimeout(r, CLIPBOARD_POLL_MS * 4.5));
  delete fakePlatform.readClipboard;
  delete fakePlatform.writeClipboard;

  assert.equal(clipboard, 'You copied: hello');
  assert.equal(combo.runs, 1, 'Echo output must not re-trigger Copycat');
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

test('Tripwire fires when a watched file is edited, but not for our own writes', { timeout: 20000 }, async () => {
  const { FILE_POLL_MS } = await import('../src/cards.js');
  const notes = path.join(dir, 'notes.txt');
  const backups = path.join(dir, 'backups');
  fs.writeFileSync(notes, 'v1');
  engine.store.profile.xp = 10000;
  const combo = engine.saveCombo({
    name: 'Backup notes',
    trigger: { card: 'file-changed', params: { file: notes } },
    actions: [
      { card: 'copy-file', params: { destination: backups } },
      // Logging into the watched file itself must not re-trigger the combo.
      { card: 'write-log', params: { file: notes, line: 'backed up at {{time}}' } },
    ],
  });
  assert.equal(engine.armErrors.get(combo.id), undefined);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(FILE_POLL_MS * 1.5);
  fs.writeFileSync(notes, 'v2 with more text');
  await wait(FILE_POLL_MS * 4);

  assert.equal(combo.runs, 1);
  assert.deepEqual(fs.readdirSync(backups), ['notes.txt']);
  assert.match(fs.readFileSync(path.join(backups, 'notes.txt'), 'utf8'), /^v2 with more text/);
});

test('Tripwire reports a missing file', () => {
  engine.store.profile.xp = 10000;
  const combo = engine.saveCombo({
    name: 'Ghost',
    trigger: { card: 'file-changed', params: { file: path.join(dir, 'nope.txt') } },
    actions: [{ card: 'notify' }],
  });
  assert.match(engine.snapshot().combos.find((c) => c.id === combo.id).armError, /File not found/);
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

test('daily streaks grow on consecutive days, reset after a gap and unlock achievements', async () => {
  let now = new Date(2026, 8, 28, 10, 0);
  engine.stop();
  engine = makeEngine(() => now);
  const combo = engine.saveCombo({ name: 'Daily', trigger: { card: 'manual' }, actions: [{ card: 'notify' }] });
  const runOn = async (y, m, d, h = 10) => {
    now = new Date(y, m, d, h);
    await engine.fire(combo.id, {}, 'manual');
  };
  const streak = () => engine.store.profile.stats.streak;

  await runOn(2026, 8, 28);
  await runOn(2026, 8, 28, 22); // same day: no change
  assert.equal(streak().current, 1);
  await runOn(2026, 8, 29);
  await runOn(2026, 8, 30);
  await runOn(2026, 9, 1); // across a month boundary
  assert.equal(streak().current, 4);
  assert.ok(engine.store.profile.achievements.includes('streak-3'));

  now = new Date(2026, 9, 2, 9);
  assert.equal(engine.snapshot().player.streak, 4, 'still alive the next day');
  now = new Date(2026, 9, 3, 9);
  assert.equal(engine.snapshot().player.streak, 0, 'broken after a missed day');

  await runOn(2026, 9, 3);
  assert.equal(streak().current, 1);
  assert.equal(streak().best, 4);
});

test('Card Collector counts distinct cards across successful runs', async () => {
  engine.store.profile.xp = 10000;
  const fire = async (actions, conditions = []) => {
    const combo = engine.saveCombo({ name: `c${Math.random()}`, trigger: { card: 'manual' }, conditions, actions });
    return engine.fire(combo.id, {}, 'manual');
  };
  await fire([{ card: 'notify' }, { card: 'notify' }]);
  assert.deepEqual(engine.store.profile.stats.cardsUsed.sort(), ['manual', 'notify']);

  // A held-back run doesn't count its cards.
  await fire([{ card: 'write-log', params: { file: path.join(dir, 'x.txt') } }],
    [{ card: 'text-contains', params: { text: 'a', word: 'b' } }]);
  assert.equal(engine.store.profile.stats.cardsUsed.length, 2);

  await fire(
    [{ card: 'write-log', params: { file: path.join(dir, 'x.txt') } }, { card: 'wait', params: { seconds: 1 } }],
    [{ card: 'time-window', params: { from: '00:00', to: '23:59' } }, { card: 'day-type', params: { days: 'weekends' } },
      { card: 'text-contains', params: { text: 'abc', word: 'b' } }],
  );
  engine.store.profile.stats.cardsUsed.push('copy-file', 'move-file', 'open-url'); // pretend earlier runs
  await fire([{ card: 'notify' }]);
  assert.ok(engine.store.profile.stats.cardsUsed.length >= 10);
  assert.ok(engine.store.profile.achievements.includes('cards-10'));
  assert.ok(!engine.store.profile.achievements.includes('cards-20'));
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
