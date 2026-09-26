// Fills {{placeholders}} in card settings with values from the run context,
// e.g. "Sorted {{file.name}} at {{time}}".

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;

export function render(text, ctx) {
  return String(text ?? '').replace(PLACEHOLDER, (_, key) => {
    const value = key.split('.').reduce((obj, part) => (obj == null ? undefined : obj[part]), ctx);
    return value == null ? '' : String(value);
  });
}

const pad = (n) => String(n).padStart(2, '0');
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Variables available to every run, whatever the trigger.
export function baseContext(now = new Date()) {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return {
    now,
    date,
    time,
    datetime: `${date} ${time}:${pad(now.getSeconds())}`,
    year: String(now.getFullYear()),
    month: pad(now.getMonth() + 1),
    day: pad(now.getDate()),
    weekday: WEEKDAYS[now.getDay()],
  };
}
