import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Reel } from './clients/instagram';

export type Watched = { username: string; addedAt: string; broken?: boolean };
export type CandidateState = 'offered' | 'approved' | 'made' | 'skipped';
export type Candidate = {
  url: string; shortcode: string; username: string; plays: number; duration: number; caption: string;
  /** Path of the saved cover image, or '' when there is none. */
  cover: string;
  kind: 'promo' | 'general'; reason: string; state: CandidateState; jobId?: string;
  /** How it got here: found by the scout, or sent in by the user. */
  from?: 'scout' | 'inbox';
};
export type Store = ReturnType<typeof openStore>;

/** The engine's small files under data/: who to watch, what was already offered, and each day's shortlist. */
export function openStore(root: string) {
  const dir = join(root, 'data');
  const lists = join(dir, 'shortlists');
  const read = <T>(file: string, empty: T): T => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as T : empty);
  const write = (file: string, value: unknown) => {
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2));
    renameSync(`${file}.tmp`, file);      // a crash mid-write never leaves half a file
  };
  const listFile = (date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Not a date: ${date}`);
    return join(lists, `${date}.json`);
  };
  const store = {
    dir,
    watchlist: () => read<Watched[]>(join(dir, 'watchlist.json'), []),
    saveWatchlist: (w: Watched[]) => write(join(dir, 'watchlist.json'), w),
    seen: () => new Set(read<string[]>(join(dir, 'seen.json'), [])),
    markSeen(shortcodes: string[]) { write(join(dir, 'seen.json'), [...new Set([...store.seen(), ...shortcodes])]); },
    shortlist: (date: string) => read<Candidate[]>(listFile(date), []),
    /** Adds candidates that are not on that day's list yet; what is already there keeps its state. */
    mergeShortlist(date: string, add: Candidate[]): Candidate[] {
      const list = store.shortlist(date);
      const have = new Set(list.map(c => c.shortcode));
      for (const c of add) if (!have.has(c.shortcode)) { list.push(c); have.add(c.shortcode); }
      write(listFile(date), list);
      return list;
    },
    setState(date: string, shortcode: string, state: CandidateState, jobId?: string) {
      const list = store.shortlist(date);
      const c = list.find(x => x.shortcode === shortcode);
      if (!c) throw new Error(`No video ${shortcode} on the shortlist for ${date}`);
      c.state = state;
      if (jobId) c.jobId = jobId;
      write(listFile(date), list);
    },
    /** Days that have a shortlist, newest first. */
    dates: () => (existsSync(lists) ? readdirSync(lists).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map(f => f.slice(0, 10)).sort().reverse() : []),
    /** The day and entry for a video, wherever it was offered. */
    find(shortcode: string): { date: string; candidate: Candidate } | null {
      for (const date of store.dates()) {
        const candidate = store.shortlist(date).find(c => c.shortcode === shortcode);
        if (candidate) return { date, candidate };
      }
      return null;
    },
    /** What each watched account's last scan found, so a day's shortlist costs no new requests. */
    pool: () => read<Record<string, { scannedAt: string; reels: Reel[] }>>(join(dir, 'pool.json'), {}),
    savePool: (p: Record<string, { scannedAt: string; reels: Reel[] }>) => write(join(dir, 'pool.json'), p),
    /** Listing requests made in a month ('2026-11'). */
    requests: (month: string) => read<Record<string, number>>(join(dir, 'requests.json'), {})[month] ?? 0,
    countRequest(month: string) { const all = read<Record<string, number>>(join(dir, 'requests.json'), {}); write(join(dir, 'requests.json'), { ...all, [month]: (all[month] ?? 0) + 1 }); },
    appendBreakdown(entry: string) { mkdirSync(dir, { recursive: true }); appendFileSync(join(dir, 'breakdowns.md'), `${entry.trim()}\n\n`); },
  };
  return store;
}
