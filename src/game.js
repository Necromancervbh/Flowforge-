// Game rules: XP, levels and achievements. Pure functions over the profile so
// they're easy to test.

export const XP_PER_RUN = 10;
export const XP_PER_ACTION = 5;

// Level 2 at 100 XP, 3 at 400, 4 at 900, 5 at 1600 ...
export function levelFromXp(xp, base = 100) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / base)) + 1;
}

export function xpForLevel(level, base = 100) {
  return base * (level - 1) ** 2;
}

export function levelInfo(xp, base = 100) {
  const level = levelFromXp(xp, base);
  const floor = xpForLevel(level, base);
  const next = xpForLevel(level + 1, base);
  return { level, xp, floor, next, progress: (xp - floor) / (next - floor) };
}

// Combos level up faster than the player.
export const comboLevelInfo = (xp) => levelInfo(xp, 40);

const FILE_ACTIONS = ['move-file', 'copy-file', 'rename-file'];

export const ACHIEVEMENTS = [
  { id: 'first-forge', emoji: '⚒️', name: 'First Forge', text: 'Forge your first combo.', xp: 50,
    test: ({ combos }) => combos.length >= 1 },
  { id: 'first-run', emoji: '✨', name: 'It Lives!', text: 'A combo ran successfully.', xp: 25,
    test: ({ stats }) => stats.runs >= 1 },
  { id: 'big-combo', emoji: '⛓️', name: 'Chain Reaction', text: 'Forge a combo with 3 or more actions.', xp: 50,
    test: ({ combos }) => combos.some((c) => c.actions.length >= 3) },
  { id: 'runs-10', emoji: '⚙️', name: 'Well Oiled', text: '10 successful runs.', xp: 50,
    test: ({ stats }) => stats.runs >= 10 },
  { id: 'collector-5', emoji: '🗂️', name: 'Deck Master', text: 'Own 5 combos at once.', xp: 100,
    test: ({ combos }) => combos.length >= 5 },
  { id: 'sorter-25', emoji: '🧹', name: 'Tidy Wizard', text: 'Move, copy or rename 25 files.', xp: 100,
    test: ({ stats }) => FILE_ACTIONS.reduce((n, id) => n + (stats.actions[id] || 0), 0) >= 25 },
  { id: 'saved-hour', emoji: '⏳', name: 'Hour Hacker', text: 'Save a full hour of manual work.', xp: 150,
    test: ({ stats }) => stats.secondsSaved >= 3600 },
  { id: 'night-owl', emoji: '🦉', name: 'Night Owl', text: 'Have a combo run between midnight and 5 AM.', xp: 25,
    test: ({ stats }) => stats.nightRuns >= 1 },
  { id: 'streak-3', emoji: '🔥', name: 'Warming Up', text: 'Have combos run 3 days in a row.', xp: 50,
    test: ({ stats }) => stats.streak.best >= 3 },
  { id: 'streak-7', emoji: '🌋', name: 'On Fire', text: 'Have combos run 7 days in a row.', xp: 150,
    test: ({ stats }) => stats.streak.best >= 7 },
  { id: 'runs-100', emoji: '♾️', name: 'Perpetual Motion', text: '100 successful runs.', xp: 200,
    test: ({ stats }) => stats.runs >= 100 },
];

export function newProfile() {
  return {
    xp: 0,
    achievements: [],
    stats: { runs: 0, failures: 0, secondsSaved: 0, nightRuns: 0, actions: {}, streak: { current: 0, best: 0, lastDay: null } },
  };
}

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const yesterdayKey = (now) => dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));

// Daily streak: consecutive local days with at least one successful run.
export function recordStreakDay(stats, now) {
  const streak = stats.streak;
  const today = dayKey(now);
  if (streak.lastDay === today) return;
  streak.current = streak.lastDay === yesterdayKey(now) ? streak.current + 1 : 1;
  streak.best = Math.max(streak.best, streak.current);
  streak.lastDay = today;
}

// The streak as shown today: it survives until the end of the day after the
// last run, then drops to 0.
export function liveStreak(stats, now) {
  const { current, lastDay } = stats.streak;
  return lastDay === dayKey(now) || lastDay === yesterdayKey(now) ? current : 0;
}

// Unlocks any newly earned achievements (repeatedly, since achievement XP
// never feeds achievement tests). Returns the ones unlocked now.
export function checkAchievements(profile, combos) {
  const unlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (profile.achievements.includes(a.id)) continue;
    if (a.test({ stats: profile.stats, combos })) {
      profile.achievements.push(a.id);
      profile.xp += a.xp;
      unlocked.push(a);
    }
  }
  return unlocked;
}

export function publicAchievement({ test, ...rest }, profile) {
  return { ...rest, unlocked: profile.achievements.includes(rest.id) };
}
