import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Exec } from '../exec';

/** GET https://www.instagram.com<path> as the logged-in user; resolves with the parsed JSON. */
export type IgGet = (path: string) => Promise<unknown>;

/** The Chrome session is missing or expired. */
export class IgAuthError extends Error {
  constructor() { super('Log into Instagram in Chrome'); }
}
/** Instagram asked us to slow down. */
export class IgRateError extends Error {
  constructor() { super('Instagram is rate-limiting requests; try again later'); }
}

export type Reel = {
  url: string; shortcode: string; username: string; userId: string;
  /** `duration` is 0 when the source did not say how long the video is. */
  plays: number; duration: number; caption: string; cover: string; takenAt: number;
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
/** yt-dlp only reads the browser's cookies once an Instagram extractor asks for them, so it is pointed at a post. */
export const SESSION_PROBE = 'https://www.instagram.com/reel/Dc8ninRMfJQ/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

/** Instagram's numeric media id for the code in a post link. */
export function shortcodeToPk(shortcode: string): string {
  let pk = 0n;
  for (const c of shortcode) {
    const i = ALPHABET.indexOf(c);
    if (i < 0) throw new Error(`Not an Instagram link code: ${shortcode}`);
    pk = pk * 64n + BigInt(i);
  }
  return pk.toString();
}

/** The code from a /p/, /reel/ or /reels/ link; null for anything else. */
export function shortcodeFromUrl(url: string): string | null {
  return /instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels)\/([A-Za-z0-9_-]+)/.exec(url)?.[1] ?? null;
}

/** The Cookie header for instagram.com from a Netscape cookie file. */
export function cookieHeader(jar: string): string {
  const pairs: string[] = [];
  for (const raw of jar.split('\n')) {
    const line = raw.startsWith('#HttpOnly_') ? raw.slice('#HttpOnly_'.length) : raw;
    if (!line.trim() || line.startsWith('#')) continue;
    const f = line.split('\t');
    if (f.length >= 7 && /(^|\.)instagram\.com$/.test(f[0])) pairs.push(`${f[5]}=${f[6].trim()}`);
  }
  return pairs.join('; ');
}

/** Turns one HTTP answer into JSON, or the error that explains it. */
export async function readAnswer(res: { status: number; headers: { get(n: string): string | null }; text(): Promise<string> }): Promise<unknown> {
  if (res.status === 429) throw new IgRateError();
  const body = await res.text();
  const html = (res.headers.get('content-type') ?? '').includes('html') || body.trimStart().startsWith('<');
  if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400) || (html && /not-logged-in|login/i.test(body))) throw new IgAuthError();
  if (res.status === 404) throw new Error('Instagram could not find that');
  let json: any;
  try { json = JSON.parse(body); } catch { throw new Error(`Instagram answered with something unexpected (HTTP ${res.status})`); }
  if (json?.require_login || json?.message === 'login_required') throw new IgAuthError();
  if (res.status >= 400) throw new Error(`Instagram refused the request (HTTP ${res.status})`);
  return json;
}

const PREFIX = 'hook-reels-ig-';
const open = new Set<string>();

/** Removes the cookie folders of this process right now (called when the process is told to stop). */
export function dropSessions(): void {
  for (const dir of open) rmSync(dir, { recursive: true, force: true });
  open.clear();
}

/** Removes cookie folders an earlier run left behind because it was killed (older than two minutes, so a live run is safe). */
export function sweepSessions(base = tmpdir(), now = Date.now()): void {
  let names: string[] = [];
  try { names = readdirSync(base); } catch { return; }
  for (const name of names) {
    if (!name.startsWith(PREFIX)) continue;
    const dir = join(base, name);
    try { if (now - statSync(dir).mtimeMs > 120_000) rmSync(dir, { recursive: true, force: true }); } catch { /* gone already */ }
  }
}

/**
 * Runs `fn` with a getter that is signed in as the user's browser session.
 * The cookies live in a temporary file only while this runs; they are never logged or kept.
 */
export async function withSession<T>(exec: Exec, browser: string, fn: (get: IgGet) => Promise<T>): Promise<T> {
  sweepSessions();
  const dir = mkdtempSync(join(tmpdir(), PREFIX));
  open.add(dir);
  try {
    const jar = join(dir, 'jar');
    // Whether or not that post still exists, all we need is the cookie file yt-dlp writes.
    try { await exec('yt-dlp', ['-q', '--no-warnings', '--cookies-from-browser', browser, '--cookies', jar, '--skip-download', SESSION_PROBE]); } catch { /* checked below */ }
    const cookie = existsSync(jar) ? cookieHeader(readFileSync(jar, 'utf8')) : '';
    rmSync(jar, { force: true });
    if (!/(^|; )sessionid=/.test(cookie)) throw new IgAuthError();
    const get: IgGet = async path => readAnswer(await fetch(`https://www.instagram.com${path}`, {
      redirect: 'manual', headers: { Cookie: cookie, 'X-IG-App-ID': '936619743392459', 'User-Agent': UA, Accept: 'application/json' },
    }));
    return await fn(get);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    open.delete(dir);
  }
}

/** One Instagram media object as a Reel; null when it is not a video with a play count. */
export function toReel(m: any, needDuration = true): Reel | null {
  const plays = m?.play_count ?? m?.ig_play_count ?? m?.view_count;
  if (typeof m?.code !== 'string' || !/^[A-Za-z0-9_-]+$/.test(m.code) || typeof plays !== 'number' || (needDuration && !m.video_duration)) return null;
  return {
    url: `https://www.instagram.com/reel/${m.code}/`, shortcode: m.code,
    username: m.user?.username ?? '', userId: String(m.user?.pk ?? m.user?.id ?? ''),
    plays, duration: m.video_duration ?? 0, caption: m.caption?.text ?? '',
    cover: m.image_versions2?.candidates?.[0]?.url ?? '', takenAt: m.taken_at ?? 0,
  };
}

/** Play count, length, account and caption of one reel. */
export async function mediaInfo(get: IgGet, url: string): Promise<Reel> {
  const code = shortcodeFromUrl(url);
  if (!code) throw new Error(`Not an Instagram post link: ${url}`);
  const json = await get(`/api/v1/media/${shortcodeToPk(code)}/info/`) as any;
  const reel = toReel(json?.items?.[0]);
  if (!reel) throw new Error('That Instagram post is not a video with a play count');
  return reel;
}

/** The account behind a username, or behind a reel link. */
export async function resolveUser(get: IgGet, usernameOrUrl: string): Promise<{ id: string; username: string }> {
  if (shortcodeFromUrl(usernameOrUrl)) {
    const reel = await mediaInfo(get, usernameOrUrl);
    return { id: reel.userId, username: reel.username };
  }
  const username = usernameOrUrl.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '').toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(username)) throw new Error(`Not an Instagram username: ${usernameOrUrl}`);
  const json = await get(`/api/v1/web/search/topsearch/?context=user&query=${encodeURIComponent(username)}`) as any;
  const hit = (json?.users ?? []).map((u: any) => u.user).find((u: any) => u?.username?.toLowerCase() === username);
  if (!hit) throw new Error(`No Instagram account called ${username}`);
  return { id: String(hit.pk ?? hit.id), username: hit.username };
}

/** The account's most recent videos that report a play count, newest first. */
export async function recentReels(get: IgGet, userId: string): Promise<Reel[]> {
  const json = await get(`/api/v1/feed/user/${encodeURIComponent(userId)}/?count=24`) as any;
  return (json?.items ?? []).map(toReel).filter((r: Reel | null): r is Reel => r !== null);
}
