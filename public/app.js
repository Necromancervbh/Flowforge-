// FlowForge UI: collection, forge (combo builder), combos, log and toasts.

import { art } from './art.js';
import { encodeCombo, decodeCombo } from './share.js';

const $ = (sel) => document.querySelector(sel);

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const TYPE_LABEL = { trigger: 'WHEN', condition: 'IF', action: 'THEN' };

const VARS = [
  'file.name', 'file.base', 'file.ext', 'file.path', 'file.dir',
  'date', 'time', 'datetime', 'year', 'month', 'day', 'weekday',
  'combo.name', 'clip.text', 'clip.snippet', 'battery.percent', 'network.offlineFor', 'idle.awayFor', 'page.url', 'page.title', 'page.snippet',
];

const RECIPES = [
  {
    emoji: '🧹', name: 'Downloads Sorter', blurb: 'New downloads go into folders by file type.',
    trigger: { card: 'file-appears', params: { folder: '~/Downloads', extensions: '' } },
    conditions: [],
    actions: [
      { card: 'move-file', params: { destination: '~/Downloads/Sorted/{{file.ext}}' } },
      { card: 'notify', params: { title: 'Sorted 🧹', message: '{{file.name}} → {{file.ext}}' } },
    ],
  },
  {
    emoji: '🧾', name: 'Invoice Catcher', blurb: 'PDFs named "invoice" get filed by year and logged.',
    trigger: { card: 'file-appears', params: { folder: '~/Downloads', extensions: 'pdf' } },
    conditions: [{ card: 'text-contains', params: { text: '{{file.name}}', word: 'invoice', mode: 'contains' } }],
    actions: [
      { card: 'move-file', params: { destination: '~/Documents/Invoices/{{year}}' } },
      { card: 'write-log', params: { file: '~/Documents/Invoices/invoices.txt', line: '{{date}}  {{file.name}}' } },
    ],
  },
  {
    emoji: '📸', name: 'Screenshot Stash', blurb: 'Screenshots leave the Desktop for a monthly folder.',
    trigger: { card: 'file-appears', params: { folder: '~/Desktop', extensions: 'png, jpg' } },
    conditions: [{ card: 'text-contains', params: { text: '{{file.name}}', word: 'screenshot', mode: 'contains' } }],
    actions: [{ card: 'move-file', params: { destination: '~/Pictures/Screenshots/{{year}}-{{month}}' } }],
  },
  {
    emoji: '🧘', name: 'Stretch Break', blurb: 'A nudge to stand up every 50 minutes.',
    trigger: { card: 'interval', params: { minutes: 50 } },
    conditions: [],
    actions: [{ card: 'notify', params: { title: 'Stretch break 🧘', message: 'Stand up, look away from the screen, drink water.' } }],
  },
  {
    emoji: '🔗', name: 'Link Collector', blurb: 'Every link you copy is saved to links.txt.',
    trigger: { card: 'clipboard', params: {} },
    conditions: [{ card: 'text-contains', params: { text: '{{clip.text}}', word: 'http', mode: 'contains' } }],
    actions: [{ card: 'write-log', params: { file: '~/Documents/links.txt', line: '{{datetime}}  {{clip.snippet}}' } }],
  },
  {
    emoji: '🍀', name: 'Surprise Break', blurb: 'Once an hour, a 1-in-4 chance of a break reminder.',
    trigger: { card: 'interval', params: { minutes: 60 } },
    conditions: [{ card: 'lucky-charm', params: { chance: 25 } }],
    actions: [{ card: 'notify', params: { title: 'Surprise break 🍀', message: 'Lucky you: stretch, grab a snack, take five.' } }],
  },
];

// The player level a recipe needs: the highest unlock level among its cards.
function recipeLevel(recipe) {
  return Math.max(...[recipe.trigger, ...recipe.conditions, ...recipe.actions].map((s) => cardById(s.card)?.unlock ?? 1));
}

let state = null;
let filter = 'all';
let forge = emptyForge();
let lastFocusedInput = null;
let lastTestFile = '';

function emptyForge() {
  return { editingId: null, name: '', trigger: null, conditions: [], actions: [] };
}

