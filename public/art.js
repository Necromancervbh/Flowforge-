// Hand-drawn card art: one 64×64 SVG illustration per card, in a shared
// style (bold dark outline, warm palette). art(id) returns inline SVG markup.

const INK = '#1b120b';

// Four-point sparkle.
const star = (cx, cy, r, fill = '#ffd166') => {
  const k = r * 0.28;
  return `<path fill="${fill}" stroke-width="1.5" d="M${cx} ${cy - r}L${cx + k} ${cy - k}L${cx + r} ${cy}L${cx + k} ${cy + k}L${cx} ${cy + r}L${cx - k} ${cy + k}L${cx - r} ${cy}L${cx - k} ${cy - k}Z"/>`;
};

const lines = (x1, x2, ys, color = '#c9b8a3') =>
  ys.map((y) => `<path stroke="${color}" stroke-width="2.5" d="M${x1} ${y}H${x2}"/>`).join('');

const ART = {
  // ---------- WHEN ----------
  manual: `
    <circle cx="32" cy="34" r="22" fill="#b83b3b"/>
    <circle cx="32" cy="31" r="19" fill="#ef5b5b"/>
    <circle cx="32" cy="31" r="13" fill="#ff8a7a"/>
    <path fill="#fff4e6" d="M28 23L41 31L28 39Z"/>
    ${star(54, 10, 7)}${star(9, 52, 5)}`,

  'file-appears': `
    <path fill="#6b4226" d="M14 30H50L55 40H9Z"/>
    <rect x="21" y="6" width="22" height="28" rx="2" fill="#fff4e6"/>
    <path fill="none" stroke="#ef5b5b" stroke-width="3" d="M32 12V25M26.5 20L32 25.5L37.5 20"/>
    <path fill="#d98c4f" d="M9 40H19L23 46H41L45 40H55V56H9Z"/>
    ${star(54, 12, 5)}`,

  'file-changed': `
    <path fill="#fff4e6" d="M10 6H34L46 18V58H10Z"/>
    <path fill="#e0c9a6" d="M34 6V18H46"/>
    ${lines(16, 36, [26, 33, 40], '#c9b8a3')}
    <path fill="#ffd166" d="M52 20L60 28L36 52L26 55L29 45Z"/>
    <path fill="#ef5b5b" d="M52 20L56 16L64 24L60 28Z"/>
    <path fill="#e0c9a6" d="M29 45L26 55L36 52Z"/>
    <path fill="none" stroke="#ef5b5b" stroke-width="2.5" d="M4 44Q2 52 8 56M4 30Q1 36 3 40"/>`,

  interval: `
    <rect x="27" y="5" width="10" height="6" rx="2" fill="#b0b8c4"/>
    <rect x="30" y="10" width="4" height="6" fill="#8d96a3"/>
    <path fill="#8d96a3" d="M47 15L52 20L49 23L44 18Z"/>
    <circle cx="32" cy="37" r="22" fill="#d9e1ea"/>
    <circle cx="32" cy="37" r="17" fill="#fff"/>
    <path stroke="#8d96a3" stroke-width="2.5" d="M32 22V25M32 49V52M17 37H20M44 37H47"/>
    <path fill="none" stroke="${INK}" stroke-width="3" d="M32 37V26"/>
    <path fill="none" stroke="#ef5b5b" stroke-width="3" d="M32 37L40 42"/>
    <circle cx="32" cy="37" r="2.5" fill="${INK}"/>`,

  daily: `
    <path stroke="#ffb347" stroke-width="3.5" d="M32 6V13M12 16L17 21M52 16L47 21M4 34H11M60 34H53"/>
    <path fill="#ffb347" d="M13 42A19 19 0 0 1 51 42Z"/>
    <path fill="#ffd166" stroke="none" d="M20 42A12 12 0 0 1 44 42Z"/>
    <path fill="#3b7fd1" d="M5 42H59V57H5Z"/>
    <path fill="none" stroke="#9fd0ff" stroke-width="2.5" d="M12 48Q16 45 20 48T28 48M36 52Q40 49 44 52T52 52"/>`,

  clipboard: `
    <rect x="11" y="10" width="42" height="48" rx="5" fill="#b06b35"/>
    <rect x="17" y="17" width="30" height="36" rx="2" fill="#fff4e6"/>
    ${lines(22, 42, [27, 34, 41])}
    <path stroke="#ef5b5b" stroke-width="2.5" d="M22 47H34"/>
    <rect x="23" y="5" width="18" height="10" rx="3" fill="#b0b8c4"/>
    <circle cx="32" cy="9.5" r="2" fill="#221d19" stroke="none"/>
    ${star(54, 22, 6)}${star(9, 46, 4)}`,

  'low-battery': `
    <rect x="6" y="18" width="46" height="28" rx="5" fill="#e8edf2"/>
    <rect x="52" y="26" width="6" height="12" rx="2" fill="#b0b8c4"/>
    <rect x="11" y="23" width="9" height="18" rx="2" fill="#ef5b5b"/>
    <path stroke="#ef5b5b" stroke-width="5" d="M36 25V33"/>
    <circle cx="36" cy="39.5" r="2.6" fill="#ef5b5b" stroke="none"/>`,

  'back-online': `
    <path fill="none" stroke="#4aa3ff" stroke-width="5" d="M8 28Q32 6 56 28"/>
    <path fill="none" stroke="#4aa3ff" stroke-width="5" d="M16 36Q32 21 48 36"/>
    <path fill="none" stroke="#4aa3ff" stroke-width="5" d="M24 44Q32 36 40 44"/>
    <circle cx="32" cy="52" r="5" fill="#4aa3ff"/>
    <circle cx="52" cy="50" r="9" fill="#4cc38a"/>
    <path fill="none" stroke="#fff" stroke-width="2.5" d="M47.5 50L50.5 53L56 47"/>`,

  idle: `
    <rect x="6" y="40" width="46" height="16" rx="4" fill="#5b6472"/>
    <g fill="#8d96a3" stroke-width="1.2">
      <rect x="11" y="44" width="6" height="4" rx="1"/><rect x="20" y="44" width="6" height="4" rx="1"/><rect x="29" y="44" width="6" height="4" rx="1"/><rect x="38" y="44" width="6" height="4" rx="1"/>
      <rect x="15" y="50" width="26" height="3" rx="1"/>
    </g>
    <path fill="#b39ddb" d="M36 30A13 13 0 1 1 48 10A10 10 0 1 0 36 30Z"/>
    <path fill="none" stroke="#fff4e6" stroke-width="2.5" d="M12 10H20L12 20H20M24 22H29L24 29H29"/>`,

  'on-start': `
    <circle cx="32" cy="32" r="25" fill="#1f3b2d"/>
    <circle cx="32" cy="32" r="19" fill="#27543c" stroke-width="0"/>
    <path fill="none" stroke="#4cc38a" stroke-width="5.5" d="M22.5 21A14 14 0 1 0 41.5 21"/>
    <path fill="none" stroke="#4cc38a" stroke-width="5.5" d="M32 13V31"/>
    ${star(54, 9, 5, '#9ff0c6')}`,

  'page-changes': `
    <rect x="5" y="11" width="54" height="42" rx="5" fill="#e8edf2"/>
    <path fill="#b36bff" d="M5 16A5 5 0 0 1 10 11H54A5 5 0 0 1 59 16V21H5Z"/>
    <circle cx="11" cy="16" r="1.8" fill="#fff" stroke="none"/><circle cx="17" cy="16" r="1.8" fill="#fff" stroke="none"/>
    <path fill="#fff" d="M14 38Q32 22 50 38Q32 54 14 38Z"/>
    <circle cx="32" cy="38" r="7" fill="#b36bff"/>
    <circle cx="32" cy="38" r="3" fill="${INK}"/>
    <circle cx="34.5" cy="35.5" r="1.4" fill="#fff" stroke="none"/>`,

  // ---------- IF ----------
  'text-contains': `
    <rect x="7" y="7" width="34" height="46" rx="3" fill="#fff4e6"/>
    ${lines(13, 35, [16, 23, 30, 37, 44])}
    <path stroke="#8a5530" stroke-width="7" d="M47 47L57 57"/>
    <circle cx="39" cy="38" r="12" fill="#9fd0ff" fill-opacity="0.75"/>
    <path fill="none" stroke="#fff" stroke-width="2.5" d="M33 34A7 7 0 0 1 38 30"/>`,

  'time-window': `
    <circle cx="32" cy="33" r="24" fill="#fff4e6"/>
    <path fill="#f2c14e" d="M32 33L32 13A20 20 0 0 1 50.3 41.2Z"/>
    <path stroke="#c9b8a3" stroke-width="2.5" d="M32 11V14M32 52V55M10 33H13M51 33H54"/>
    <path fill="none" stroke="${INK}" stroke-width="3" d="M32 33V20M32 33L42 38"/>
    <circle cx="32" cy="33" r="2.5" fill="${INK}"/>`,

  'day-type': `
    <rect x="7" y="12" width="50" height="44" rx="5" fill="#fff4e6"/>
    <path fill="#ef5b5b" d="M7 17A5 5 0 0 1 12 12H52A5 5 0 0 1 57 17V25H7Z"/>
    <rect x="17" y="6" width="5" height="12" rx="2.5" fill="#8d8378"/>
    <rect x="42" y="6" width="5" height="12" rx="2.5" fill="#8d8378"/>
    <g fill="#e5d6c2" stroke-width="0">
      <rect x="13" y="30" width="9" height="8" rx="1.5"/><rect x="27.5" y="30" width="9" height="8" rx="1.5"/>
      <rect x="13" y="42" width="9" height="8" rx="1.5"/><rect x="27.5" y="42" width="9" height="8" rx="1.5"/><rect x="42" y="42" width="9" height="8" rx="1.5"/>
    </g>
    <rect x="42" y="30" width="9" height="8" rx="1.5" fill="#4cc38a"/>
    <path fill="none" stroke="#fff" stroke-width="2" d="M44 34L46 36L49.5 32"/>`,

  'file-type': `
    <path fill="#fff4e6" d="M12 6H36L48 18V58H12Z"/>
    <path fill="#e0c9a6" d="M36 6V18H48"/>
    <rect x="6" y="30" width="36" height="16" rx="3" fill="#ef5b5b"/>
    <path fill="none" stroke="#fff4e6" stroke-width="2.5" d="M12 42V34H16A2.5 2.5 0 0 1 16 39H12M22 34V42H24A4 4 0 0 0 24 34ZM34 42V34H38.5M34 38H37.5"/>
    <circle cx="52" cy="48" r="9" fill="#4cc38a"/>
    <path fill="none" stroke="#fff" stroke-width="2.5" d="M47.5 48L50.5 51L56 45"/>`,

  'lucky-charm': `
    <path fill="none" stroke="#3f8f3a" stroke-width="4" d="M32 34Q36 48 28 58"/>
    <g fill="#5cc85a">
      <path d="M32 32C22 32 14 26 17 18C20 11 29 13 32 20C35 13 44 11 47 18C50 26 42 32 32 32Z" transform="rotate(0 32 32)"/>
      <path d="M32 32C22 32 14 26 17 18C20 11 29 13 32 20C35 13 44 11 47 18C50 26 42 32 32 32Z" transform="rotate(90 32 32)"/>
      <path d="M32 32C22 32 14 26 17 18C20 11 29 13 32 20C35 13 44 11 47 18C50 26 42 32 32 32Z" transform="rotate(180 32 32)"/>
      <path d="M32 32C22 32 14 26 17 18C20 11 29 13 32 20C35 13 44 11 47 18C50 26 42 32 32 32Z" transform="rotate(270 32 32)"/>
    </g>
    <circle cx="32" cy="32" r="3.5" fill="#3f8f3a"/>
    ${star(53, 11, 6)}${star(10, 52, 4)}`,
  'file-size': `
    <path stroke="#8a5530" stroke-width="4" d="M32 14V52M21 55H43"/>
    <path stroke="#b0b8c4" stroke-width="3.5" d="M9 18L55 24"/>
    <path fill="none" stroke="#8d8378" stroke-width="1.8" d="M9 18L4 36M9 18L16 36M55 24L48 42M55 24L60 42"/>
    <path fill="#ffb347" d="M2 36H18Q10 46 2 36Z"/>
    <path fill="#ffb347" d="M46 42H62Q54 52 46 42Z"/>
    <rect x="49" y="33" width="10" height="9" rx="1.5" fill="#fff4e6"/>
    <circle cx="32" cy="12" r="4" fill="#ffd166"/>`,

  // ---------- THEN ----------
  notify: `
    <path fill="none" stroke="#ffd166" stroke-width="3" d="M10 22Q7 29 10 36M54 22Q57 29 54 36M4 18Q0 29 4 40M60 18Q64 29 60 40"/>
    <circle cx="32" cy="12" r="3.5" fill="#f2c14e"/>
    <path fill="#ffd166" d="M17 45Q20 39 20 28A12 12 0 0 1 44 28Q44 39 47 45Z"/>
    <path fill="none" stroke="#fff4e6" stroke-width="2.5" d="M25 26A7 7 0 0 1 30 20"/>
    <rect x="13" y="43" width="38" height="6" rx="3" fill="#f2c14e"/>
    <circle cx="32" cy="53" r="4.5" fill="#d99a2b"/>`,

  'move-file': `
    <ellipse cx="32" cy="51" rx="27" ry="7" fill="#4a2f73"/>
    <path fill="#7a52b3" d="M17 50Q22 32 30 18Q34 9 42 7Q37 13 38 20Q42 30 47 50Z"/>
    <path fill="#ffb347" d="M18.5 44Q32 49 45.5 44L47 50Q32 55 17 50Z"/>
    ${star(31, 31, 6)}${star(52, 14, 4)}${star(12, 22, 3.5)}`,

  'write-log': `
    <rect x="12" y="12" width="36" height="40" fill="#fff4e6"/>
    <rect x="8" y="7" width="44" height="9" rx="4.5" fill="#e0c9a6"/>
    <rect x="8" y="48" width="44" height="9" rx="4.5" fill="#e0c9a6"/>
    ${lines(17, 38, [23, 30, 37, 43])}
    <path fill="#fff" d="M58 4Q62 16 44 36L40 40Q40 20 58 4Z"/>
    <path fill="none" stroke="#c9b8a3" stroke-width="1.5" d="M55 10Q48 22 42 36"/>
    <path stroke="${INK}" stroke-width="2.5" d="M40 40L36 46"/>`,

  'copy-text': `
    <rect x="18" y="16" width="34" height="42" rx="4" fill="#9fd0ff"/>
    ${lines(24, 46, [27, 34, 41], '#5d9fd6')}
    <rect x="10" y="6" width="34" height="42" rx="4" fill="#fff4e6"/>
    ${lines(16, 38, [16, 23, 30], '#c9b8a3')}
    <path fill="none" stroke="#8d96a3" stroke-width="3.5" d="M47 30V12A6 6 0 0 0 35 12V34A3 3 0 0 0 41 34V16"/>
    ${star(54, 50, 6)}`,

  'open-url': `
    <circle cx="32" cy="32" r="26" fill="#1e3a5f"/>
    <circle cx="32" cy="32" r="20" fill="#2f6fb5" stroke-width="0"/>
    <circle cx="32" cy="32" r="13" fill="#4aa3ff" stroke-width="0"/>
    <circle cx="32" cy="32" r="6" fill="#dff1ff" stroke-width="0"/>
    <path fill="none" stroke="#dff1ff" stroke-width="2.2" stroke-opacity="0.85" d="M28 32A4 4 0 1 1 36 32A8 8 0 1 1 20 32A12 12 0 1 1 44 32A16 16 0 1 1 12 32"/>
    ${star(54, 9, 5, '#9fd0ff')}`,

  'open-file': `
    <path fill="#b06b35" d="M5 16H23L28 21H53V52H5Z"/>
    <rect x="12" y="14" width="34" height="24" rx="2" fill="#fff4e6"/>
    ${lines(17, 38, [21, 27])}
    <path fill="#f2a65a" d="M5 29H59L52 53H10Z"/>
    ${star(52, 9, 6)}${star(40, 5, 3)}`,

  'copy-file': `
    <rect x="7" y="7" width="30" height="38" rx="3" fill="#9fd0ff"/>
    ${lines(13, 30, [16, 23, 30], '#5d9fd6')}
    <rect x="25" y="19" width="31" height="39" rx="3" fill="#fff4e6"/>
    ${lines(31, 49, [29, 36, 43, 50])}
    <path fill="none" stroke="#4cc38a" stroke-width="3" d="M9 52Q11 60 20 58M16 54L20 58L16 62"/>`,

  'compress-file': `
    <rect x="6" y="6" width="52" height="8" rx="3" fill="#8d96a3"/>
    <rect x="6" y="50" width="52" height="8" rx="3" fill="#8d96a3"/>
    <path stroke="#b0b8c4" stroke-width="4" d="M12 14V50M52 14V50"/>
    <path fill="#fff4e6" d="M20 20H44L40 32L44 44H20L24 32Z"/>
    ${lines(26, 38, [26, 38], '#c9b8a3')}
    <path fill="none" stroke="#ef5b5b" stroke-width="3" d="M32 17V22M29 19.5L32 22.5L35 19.5M32 47V42M29 44.5L32 41.5L35 44.5"/>`,

  chain: `
    <g fill="none" stroke-width="7" stroke-linecap="round">
      <rect x="6" y="24" width="24" height="16" rx="8" stroke="#8d96a3"/>
      <rect x="34" y="24" width="24" height="16" rx="8" stroke="#8d96a3"/>
      <path stroke="#b0b8c4" d="M22 32H42"/>
    </g>
    <g fill="none" stroke-width="2" stroke="#221d19" stroke-linecap="round">
      <rect x="6" y="24" width="24" height="16" rx="8"/>
      <rect x="34" y="24" width="24" height="16" rx="8"/>
    </g>
    <path fill="#ffb347" d="M30 4L22 18H30L26 28L40 12H31L36 4Z"/>
    ${star(52, 52, 5)}${star(10, 50, 4)}`,

  'tidy-up': `
    <path stroke="#8a5530" stroke-width="4" d="M44 6L30 36"/>
    <path fill="#ffd166" d="M22 32L38 39L34 48Q22 58 8 56Q16 50 18 42Z"/>
    <path fill="none" stroke="#c2750e" stroke-width="1.8" d="M16 46L26 50M19 41L31 46M13 51L22 54"/>
    <circle cx="48" cy="52" r="3" fill="#c9b8a3"/><circle cx="55" cy="46" r="2" fill="#c9b8a3"/><circle cx="57" cy="55" r="2.5" fill="#c9b8a3"/>
    ${star(52, 14, 5)}`,

  screenshot: `
    <rect x="6" y="18" width="52" height="36" rx="6" fill="#5b6472"/>
    <path fill="#5b6472" d="M22 18L26 11H38L42 18Z"/>
    <rect x="44" y="23" width="8" height="5" rx="1.5" fill="#ffd166"/>
    <circle cx="32" cy="36" r="13" fill="#221d19"/>
    <circle cx="32" cy="36" r="9" fill="#4ea8de"/>
    <circle cx="29" cy="33" r="3" fill="#bfe6ff" stroke-width="0"/>
    ${star(56, 8, 5)}`,

  'rename-file': `
    <path fill="none" stroke="#8d8378" stroke-width="2" d="M44 18Q54 4 61 9"/>
    <path fill="#ffb347" d="M8 34L32 10H54V32L30 56Z"/>
    <circle cx="45" cy="19" r="4" fill="#221d19"/>
    <path stroke="#8a5530" stroke-width="3" d="M22 37L35 24M27 43L37 33"/>`,

  discord: `
    <path fill="#8f84c9" d="M20 30C14 20 8 14 1 13C2 17 4 19 6 20C3 21 2 23 2 25C5 26 8 26 10 26C8 28 8 30 9 32C12 33 15 33 18 33C17 35 18 37 20 38Z"/>
    <path fill="#8f84c9" d="M44 30C50 20 56 14 63 13C62 17 60 19 58 20C61 21 62 23 62 25C59 26 56 26 54 26C56 28 56 30 55 32C52 33 49 33 46 33C47 35 46 37 44 38Z"/>
    <path fill="none" stroke="#5b5190" stroke-width="1.8" d="M16 24Q10 20 5 18M16 30Q11 28 6 26M48 24Q54 20 59 18M48 30Q53 28 58 26"/>
    <rect x="13" y="26" width="38" height="27" rx="3" fill="#fff4e6"/>
    <path fill="none" d="M13 29L32 42L51 29"/>
    <circle cx="32" cy="42" r="5" fill="#5865f2"/>`,

  wait: `
    <rect x="12" y="5" width="40" height="7" rx="3" fill="#8a5530"/>
    <rect x="12" y="52" width="40" height="7" rx="3" fill="#8a5530"/>
    <path fill="#dff1ff" d="M17 12H47Q47 26 35 32Q47 38 47 52H17Q17 38 29 32Q17 26 17 12Z"/>
    <path fill="#ffd166" stroke="none" d="M22 18H42Q40 25 32 29Q24 25 22 18Z"/>
    <path fill="#ffd166" stroke="none" d="M20 50Q24 42 32 40Q40 42 44 50Z"/>
    <path stroke="#ffd166" stroke-width="2" d="M32 31V40"/>
    ${star(56, 20, 5)}`,

  'run-command': `
    <rect x="4" y="8" width="42" height="32" rx="5" fill="#241c16"/>
    <path fill="none" stroke="#4cc38a" stroke-width="3" d="M11 18L17 23L11 28M21 30H30"/>
    <path stroke="#8a5530" stroke-width="7" d="M24 58L48 34"/>
    <path stroke="#ffd166" stroke-width="7" d="M44 38L48 34"/>
    ${star(52, 30, 10, '#ff9f1c')}${star(58, 12, 4)}${star(38, 52, 3.5)}`,
};

export function art(id, fallback = '') {
  const body = ART[id];
  if (!body) return `<span class="art-fallback">${fallback}</span>`;
  return `<svg class="art" viewBox="0 0 64 64" aria-hidden="true"><g stroke="${INK}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`;
}
