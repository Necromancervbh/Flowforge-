// The engine arms each combo's trigger card and, when it fires, runs the
// condition cards then the action cards in order, awarding XP for each
// successful run.

import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import path from 'node:path';
import * as realPlatform from './platform.js';
import { CARD_BY_ID, CARDS, publicCard } from './cards.js';
import { render, baseContext } from './template.js';
import {
  XP_PER_RUN, XP_PER_ACTION, levelInfo, levelFromXp, comboLevelInfo,
  checkAchievements, ACHIEVEMENTS, publicAchievement, recordStreakDay, liveStreak,
} from './game.js';

const MAX_ACTIVITY = 150;
const MAX_CONDITIONS = 5;
const MAX_ACTIONS = 6;
const WRITTEN_TTL = 15000;

export class Engine extends EventEmitter {
  constructor({ store, platform = realPlatform, now = () => new Date() }) {
    super();
    this.store = store;
    this.platform = platform;
    this.now = now;
    this.stops = new Map();
    this.queues = new Map();
    this.armErrors = new Map();
    this.written = new Map();
    this.activity = [];
    this.helpers = {
      platform,
      log: (level, message, comboId) => this.log(level, message, comboId),
      toast: (title, message, kind = 'notify') => this.emit('event', { type: 'toast', title, message, kind }),
      markWritten: (p) => this.written.set(path.resolve(p), Date.now()),
      wasWrittenByUs: (p) => {
        const at = this.written.get(path.resolve(p));
        return at !== undefined && Date.now() - at < WRITTEN_TTL;
      },
      // Text FlowForge itself put on the clipboard, so Copycat can ignore it
      // (otherwise Copycat → Echo would loop forever).
      markClipboard: (text) => {
        this.ownClipboard = String(text).slice(0, 10000).trimEnd();
      },
      isOwnClipboard: (text) => this.ownClipboard !== undefined && String(text).slice(0, 10000).trimEnd() === this.ownClipboard,
    };
  }

  get playerLevel() {
    return levelFromXp(this.store.profile.xp);
  }

  start() {
    for (const combo of this.store.combos) this.arm(combo, true);
    this.log('info', `FlowForge engine started with ${this.store.combos.length} combo(s).`);
  }

  stop() {
    for (const id of [...this.stops.keys()]) this.disarm(id);
  }

  log(level, message, comboId = null) {
    const entry = { id: crypto.randomUUID(), at: this.now().toISOString(), level, message, comboId };
    this.activity.unshift(entry);
    this.activity.length = Math.min(this.activity.length, MAX_ACTIVITY);
    this.emit('event', { type: 'activity', entry });
  }

  changed() {
    this.store.saveSoon();
    this.emit('event', { type: 'changed' });
  }

  arm(combo, boot = false) {
    this.disarm(combo.id);
    this.armErrors.delete(combo.id);
    if (!combo.enabled) return;
    const card = CARD_BY_ID.get(combo.trigger.card);
    try {
      const stop = card.start({
        params: this.fillDefaults(card, combo.trigger.params),
        fire: (extra) => this.fire(combo.id, extra, 'trigger'),
        // Lets a running trigger show (or clear) a problem on its combo card.
        problem: (message) => {
          if ((this.armErrors.get(combo.id) ?? null) === (message ?? null)) return;
          if (message) this.armErrors.set(combo.id, message);
          else this.armErrors.delete(combo.id);
          this.emit('event', { type: 'changed' });
        },
        boot,
        helpers: this.helpers,
      });
      this.stops.set(combo.id, stop);
    } catch (err) {
      this.armErrors.set(combo.id, err.message);
      this.log('error', `${combo.name}: trigger can't start: ${err.message}`, combo.id);
    }
  }

  disarm(id) {
    const stop = this.stops.get(id);
    this.stops.delete(id);
    if (stop) stop();
  }

  fillDefaults(card, params = {}) {
    const out = {};
    for (const p of card.params) out[p.key] = params[p.key] ?? p.default ?? '';
    return out;
  }

  renderParams(card, params, ctx) {
    const filled = this.fillDefaults(card, params);
    for (const key of Object.keys(filled)) {
      if (!card.raw?.includes(key)) filled[key] = render(filled[key], ctx);
    }
    return filled;
  }

  // Runs are queued per combo so two files landing at once don't race.
  fire(id, extra = {}, source = 'trigger') {
    const prev = this.queues.get(id) || Promise.resolve();
    const next = prev.then(() => this.runCombo(id, extra, source));
    this.queues.set(id, next.catch(() => {}));
    return next;
  }