const cardById = (id) => state.cards.find((c) => c.id === id);

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', 'x-flowforge': '1' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function refresh() {
  const previousLevel = state?.player.level;
  state = await api('GET', '/api/state');
  renderPlayer(previousLevel);
  renderCollection();
  renderCombos();
  renderActivity();
  renderAchievements();
  if (!forgeRendered) renderForge();
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function timeAgo(iso) {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ---------- header ----------
function renderPlayer(previousLevel) {
  const p = state.player;
  const badge = $('#level-badge');
  badge.textContent = p.level;
  if (previousLevel && p.level > previousLevel) {
    badge.classList.remove('pop');
    void badge.offsetWidth;
    badge.classList.add('pop');
  }
  $('#xp-text').textContent = `${p.xp} / ${p.next} XP`;
  $('#xp-fill').style.width = `${Math.round(p.progress * 100)}%`;
  const nextCards = state.cards.filter((c) => c.unlock === p.level + 1);
  $('#next-unlock').textContent = nextCards.length ? `Lv ${p.level + 1}: ${nextCards.map((c) => c.emoji).join(' ')}` : '';
  $('#stat-saved').textContent = formatDuration(p.stats.secondsSaved);
  $('#stat-runs').textContent = p.stats.runs;
  $('#stat-streak').textContent = p.streak;
  $('#stat-streak-wrap').title = `Daily streak: ${p.streak} day${p.streak === 1 ? '' : 's'} in a row (best ${p.stats.streak.best})`;
  $('#stat-streak-wrap').classList.toggle('cold', p.streak === 0);
  const unlocked = state.achievements.filter((a) => a.unlocked).length;
  $('#stat-ach').textContent = `${unlocked}/${state.achievements.length}`;
}

// ---------- collection ----------
function cardHtml(card) {
  const foot = card.type === 'action' ? `⏳ ${card.saves}s` : TYPE_LABEL[card.type];
  return `
    <div class="card ${card.type} ${card.rarity} ${card.unlocked ? '' : 'locked'}"
         data-card="${card.id}" draggable="${card.unlocked}" tabindex="${card.unlocked ? 0 : -1}"
         role="button" aria-label="${esc(card.name)}${card.unlocked ? '' : `, locked until level ${card.unlock}`}">
      <div class="card-type">${card.type.toUpperCase()}</div>
      <div class="card-art">${art(card.id, card.emoji)}</div>
      <div class="card-name">${esc(card.name)}</div>
      <div class="card-text">${esc(card.text)}</div>
      <div class="card-foot"><span>${card.rarity}</span><span>${foot}</span></div>
      ${card.unlocked ? '' : `<div class="lock">🔒 Level ${card.unlock}</div>`}
    </div>`;
}

// Matches name, description, rarity or type ("when"/"if"/"then" too).
function matchesSearch(card, query) {
  if (!query) return true;
  const haystack = [card.name, card.text, card.rarity, card.type, TYPE_LABEL[card.type]].join(' ').toLowerCase();
  return query.toLowerCase().split(/\s+/).every((word) => haystack.includes(word));
}

function renderCollection() {
  const query = $('#card-search').value.trim();
  const cards = state.cards.filter((c) => (filter === 'all' || c.type === filter) && matchesSearch(c, query));
  $('#card-grid').innerHTML = cards.length
    ? cards.map(cardHtml).join('')
    : `<div class="empty">No cards match "${esc(query)}".</div>`;
}

$('#card-search').addEventListener('input', renderCollection);
$('#card-search').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.target.value = '';
    renderCollection();
    e.target.blur();
  }
});
document.addEventListener('keydown', (e) => {
  const typing = e.target.closest('input, select, textarea, [contenteditable]');
  if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    $('#card-search').focus();
  }
});

$('#tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-filter]');
  if (!btn) return;
  filter = btn.dataset.filter;
  for (const b of $('#tabs').children) b.classList.toggle('active', b === btn);
  renderCollection();
});

function addCardToForge(cardId) {
  const card = cardById(cardId);
  if (!card || !card.unlocked) return;
  const params = {};
  for (const p of card.params) params[p.key] = p.default ?? '';
  const slot = { card: card.id, params };
  if (card.type === 'trigger') forge.trigger = slot;
  else if (card.type === 'condition') forge.conditions.push(slot);
  else forge.actions.push(slot);
  renderForge();
}

