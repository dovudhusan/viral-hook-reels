import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Exec } from './exec';

export const LABEL = 'io.postaxis.hookreels.scout';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function parseTime(time: string): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  const h = Number(m?.[1]), min = Number(m?.[2]);
  if (!m || h > 23 || min > 59) throw new Error(`Not a time of day (HH:MM): ${time}`);
  return [h, min];
}

/** The launchd job that runs the scout once a day (and on wake, if the Mac was asleep at that time). */
export function plistFor(time: string, nodePath: string, repo: string, home = ''): string {
  const [hour, minute] = parseTime(time);
  // launchd starts with a bare PATH: list every place the engine's tools live, including where the claude command installs itself.
  const path = [dirname(nodePath), ...(home ? [join(home, '.local', 'bin'), join(home, '.claude', 'local')] : []), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'].join(':');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array>
    <string>${esc(join(repo, 'node_modules', '.bin', 'tsx'))}</string><string>${esc(join(repo, 'src', 'cli.ts'))}</string><string>scout</string>
  </array>
  <key>WorkingDirectory</key><string>${esc(repo)}</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${esc(path)}</string></dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>${minute}</integer></dict>
  <key>StandardOutPath</key><string>${esc(join(repo, 'data', 'scout.log'))}</string>
  <key>StandardErrorPath</key><string>${esc(join(repo, 'data', 'scout.log'))}</string>
</dict></plist>
`;
}

export type ScheduleEnv = { exec: Exec; home: string; uid: number; nodePath: string; repo: string; wait?: () => Promise<void> };
const file = (home: string) => join(home, 'Library', 'LaunchAgents', `${LABEL}.plist`);

export async function installSchedule(e: ScheduleEnv, time: string): Promise<void> {
  const plist = plistFor(time, e.nodePath, e.repo, e.home);
  mkdirSync(dirname(file(e.home)), { recursive: true });
  mkdirSync(join(e.repo, 'data'), { recursive: true });
  try { await e.exec('launchctl', ['bootout', `gui/${e.uid}/${LABEL}`]); } catch { /* it was not loaded */ }
  writeFileSync(file(e.home), plist);
  // Loading straight after unloading sometimes fails once; if it keeps failing, leave nothing behind that looks switched on.
  for (let attempt = 1; ; attempt++) {
    try { await e.exec('launchctl', ['bootstrap', `gui/${e.uid}`, file(e.home)]); break; }
    catch (err) {
      if (attempt >= 3) { rmSync(file(e.home), { force: true }); throw new Error(`The daily scan could not be switched on: ${(err as Error).message}`); }
      await (e.wait ?? (() => new Promise<void>(r => setTimeout(r, 1000))))();
    }
  }
}

export async function removeSchedule(e: ScheduleEnv): Promise<void> {
  try { await e.exec('launchctl', ['bootout', `gui/${e.uid}/${LABEL}`]); } catch { /* it was not loaded */ }
  rmSync(file(e.home), { force: true });
}

export function scheduleStatus(home: string): { enabled: boolean; time: string } {
  if (!existsSync(file(home))) return { enabled: false, time: '09:00' };
  const text = readFileSync(file(home), 'utf8');
  const hour = Number(/<key>Hour<\/key><integer>(\d+)/.exec(text)?.[1] ?? 9), minute = Number(/<key>Minute<\/key><integer>(\d+)/.exec(text)?.[1] ?? 0);
  return { enabled: true, time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}