  async runCombo(id, extra, source) {
    const combo = this.store.combos.find((c) => c.id === id);
    if (!combo) return { status: 'missing' };
    if (source === 'trigger' && !combo.enabled) return { status: 'disabled' };

    const trigger = CARD_BY_ID.get(combo.trigger.card);
    const ctx = { ...baseContext(this.now()), ...extra, combo: { id: combo.id, name: combo.name }, trigger: trigger.name };

    try {
      for (const slot of combo.conditions) {
        const card = CARD_BY_ID.get(slot.card);
        if (!card.check(this.renderParams(card, slot.params, ctx), ctx)) {
          this.log('skip', `${combo.name}: ${card.emoji} ${card.name} held it back.`, combo.id);
          return { status: 'skipped', by: card.id };
        }
      }

      const summaries = [];
      let seconds = 0;
      for (const slot of combo.actions) {
        const card = CARD_BY_ID.get(slot.card);
        try {
          summaries.push(await card.run(this.renderParams(card, slot.params, ctx), ctx, this.helpers));
        } catch (err) {
          err.card = card;
          throw err;
        }
        seconds += card.saves || 0;
      }
      this.reward(combo, seconds);
      const gain = XP_PER_RUN + XP_PER_ACTION * combo.actions.length;
      this.log('ok', `${combo.name}: ${summaries.join(' · ')} (+${gain} XP)`, combo.id);
      return { status: 'ok', summaries, gain };
    } catch (err) {
      combo.failures = (combo.failures || 0) + 1;
      combo.lastError = err.message;
      combo.lastRun = this.now().toISOString();
      this.store.profile.stats.failures += 1;
      const where = err.card ? `${err.card.emoji} ${err.card.name} failed: ` : '';
      this.log('error', `${combo.name}: ${where}${err.message}`, combo.id);
      this.changed();
      return { status: 'error', error: err.message };
    }
  }

  reward(combo, seconds) {
    const profile = this.store.profile;
    const gain = XP_PER_RUN + XP_PER_ACTION * combo.actions.length;
    const levelBefore = this.playerLevel;
    const comboLevelBefore = comboLevelInfo(combo.xp || 0).level;
    const now = this.now();

    combo.runs = (combo.runs || 0) + 1;
    combo.xp = (combo.xp || 0) + gain;
    combo.secondsSaved = (combo.secondsSaved || 0) + seconds;
    combo.lastRun = now.toISOString();
    combo.lastError = null;

    profile.xp += gain;
    profile.stats.runs += 1;
    profile.stats.secondsSaved += seconds;
    if (now.getHours() < 5) profile.stats.nightRuns += 1;
    recordStreakDay(profile.stats, now);
    for (const slot of combo.actions) {
      profile.stats.actions[slot.card] = (profile.stats.actions[slot.card] || 0) + 1;
    }

    const comboLevel = comboLevelInfo(combo.xp).level;
    if (comboLevel > comboLevelBefore) {
      this.emit('event', { type: 'toast', kind: 'combo', title: `${combo.name} reached level ${comboLevel}!`, message: '⭐'.repeat(Math.min(comboLevel, 5)) });
    }
    this.celebrate(levelBefore);
    this.changed();
  }

  // Announces achievements and level-ups since `levelBefore`.
  celebrate(levelBefore) {
    for (const a of checkAchievements(this.store.profile, this.store.combos)) {
      this.emit('event', { type: 'toast', kind: 'achievement', title: `${a.emoji} ${a.name}`, message: `${a.text} +${a.xp} XP` });
      this.log('ok', `Achievement unlocked: ${a.emoji} ${a.name} (+${a.xp} XP)`);
    }
    const level = this.playerLevel;
    if (level > levelBefore) {
      const unlocked = CARDS.filter((c) => c.unlock > levelBefore && c.unlock <= level);
      const names = unlocked.map((c) => `${c.emoji} ${c.name}`).join(', ');
      this.emit('event', { type: 'toast', kind: 'level', title: `Level ${level}!`, message: names ? `New cards: ${names}` : 'Keep forging.' });
      this.log('ok', `Reached level ${level}.${names ? ` New cards: ${names}` : ''}`);
    }
  }