$('#card-grid').addEventListener('click', (e) => {
  const el = e.target.closest('.card');
  if (el) addCardToForge(el.dataset.card);
});
$('#card-grid').addEventListener('keydown', (e) => {
  const el = e.target.closest('.card');
  if (el && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    addCardToForge(el.dataset.card);
  }
});
$('#card-grid').addEventListener('dragstart', (e) => {
  const el = e.target.closest('.card');
  if (!el) return;
  e.dataTransfer.setData('text/flowforge-card', el.dataset.card);
  e.dataTransfer.effectAllowed = 'copy';
  const type = cardById(el.dataset.card).type;
  document.querySelector(`.lane[data-lane="${type}"]`).classList.add('drop-ok');
});
$('#card-grid').addEventListener('dragend', () => {
  document.querySelectorAll('.lane').forEach((l) => l.classList.remove('drop-ok'));
});

document.querySelectorAll('.lane').forEach((lane) => {
  lane.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('text/flowforge-card')) e.preventDefault();
  });
  lane.addEventListener('drop', (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/flowforge-card');
    const card = cardById(id);
    if (!card) return;
    if (card.type !== lane.dataset.lane) {
      toast(`${card.name} is a ${TYPE_LABEL[card.type]} card`, `Drop it in the ${TYPE_LABEL[card.type]} lane.`, 'error');
      return;
    }
    addCardToForge(id);
  });
});

// ---------- forge ----------
let forgeRendered = false;

function fieldHtml(lane, index, param, value) {
  const attrs = `data-lane="${lane}" data-index="${index}" data-key="${param.key}"`;
  let input;
  if (param.type === 'select') {
    input = `<select ${attrs}>${param.options
      .map((o) => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  } else {
    const type = param.type === 'number' ? 'number' : param.type === 'time' ? 'time' : param.secret ? 'password' : 'text';
    const min = param.min !== undefined ? `min="${param.min}"` : '';
    // Chain Reaction's "combo" box suggests the combos you already have.
    const list = param.key === 'combo' ? 'list="combo-names"' : '';
    input = `<input ${attrs} type="${type}" ${min} ${list} value="${esc(value)}" placeholder="${esc(param.placeholder || '')}">`;
  }
  return `<label>${esc(param.label)}${input}</label>`;
}

function slotHtml(lane, index, slot, count) {
  const card = cardById(slot.card);
  if (!card) return '';
  const order = lane === 'action' ? `<span class="order">#${index + 1}</span>` : '';
  const move = lane === 'action' && count > 1
    ? `<button data-move="-1" data-lane="${lane}" data-index="${index}" title="Move up" ${index === 0 ? 'disabled' : ''}>▲</button>
       <button data-move="1" data-lane="${lane}" data-index="${index}" title="Move down" ${index === count - 1 ? 'disabled' : ''}>▼</button>`
    : '';
  return `
    <div class="slot ${card.type}">
      <div class="slot-head">
        ${order}<span class="slot-art">${art(card.id, card.emoji)}</span><span class="name">${esc(card.name)}</span>
        <span class="slot-tools">${move}<button data-remove data-lane="${lane}" data-index="${index}" title="Remove">✕</button></span>
      </div>
      ${card.params.length ? `<div class="slot-fields">${card.params.map((p) => fieldHtml(lane, index, p, slot.params[p.key] ?? '')).join('')}</div>` : ''}
      <div class="slot-note">${esc(card.text)}</div>
    </div>`;
}

function renderForge() {
  forgeRendered = true;
  $('#combo-name').value = forge.name;
  $('#forge-title').textContent = forge.editingId ? 'Reforging combo' : 'The Forge';
  $('#forge-save').textContent = forge.editingId ? '⚒️ Save changes' : '⚒️ Forge combo';
  $('#forge-reset').textContent = forge.editingId ? 'Cancel edit' : 'Clear';
  $('#lane-trigger').innerHTML = forge.trigger
    ? slotHtml('trigger', 0, forge.trigger, 1)
    : '<div class="lane-empty">Drop a <b>WHEN</b> card here: what starts this combo?</div>';
  $('#lane-condition').innerHTML = forge.conditions.length
    ? forge.conditions.map((s, i) => slotHtml('condition', i, s, forge.conditions.length)).join('')
    : '<div class="lane-empty">No filters: the combo runs every time the trigger fires.</div>';
  $('#lane-action').innerHTML = forge.actions.length
    ? forge.actions.map((s, i) => slotHtml('action', i, s, forge.actions.length)).join('')
    : '<div class="lane-empty">Drop <b>THEN</b> cards here: what should happen?</div>';
  $('#forge-error').textContent = '';
}

function slotFor(lane, index) {
  if (lane === 'trigger') return forge.trigger;
  return (lane === 'condition' ? forge.conditions : forge.actions)[index];
}

$('.forge').addEventListener('input', (e) => {
  const el = e.target;
  if (el.id === 'combo-name') {
    forge.name = el.value;
    return;
  }
  if (!el.dataset.key) return;
  const slot = slotFor(el.dataset.lane, Number(el.dataset.index));
  if (slot) slot.params[el.dataset.key] = el.value;
});

$('.forge').addEventListener('focusin', (e) => {
  if (e.target.matches('input[type="text"][data-key]')) lastFocusedInput = e.target;
});

$('.forge').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const { lane } = btn.dataset;
  const index = Number(btn.dataset.index);
  if (btn.hasAttribute('data-remove')) {
    if (lane === 'trigger') forge.trigger = null;
    else (lane === 'condition' ? forge.conditions : forge.actions).splice(index, 1);
    renderForge();
  } else if (btn.dataset.move) {
    const to = index + Number(btn.dataset.move);
    const [slot] = forge.actions.splice(index, 1);
    forge.actions.splice(to, 0, slot);
    renderForge();
  }
});

