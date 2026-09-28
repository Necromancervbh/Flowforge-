// Operating-system integrations: desktop notifications, opening files/URLs and
// running shell commands. User text is always passed as arguments or
// environment variables, never spliced into a shell string.

import { execFile, exec, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const platform = process.platform;

function run(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 15000, windowsHide: true, ...options }, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve({ stdout, stderr });
    });
  });
}

export function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

// "/home/me/Downloads" -> "~/Downloads", for friendlier log messages.
export function tildify(p) {
  const home = os.homedir();
  return p === home || p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p;
}

// Best effort: the UI also shows every notification as a toast, so a missing
// notify-send (for example) is not fatal.
export async function notify(title, message) {
  try {
    if (platform === 'darwin') {
      await run('osascript', [
        '-e', 'on run argv',
        '-e', 'display notification (item 2 of argv) with title (item 1 of argv)',
        '-e', 'end run',
        title, message,
      ]);
    } else if (platform === 'win32') {
      const script = [
        'Add-Type -AssemblyName System.Windows.Forms',
        '$n = New-Object System.Windows.Forms.NotifyIcon',
        '$n.Icon = [System.Drawing.SystemIcons]::Information',
        '$n.Visible = $true',
        '$n.ShowBalloonTip(5000, $env:FF_TITLE, $env:FF_MESSAGE, "Info")',
        'Start-Sleep -Seconds 6',
        '$n.Dispose()',
      ].join('; ');
      run('powershell.exe', ['-NoProfile', '-Command', script], {
        env: { ...process.env, FF_TITLE: title, FF_MESSAGE: message || ' ' },
        timeout: 20000,
      }).catch(() => {});
    } else {
      await run('notify-send', [title, message]);
    }
    return true;
  } catch {
    return false;
  }
}

export async function openTarget(target) {
  if (platform === 'darwin') await run('open', [target]);
  else if (platform === 'win32') await run('rundll32.exe', ['url.dll,FileProtocolHandler', target]);
  else await run('xdg-open', [target]);
}

// Clipboard readers per OS, tried in order (Linux has several).
const CLIPBOARD_READERS = {
  darwin: [['pbpaste', []]],
  win32: [['powershell.exe', ['-NoProfile', '-Command', 'Get-Clipboard -Raw']]],
  linux: [
    ['wl-paste', ['--no-newline']],
    ['xclip', ['-selection', 'clipboard', '-o']],
    ['xsel', ['--clipboard', '--output']],
  ],
};
let clipboardReader = null;

// Returns the clipboard text. Throws if no clipboard tool is installed.
export async function readClipboard() {
  if (clipboardReader) return (await run(...clipboardReader, { timeout: 5000 })).stdout;
  let lastError = new Error('No clipboard support on this system');
  for (const reader of CLIPBOARD_READERS[platform] || CLIPBOARD_READERS.linux) {
    try {
      const { stdout } = await run(...reader, { timeout: 5000 });
      clipboardReader = reader;
      return stdout;
    } catch (err) {
      lastError = err.code === 'ENOENT'
        ? new Error('Install wl-clipboard or xclip so FlowForge can read the clipboard')
        : err;
    }
  }
  throw lastError;
}

// Clipboard writers per OS; text goes in on stdin (or an env var on Windows).
const CLIPBOARD_WRITERS = {
  darwin: [['pbcopy', []]],
  win32: [['powershell.exe', ['-NoProfile', '-Command', 'Set-Clipboard -Value $env:FF_TEXT']]],
  linux: [
    ['wl-copy', []],
    ['xclip', ['-selection', 'clipboard', '-i']],
    ['xsel', ['--clipboard', '--input']],
  ],
};
let clipboardWriter = null;

function pipeTo(file, args, text) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, env: { ...process.env, FF_TEXT: text }, stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => child.kill(), 5000);
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    // wl-copy, xclip and xsel fork a background process that keeps serving
    // the clipboard, so the command itself exits right away.
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0 || code === null) resolve();
      else reject(new Error(stderr.trim() || `${file} exited with ${code}`));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(platform === 'win32' ? '' : text);
  });
}

// Puts text on the clipboard. Throws if no clipboard tool is installed.
export async function writeClipboard(text) {
  if (clipboardWriter) return pipeTo(...clipboardWriter, text);
  let lastError = new Error('No clipboard support on this system');
  for (const writer of CLIPBOARD_WRITERS[platform] || CLIPBOARD_WRITERS.linux) {
    try {
      await pipeTo(...writer, text);
      clipboardWriter = writer;
      return;
    } catch (err) {
      lastError = err.code === 'ENOENT'
        ? new Error('Install wl-clipboard or xclip so FlowForge can use the clipboard')
        : err;
    }
  }
  throw lastError;
}

// The command is the user's own shell snippet; run details are exposed as
// FF_* environment variables so file names can't inject shell syntax.
export function runCommand(command, env) {
  return new Promise((resolve, reject) => {
    exec(command, { timeout: 60000, windowsHide: true, env: { ...process.env, ...env } }, (err, stdout, stderr) => {
      if (err) {
        err.message = `${err.message.trim()}${stderr ? `\n${stderr.trim()}` : ''}`;
        reject(err);
      } else {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      }
    });
  });
}