  validate(input, existing) {
    const errors = [];
    const level = this.playerLevel;
    const name = String(input?.name ?? '').trim().slice(0, 60);
    if (!name) errors.push('Give your combo a name.');

    const slot = (raw, type) => {
      const card = CARD_BY_ID.get(raw?.card);
      if (!card || card.type !== type) {
        errors.push(`Unknown ${type} card.`);
        return null;
      }
      const alreadyOwned = existing && [existing.trigger, ...existing.conditions, ...existing.actions].some((s) => s.card === card.id);
      if (card.unlock > level && !alreadyOwned) errors.push(`${card.name} unlocks at level ${card.unlock}.`);
      const params = {};
      for (const p of card.params) {
        let value = raw.params?.[p.key] ?? p.default ?? '';
        if (typeof value !== 'string' && typeof value !== 'number') value = String(value);
        if (typeof value === 'string') value = value.slice(0, 2000);
        if (p.type === 'number') {
          value = Number(value);
          if (!Number.isFinite(value)) errors.push(`${card.name}: ${p.label} must be a number.`);
          else if (p.min !== undefined && value < p.min) errors.push(`${card.name}: ${p.label} must be at least ${p.min}.`);
        }
        if (p.type === 'select' && !p.options.includes(value)) value = p.default;
        if (p.required && String(value).trim() === '') errors.push(`${card.name}: fill in "${p.label}".`);
        params[p.key] = value;
      }
      return { card: card.id, params };
    };

    const trigger = slot(input?.trigger, 'trigger');
    const conditions = (Array.isArray(input?.conditions) ? input.conditions : []).map((c) => slot(c, 'condition'));
    const actions = (Array.isArray(input?.actions) ? input.actions : []).map((a) => slot(a, 'action'));
    if (conditions.length > MAX_CONDITIONS) errors.push(`At most ${MAX_CONDITIONS} conditions.`);
    if (actions.length === 0) errors.push('Add at least one action card.');
    if (actions.length > MAX_ACTIONS) errors.push(`At most ${MAX_ACTIONS} actions.`);

    if (errors.length) {
      const err = new Error(errors.join(' '));
      err.status = 400;
      throw err;
    }
    return { name, trigger, conditions, actions, enabled: input.enabled !== false };
  }

  saveCombo(input, id = null) {
    const existing = id ? this.store.combos.find((c) => c.id === id) : null;
    if (id && !existing) {
      const err = new Error('Combo not found');
      err.status = 404;
      throw err;
    }
    const clean = this.validate(input, existing);
    const levelBefore = this.playerLevel;
    let combo;
    if (existing) {
      combo = Object.assign(existing, clean);
    } else {
      combo = {
        id: crypto.randomUUID(),
        ...clean,
        xp: 0, runs: 0, failures: 0, secondsSaved: 0,
        lastRun: null, lastError: null,
        createdAt: this.now().toISOString(),
      };
      this.store.combos.push(combo);
    }
    this.arm(combo);
    this.log('info', `${existing ? 'Reforged' : 'Forged'} combo "${combo.name}".`, combo.id);
    this.celebrate(levelBefore);
    this.changed();
    return combo;
  }

  setEnabled(id, enabled) {
    const combo = this.store.combos.find((c) => c.id === id);
    if (!combo) return null;
    combo.enabled = Boolean(enabled);
    this.arm(combo);
    this.log('info', `${combo.name} ${combo.enabled ? 'enabled' : 'paused'}.`, combo.id);
    this.changed();
    return combo;
  }

  // Pause or resume every combo at once. Returns how many changed.
  setAllEnabled(enabled) {
    const target = Boolean(enabled);
    const changed = this.store.combos.filter((c) => c.enabled !== target);
    for (const combo of changed) {
      combo.enabled = target;
      this.arm(combo);
    }
    if (changed.length) {
      this.log('info', `${target ? 'Resumed' : 'Paused'} ${changed.length} combo${changed.length === 1 ? '' : 's'}.`);
      this.changed();
    }
    return changed.length;
  }

  deleteCombo(id) {
    const index = this.store.combos.findIndex((c) => c.id === id);
    if (index === -1) return false;
    const [combo] = this.store.combos.splice(index, 1);
    this.disarm(id);
    this.armErrors.delete(id);
    this.queues.delete(id);
    this.log('info', `Scrapped combo "${combo.name}".`);
    this.changed();
    return true;
  }

  snapshot() {
    const { profile } = this.store;
    const player = levelInfo(profile.xp);
    return {
      player: { ...player, stats: profile.stats, streak: liveStreak(profile.stats, this.now()) },
      cards: CARDS.map((c) => publicCard(c, player.level)),
      combos: this.store.combos.map((c) => ({
        ...c,
        level: comboLevelInfo(c.xp || 0),
        armError: this.armErrors.get(c.id) || null,
      })),
      achievements: ACHIEVEMENTS.map((a) => publicAchievement(a, profile)),
      activity: this.activity,
    };
  }
}