$('#var-chips').innerHTML = VARS.map((v) => `<button type="button" data-var="${v}">{{${v}}}</button>`).join('');
$('#var-chips').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-var]');
  if (!btn) return;
  const token = `{{${btn.dataset.var}}}`;
  const input = lastFocusedInput && document.contains(lastFocusedInput) ? lastFocusedInput : null;
  if (!input) {
    navigator.clipboard?.writeText(token);
    toast('Copied', `${token}: click a text box first to insert it directly.`, 'ok');
    return;
  }
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + token + input.value.slice(end);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
  input.setSelectionRange(start + token.length, start + token.length);
});

$('#forge-reset').addEventListener('click', () => {
  forge = emptyForge();
  renderForge();
});

$('#forge-save').addEventListener('click', async () => {
  const err = !forge.name.trim() ? 'Give your combo a name.'
    : !forge.trigger ? 'Add a WHEN card.'
    : !forge.actions.length ? 'Add at least one THEN card.' : '';
  if (err) {
    $('#forge-error').textContent = err;
    return;
  }
  const body = { name: forge.name, trigger: forge.trigger, conditions: forge.conditions, actions: forge.actions };
  try {
    const editing = forge.editingId;
    if (editing) await api('PUT', `/api/combos/${editing}`, body);
    else await api('POST', '/api/combos', body);
    toast(editing ? 'Combo reforged' : 'Combo forged! ⚒️', `"${forge.name}" is live.`, 'ok');
    forge = emptyForge();
    renderForge();
    await refresh();
  } catch (e) {
    $('#forge-error').textContent = e.message;
  }
});

