import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Exec } from './exec';
import { resolveOutputDir } from './config';
import { shortcodeFromUrl } from './clients/instagram';
import { RULES } from './scout';
import type { Candidate, CandidateState, Store, Watched } from './store';
import type { Status } from './types';

const USERNAME = /^[a-z0-9._]{1,30}$/;

/** Adds an account by @username, profile link, or (through `usernameOfReel`) the link of one of its reels. */
export async function watchAdd(store: Store, input: string, usernameOfReel: (url: string) => Promise<string>, today: string): Promise<Watched[]> {
  const raw = shortcodeFromUrl(input) ? await usernameOfReel(input) : input;
  const username = raw.trim().replace(/^@/, '').replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, '').replace(/[/?].*$/, '').toLowerCase();
  if (!USERNAME.test(username)) throw new Error(`Not an Instagram username: ${input}`);
  const list = store.watchlist();
  if (list.some(w => w.username === username)) throw new Error(`@${username} is already on the watchlist`);
  if (list.length >= RULES.maxAccounts) throw new Error(`The watchlist is full (${RULES.maxAccounts} accounts). Remove one first.`);
  const next = [...list, { username, addedAt: today }];
  store.saveWatchlist(next);
  return next;
}

export function watchRemove(store: Store, username: string): Watched[] {
  const name = username.trim().replace(/^@/, '').toLowerCase();
  const list = store.watchlist();
  if (!list.some(w => w.username === name)) throw new Error(`@${name} is not on the watchlist`);
  const next = list.filter(w => w.username !== name);
  store.saveWatchlist(next);
  return next;
}

/** A day's shortlist; without a date, the newest one. */
export function shortlistGet(store: Store, date?: string): { date: string | null; candidates: Candidate[] } {
  const day = date ?? store.dates()[0] ?? null;
  return { date: day, candidates: day ? store.shortlist(day) : [] };
}

export function shortlistSet(store: Store, date: string, shortcode: string, state: string): void {
  if (!['approved', 'skipped', 'offered'].includes(state)) throw new Error('State must be approved, skipped or offered');
  const current = store.shortlist(date).find(c => c.shortcode === shortcode);
  if (current?.state === 'made') throw new Error('That reel is already made');
  store.setState(date, shortcode, state as CandidateState);
}

export type HistoryEntry = { jobId: string; url: string; title: string; file: string | null; madeAt: string; state: 'done' | 'failed' | 'running'; failedStage?: string; reason?: string };

/** Every job, newest first, with enough to show it and to retry a failed one. */
export function history(jobsRoot: string): HistoryEntry[] {
  if (!existsSync(jobsRoot)) return [];
  const read = <T>(dir: string, name: string): T | null => {
    try { return JSON.parse(readFileSync(join(jobsRoot, dir, name), 'utf8')) as T; } catch { return null; }
  };
  return readdirSync(jobsRoot).filter(d => /^\d{8}-\d{6}-[0-9a-f]{6}$/.test(d)).sort().reverse().map(jobId => {
    const status = read<Status>(jobId, 'status.json');
    const done = status?.stage === 'deliver' && status.state === 'done';
    const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(jobId)!;
    return {
      jobId, url: read<{ url: string }>(jobId, 'job.json')?.url ?? '',
      title: read<{ caption: string }>(jobId, 'script.json')?.caption ?? '',
      file: done ? read<{ file: string }>(jobId, 'deliver.json')?.file ?? null : null,
      madeAt: `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`,
      // A job whose process died mid-stage still says "running"; with nothing running it, that is a failure to retry.
      state: done ? 'done' as const : status?.state === 'running' ? 'running' as const : 'failed' as const,
      ...(done ? {} : { failedStage: status?.stage ?? 'fetch', reason: status?.error ?? (status?.state === 'running' ? 'Stopped before it finished' : 'Did not start') }),
    };
  });
}

const SETTINGS = {
  keyword: (v: string) => { if (!/^[A-Za-z0-9]{2,20}$/.test(v)) throw new Error('The keyword must be one word of 2 to 20 letters or digits'); return v.toLowerCase(); },
  offer: (v: string) => { if (v.trim().length < 5 || v.length > 160) throw new Error('The offer must be 5 to 160 characters'); return v.trim(); },
  voiceTempo: (v: string) => { const n = Number(v); if (!(n >= 1 && n <= 1.4)) throw new Error('Voice speed must be between 1.0 and 1.4'); return n; },
  musicVolume: (v: string) => { const n = Number(v); if (!(n >= 0 && n <= 0.4)) throw new Error('Music volume must be between 0 and 0.4'); return n; },
} as const;

export function settingsGet(root: string): { keyword: string; offer: string; voiceTempo: number; musicVolume: number; driveFolderUrl: string } {
  const raw = JSON.parse(readFileSync(join(root, 'config.json'), 'utf8'));
  return { keyword: raw.cta?.keyword ?? '', offer: raw.cta?.offer ?? '', voiceTempo: raw.voiceTempo ?? 1.15, musicVolume: raw.musicVolume ?? 0.14, driveFolderUrl: raw.driveFolderUrl ?? '' };
}

/** Changes one setting in config.json and leaves every other key as it was. */
export function settingsSet(root: string, key: string, value: string): void {
  if (!Object.hasOwn(SETTINGS, key)) throw new Error(`Unknown setting: ${key}. Use keyword, offer, voiceTempo or musicVolume.`);
  if (!value.trim()) throw new Error(`Give a value for ${key}`);
  const clean = SETTINGS[key as keyof typeof SETTINGS](value);
  const file = join(root, 'config.json');
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  if (key === 'keyword' || key === 'offer') raw.cta = { ...raw.cta, [key]: clean };
  else raw[key] = clean;
  writeFileSync(`${file}.tmp`, `${JSON.stringify(raw, null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
}

/** Which of the things the engine needs are in place. Reports yes or no only, never a value. */
export async function doctor(exec: Exec, root: string, env: NodeJS.ProcessEnv): Promise<Record<string, boolean>> {
  const runs = async (cmd: string, args: string[]) => { try { await exec(cmd, args); return true; } catch { return false; } };
  let driveFolder = false;
  try { driveFolder = existsSync(resolveOutputDir(JSON.parse(readFileSync(join(root, 'config.json'), 'utf8')).outputDir)); } catch { /* stays false */ }
  const has = (name: string) => Boolean(env[name]?.trim());
  return {
    ffmpeg: await runs('ffmpeg', ['-version']), ytdlp: await runs('yt-dlp', ['--version']), claude: await runs('claude', ['--version']),
    driveFolder, voiceKey: has('ELEVENLABS_API_KEY'), telegram: has('TELEGRAM_BOT_TOKEN') && has('TELEGRAM_CHAT_ID'), scoutKey: has('RAPIDAPI_KEY'),
  };
}
