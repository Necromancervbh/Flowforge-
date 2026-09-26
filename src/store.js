// Saves combos and the player profile to a JSON file. Writes are batched and
// atomic (write to a temp file, then rename) so a crash can't corrupt the save.

import fs from 'node:fs';
import path from 'node:path';
import { newProfile } from './game.js';

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'save.json');
    this.timer = null;
    this.data = this.load();
  }

  load() {
    const fresh = { version: 1, combos: [], profile: newProfile() };
    if (!fs.existsSync(this.file)) return fresh;
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const profile = { ...fresh.profile, ...saved.profile };
      profile.stats = { ...fresh.profile.stats, ...saved.profile?.stats };
      return { ...fresh, ...saved, profile };
    } catch (err) {
      const backup = `${this.file}.broken-${Date.now()}`;
      fs.renameSync(this.file, backup);
      console.warn(`Save file was unreadable (${err.message}); moved it to ${backup} and started fresh.`);
      return fresh;
    }
  }

  get combos() {
    return this.data.combos;
  }

  get profile() {
    return this.data.profile;
  }

  saveSoon() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 250);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}