function loadIntoForge(combo, editingId = null) {
  const copy = (s) => ({ card: s.card, params: { ...s.params } });
  forge = {
    editingId,
    name: combo.name,
    trigger: copy(combo.trigger),
    conditions: combo.conditions.map(copy),
    actions: combo.actions.map(copy),
  };
  renderForge();
  $('.forge').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- combos ----------
function comboHtml(c) {
  const chainCards = [c.trigger, ...c.conditions, ...c.actions].map((s) => cardById(s.card));
  const chain = chainCards.map((card, i) => {
    const sep = i === 0 ? '' : i === 1 + c.conditions.length ? '<span class="sep">➜</span>' : '<span class="sep">·</span>';
    return `${sep}<span class="chain-art" title="${esc(card?.name)}">${card ? art(card.id, card.emoji) : '?'}</span>`;
  }).join('');
  const stars = '★'.repeat(Math.min(c.level.level, 5)) + (c.level.level > 5 ? ` +${c.level.level - 5}` : '');
  const error = c.armError || c.lastError;
  return `
    <div class="combo ${c.enabled ? '' : 'paused'}" data-combo="${c.id}">
      <div class="combo-top">
        <span class="name">${esc(c.name)}</span>
        <span class="stars" title="Combo level ${c.level.level}">Lv ${c.level.level} ${stars}</span>
        <label class="switch" title="${c.enabled ? 'Pause' : 'Enable'}">
          <input type="checkbox" data-toggle ${c.enabled ? 'checked' : ''} aria-label="Enabled"><span></span>
        </label>
      </div>
      <div class="chain">${chain}</div>
      <div class="bar"><div class="bar-fill" style="width:${Math.round(c.level.progress * 100)}%"></div></div>
      <div class="combo-meta">${c.runs} runs · saved ${formatDuration(c.secondsSaved)} · last run ${timeAgo(c.lastRun)}</div>
      ${error ? `<div class="combo-error">⚠ ${esc(error)}</div>` : ''}
      ${historyHtml(c)}
      <div class="combo-actions">
        <button class="ghost small play" data-play>▶ Play</button>
        <button class="ghost small" data-edit>✎ Edit</button>
        <button class="ghost small" data-duplicate title="Open a copy of this combo in the forge">⧉ Copy</button>
        <button class="ghost small" data-share title="Copy a share code for this combo">📤 Share</button>
        <button class="ghost small" data-delete title="Scrap combo">🗑</button>
      </div>
    </div>`;
}

function renderToggleAll() {
  const btn = $('#toggle-all');
  const anyOn = state.combos.some((c) => c.enabled);
  btn.hidden = state.combos.length === 0;
  btn.textContent = anyOn ? '⏸ Pause all' : '▶ Resume all';
  btn.title = anyOn ? 'Pause every combo (e.g. while presenting or gaming)' : 'Turn every combo back on';
  btn.dataset.enable = String(!anyOn);
}

$('#toggle-all').addEventListener('click', async (e) => {
  const enable = e.currentTarget.dataset.enable === 'true';
  try {
    const { changed } = await api('POST', '/api/combos/all/enabled', { enabled: enable });
    toast(enable ? '▶ Combos resumed' : '⏸ All combos paused', `${changed} combo${changed === 1 ? '' : 's'} ${enable ? 'back on' : 'resting'}.`, 'ok');
  } catch (err) {
    toast('Could not change combos', err.message, 'error');
  }
});

const HISTORY_ICON = { ok: '✔', skip: '⏸', error: '✖' };

function historyHtml(combo) {
  const history = combo.history || [];
  if (!history.length) return '';
  const open = openHistories.has(combo.id) ? 'open' : '';
  return `
    <details class="history" data-history="${combo.id}" ${open}>
      <summary>Last ${history.length} run${history.length === 1 ? '' : 's'}</summary>
      <ol>${history.map((h) => `
        <li class="${h.status}"><span>${HISTORY_ICON[h.status] ?? '•'}</span>
          <time title="${esc(new Date(h.at).toLocaleString())}">${timeAgo(h.at)}</time>
          <span class="history-text">${esc(h.text)}</span></li>`).join('')}
      </ol>
    </details>`;
}

// Keep open history panels open across re-renders.
const openHistories = new Set();
$('#combo-list').addEventListener('toggle', (e) => {
  const id = e.target.dataset?.history;
  if (!id) return;
  if (e.target.open) openHistories.add(id);
  else openHistories.delete(id);
}, true);

// Quests change at local midnight (the engine runs on this same computer).
function untilMidnight(now = new Date()) {
  const minutes = Math.ceil((new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now) / 60000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

let questDay = new Date().toDateString();

function renderQuests() {
  const today = new Date().toDateString();
  if (today !== questDay) {
    // A new day: fetch the new set of quests from the engine.
    questDay = today;
    refresh().catch(() => {});
  }
  $('#quest-reset').textContent = `· new in ${untilMidnight()}`;
  const quests = state.quests || [];
  const done = quests.filter((q) => q.done).length;
  $('#quest-list').innerHTML = quests.map((q) => `
    <li class="quest ${q.done ? 'done' : ''}">
      <span class="quest-emoji">${q.done ? '✅' : q.emoji}</span>
      <span class="quest-body">
        <span class="quest-text">${esc(q.text)}</span>
        <span class="bar"><span class="bar-fill" style="width:${Math.round((q.progress / q.goal) * 100)}%"></span></span>
      </span>
      <span class="quest-meta">${q.progress}/${q.goal}<small>+${q.xp} XP</small></span>
    </li>`).join('')
    + (quests.length && done === quests.length ? '<li class="quest-all">🎉 All done for today. New quests tomorrow!</li>' : '');
}

function renderCombos() {
  renderToggleAll();
  renderQuests();
  $('#combo-names').innerHTML = state.combos.map((c) => `<option value="${esc(c.name)}">`).join('');
  $('#combo-list').innerHTML = state.combos.length
    ? state.combos.map(comboHtml).join('')
    : '<div class="empty">No combos yet.<br>Build one in the forge, or start from a recipe below 👇</div>';
  $('#recipe-list').innerHTML = RECIPES.map((r, i) => {
    const level = recipeLevel(r);
    const locked = level > state.player.level;
    return `
    <button class="recipe ${locked ? 'locked' : ''}" data-recipe="${i}" ${locked ? `aria-label="${esc(r.name)}, unlocks at level ${level}"` : ''}>
      <span class="emoji">${r.emoji}</span>
      <span class="recipe-text"><b>${esc(r.name)}</b><small>${esc(r.blurb)}</small></span>
      ${locked ? `<span class="recipe-lock">🔒 Lv ${level}</span>` : ''}
    </button>`;
  }).join('');
}

$('#recipe-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-recipe]');
  if (!btn) return;
  const recipe = RECIPES[Number(btn.dataset.recipe)];
  const level = recipeLevel(recipe);
  if (level > state.player.level) {
    toast(`${recipe.emoji} ${recipe.name} is locked`, `Reach level ${level} to unlock its cards.`, 'error');
    return;
  }
  loadIntoForge(recipe);
  toast(`${recipe.emoji} ${recipe.name} loaded`, 'Check the folders, then press Forge.', 'ok');
});

$('#combo-list').addEventListener('click', async (e) => {
  const el = e.target.closest('[data-combo]');
  if (!el) return;
  const id = el.dataset.combo;
  const combo = state.combos.find((c) => c.id === id);
  try {
    if (e.target.closest('[data-play]')) {
      let body;
      if (combo.trigger.card === 'file-appears') {
        const file = prompt(`Test "${combo.name}" on which file? Paste its full path.\nThe combo really runs, so the file may be moved or renamed.`, lastTestFile);
        if (!file) return;
        lastTestFile = file;
        body = { file };
      }
      const result = await api('POST', `/api/combos/${id}/play`, body);
      if (result.status === 'ok') {
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 900);
      } else if (result.status === 'skipped') {
        toast('Held back', `A condition card said no for "${combo.name}".`);
      } else if (result.status === 'error') {
        toast(`${combo.name} failed`, result.error, 'error');
      }
    } else if (e.target.closest('[data-edit]')) {
      loadIntoForge(combo, id);
    } else if (e.target.closest('[data-duplicate]')) {
      loadIntoForge({ ...combo, name: copyName(combo.name) });
      toast('⧉ Copy ready in the forge', 'Change what you like, then press Forge.', 'ok');
    } else if (e.target.closest('[data-share]')) {
      await shareCombo(combo);
    } else if (e.target.closest('[data-delete]')) {
      if (confirm(`Scrap "${combo.name}"? Its level and stats will be lost.`)) {
        await api('DELETE', `/api/combos/${id}`);
        if (forge.editingId === id) {
          forge = emptyForge();
          renderForge();
        }
      }
    }
  } catch (err) {
    toast('Something went wrong', err.message, 'error');
  }
});

