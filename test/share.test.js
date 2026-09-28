import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeCombo, decodeCombo } from '../public/share.js';
import { CARDS, publicCard } from '../src/cards.js';

const cards = CARDS.map((c) => publicCard(c, 99));

const combo = {
  name: 'Räven ⚒️ alerts',
  trigger: { card: 'file-appears', params: { folder: '~/Downloads', extensions: 'pdf' } },
  conditions: [{ card: 'text-contains', params: { text: '{{file.name}}', word: 'invoice', mode: 'contains' } }],
  actions: [
    { card: 'move-file', params: { destination: '~/Documents/{{year}}' } },
    { card: 'discord', params: { webhook: 'https://discord.com/api/webhooks/secret', message: 'Got {{file.name}}' } },
  ],
};

test('a combo survives a share-code round trip, minus its secrets', () => {
  const { code, stripped } = encodeCombo(combo, cards);
  assert.match(code, /^FF1-[\w-]+$/);
  assert.equal(stripped, true);

  const back = decodeCombo(`  ${code}\n`, cards);
  assert.equal(back.name, combo.name);
  assert.deepEqual(back.trigger, combo.trigger);
  assert.deepEqual(back.conditions, combo.conditions);
  assert.deepEqual(back.actions[0], combo.actions[0]);
  assert.deepEqual(back.actions[1].params, { webhook: '', message: 'Got {{file.name}}' });
});

test('combos without secrets are not flagged as stripped', () => {
  const plain = { ...combo, actions: [combo.actions[0]] };
  assert.equal(encodeCombo(plain, cards).stripped, false);
});

test('bad share codes are rejected with a friendly message', () => {
  assert.throws(() => decodeCombo('hello', cards), /doesn't look like a FlowForge share code/);
  assert.throws(() => decodeCombo('FF1-!!!not-base64', cards), /damaged/);
  const unknown = encodeCombo({ ...combo, trigger: { card: 'teleport', params: {} } }, cards).code;
  assert.throws(() => decodeCombo(unknown, cards), /doesn't know \(teleport\)/);
  const wrongType = encodeCombo({ ...combo, trigger: { card: 'notify', params: {} } }, cards).code;
  assert.throws(() => decodeCombo(wrongType, cards), /doesn't know \(notify\)/);
});

test('unknown settings are dropped and missing ones get defaults', () => {
  const { code } = encodeCombo({
    name: 'x',
    trigger: { card: 'interval', params: { minutes: 5, evil: 'rm -rf' } },
    conditions: [],
    actions: [{ card: 'notify', params: {} }],
  }, cards);
  const back = decodeCombo(code, cards);
  assert.deepEqual(back.trigger.params, { minutes: 5 });
  assert.equal(back.actions[0].params.title, 'FlowForge');
});
