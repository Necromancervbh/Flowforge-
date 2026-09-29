// Tiny synthesized sound effects (Web Audio), so there are no audio files to
// ship. Browsers only allow sound after the first click or key press, so the
// audio context is created lazily on the first user gesture.

const NOTES = {
  // [frequency Hz, start offset s, duration s]
  run: [[880, 0, 0.08], [1320, 0.07, 0.14]], // coin "ka-ching"
  error: [[196, 0, 0.18], [147, 0.12, 0.25]], // low "bwomp"
  combo: [[659, 0, 0.1], [988, 0.09, 0.18]], // combo level up
  achievement: [[523, 0, 0.1], [659, 0.09, 0.1], [784, 0.18, 0.1], [1047, 0.27, 0.28]], // arpeggio
  level: [[392, 0, 0.12], [523, 0.12, 0.12], [659, 0.24, 0.12], [784, 0.36, 0.1], [1047, 0.46, 0.45]], // fanfare
};
const WAVE = { run: 'triangle', error: 'sawtooth', combo: 'triangle', achievement: 'square', level: 'square' };
const VOLUME = 0.08;

let ctx = null;
let muted = false;
let lastRun = 0;

try {
  muted = localStorage.getItem('flowforge-sound') === 'off';
} catch {
  // Storage blocked: sound stays on for this visit.
}

function unlock() {
  if (ctx || muted) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    ctx = null;
  }
}
for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, unlock, { passive: true });

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem('flowforge-sound', value ? 'off' : 'on');
  } catch {
    // ignore
  }
  if (!muted) unlock();
}

export function play(name) {
  if (muted || !ctx || !NOTES[name]) return;
  // Several files landing at once shouldn't turn into a machine gun.
  if (name === 'run') {
    if (performance.now() - lastRun < 250) return;
    lastRun = performance.now();
  }
  if (ctx.state === 'suspended') ctx.resume();
  const start = ctx.currentTime + 0.01;
  for (const [freq, offset, length] of NOTES[name]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = WAVE[name];
    osc.frequency.value = freq;
    const t = start + offset;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(VOLUME, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + length + 0.02);
  }
}