$('#combo-list').addEventListener('change', async (e) => {
  if (!e.target.matches('[data-toggle]')) return;
  const id = e.target.closest('[data-combo]').dataset.combo;
  try {
    await api('POST', `/api/combos/${id}/enabled`, { enabled: e.target.checked });
  } catch (err) {
    toast('Could not toggle', err.message, 'error');
  }
});

// "Sorter" -> "Sorter (copy)", then "Sorter (copy 2)", … never clashing with an existing combo.
function copyName(name) {
  const base = name.replace(/ \(copy(?: \d+)?\)$/, '');
  const taken = new Set(state.combos.map((c) => c.name));
  for (let n = 1; ; n++) {
    const suffix = ` (copy${n === 1 ? '' : ` ${n}`})`;
    const candidate = base.slice(0, 60 - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}

// ---------- sharing ----------
async function shareCombo(combo) {
  const { code, stripped } = encodeCombo(combo, state.cards);
  const note = stripped ? ' Secret settings (like webhook URLs) were left out.' : '';
  try {
    await navigator.clipboard.writeText(code);
    toast('📤 Share code copied', `Send it to a friend; they paste it with "Import code".${note}`, 'ok');
  } catch {
    prompt(`Copy this share code.${note}`, code);
  }
}

$('#import-combo').addEventListener('click', () => {
  const code = prompt('Paste a FlowForge share code:');
  if (!code) return;
  try {
    const combo = decodeCombo(code, state.cards);
    loadIntoForge(combo);
    toast(`📥 "${combo.name}" imported`, 'Check its folders and settings, then press Forge.', 'ok');
  } catch (err) {
    toast('Could not import', err.message, 'error');
  }
});

// ---------- activity ----------
const LOG_ICON = { ok: '✔', error: '✖', skip: '⏸', info: '•' };

// Oldest first, one line per entry: "2026-09-28 09:15:02  OK     Sorter: Moved …".
function activityText(entries) {
  const pad = (n) => String(n).padStart(2, '0');
  return [...entries].reverse().map((a) => {
    const d = new Date(a.at);
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    return `${stamp}  ${a.level.toUpperCase().padEnd(5)}  ${a.message}`;
  }).join('\n');
}

$('#save-log').addEventListener('click', () => {
  if (!state.activity.length) {
    toast('Nothing to save yet', 'The Battle Log is empty.');
    return;
  }
  const blob = new Blob([`FlowForge Battle Log\n\n${activityText(state.activity)}\n`], { type: 'text/plain' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `flowforge-log-${new Date().toISOString().slice(0, 10)}.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

function renderActivity() {
  $('#activity-list').innerHTML = state.activity.length
    ? state.activity.map((a) => {
      const t = new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `<li class="${a.level}"><time>${t}</time><span>${LOG_ICON[a.level] ?? '•'} ${esc(a.message)}</span></li>`;
    }).join('')
    : '<li class="skip">Nothing yet. Forge a combo and press ▶ Play.</li>';
}

// ---------- achievements ----------
function renderAchievements() {
  $('#ach-grid').innerHTML = state.achievements.map((a) => `
    <div class="ach ${a.unlocked ? 'unlocked' : 'locked'}">
      <div class="emoji">${a.emoji}</div>
      <b>${esc(a.name)}</b>
      <small>${esc(a.text)} · +${a.xp} XP</small>
    </div>`).join('');
}

$('#open-achievements').addEventListener('click', () => $('#achievements').showModal());
$('#close-achievements').addEventListener('click', () => $('#achievements').close());

// ---------- theme ----------
function applyTheme(theme) {
  const light = theme === 'light';
  if (light) document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  const btn = $('#theme-toggle');
  btn.textContent = light ? '🌙' : '☀️';
  btn.title = btn.ariaLabel = light ? 'Switch to dark theme' : 'Switch to light theme';
}

applyTheme(document.documentElement.dataset.theme);
$('#theme-toggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(next);
  try {
    localStorage.setItem('flowforge-theme', next);
  } catch {
    // Private mode or blocked storage: the theme still applies for this visit.
  }
});

// ---------- toasts ----------
function toast(title, message = '', kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<b>${esc(title)}</b>${esc(message)}`;
  $('#toasts').append(el);
  const all = $('#toasts').children;
  while (all.length > 4) all[0].remove();
  const ttl = kind === 'level' || kind === 'achievement' ? 7000 : 4500;
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, ttl);
}

// ---------- live updates ----------
let refreshTimer = null;
const refreshSoon = () => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refresh().catch(() => {}), 120);
};

function connect() {
  const events = new EventSource('/api/events');
  events.onmessage = (msg) => {
    const event = JSON.parse(msg.data);
    if (event.type === 'toast') toast(event.title, event.message, event.kind);
    refreshSoon();
  };
  events.onopen = refreshSoon;
}

refresh()
  .then(connect)
  .catch((err) => {
    document.body.insertAdjacentHTML('afterbegin', `<p style="padding:16px;color:#ff5c5c">Can't reach the FlowForge engine: ${esc(err.message)}. Is it running?</p>`);
  });
setInterval(() => state && renderCombos(), 60000);
