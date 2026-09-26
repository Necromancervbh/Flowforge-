// Operating-system integrations: desktop notifications, opening files/URLs and
// running shell commands. User text is always passed as arguments or
// environment variables, never spliced into a shell string.

import { execFile, exec } from 'node:child_process';
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
