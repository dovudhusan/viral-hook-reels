import { IgAuthError, IgRateError, type Reel } from './clients/instagram';
import { SourceBlockedError, type ReelSource } from './clients/reelSource';
import type { Notify } from './stages/deliver';
import type { Candidate, Store } from './store';

export const RULES = { minPlays: 2_000_000, minSeconds: 7, maxSeconds: 90, pool: 12, shortlist: 5, maxGeneral: 1, maxAccounts: 25 };

export type Pick = { shortcode: string; kind: 'promo' | 'general'; reason: string };
export type ScoutDeps = {
  source: ReelSource; store: Store; notify: Notify;
  /** Claude's choice among the pool; `covers[i]` is the saved cover of `pool[i]` ('' if none). */
  rank: (pool: Reel[], covers: string[]) => Promise<Pick[]>;
  saveCover: (reel: Reel) => Promise<string>;
  pause: () => Promise<void>;
  today: string;
  budget: { everyDays: number; perMonth: number };
  /** Looks one video up for its length and caption (listings may leave them out). */
  detail?: (reel: Reel) => Promise<Reel>;
};

/** Viral, the right length and not offered before: the most played of those. */
export function pickPool(reels: Reel[], seen: Set<string>): Reel[] {
  const byCode = new Map<string, Reel>();
  for (const r of reels) {
    const lengthKnown = r.duration > 0;      // 0 means the listing did not say; those are checked later
    if (r.plays < RULES.minPlays || (lengthKnown && (r.duration < RULES.minSeconds || r.duration > RULES.maxSeconds)) || seen.has(r.shortcode)) continue;
    if (!byCode.has(r.shortcode)) byCode.set(r.shortcode, r);
  }
  return [...byCode.values()].sort((a, b) => b.plays - a.plays).slice(0, RULES.pool);
}

/** Claude's picks made safe: only videos from the pool, each once, at most one "general", topped up by play count. */
export function settlePicks(pool: Reel[], picks: Pick[], covers: string[] = []): Candidate[] {
  const chosen = new Map<string, Pick>();
  let general = 0;
  for (const p of picks) {
    if (chosen.size >= RULES.shortlist) break;
    if (!pool.some(r => r.shortcode === p.shortcode) || chosen.has(p.shortcode)) continue;
    const kind = p.kind === 'general' ? 'general' : 'promo';
    if (kind === 'general' && ++general > RULES.maxGeneral) continue;
    chosen.set(p.shortcode, { shortcode: p.shortcode, kind, reason: String(p.reason ?? '').trim() || 'Picked by Claude' });
  }
  for (const r of pool) {
    if (chosen.size >= RULES.shortlist) break;
    if (!chosen.has(r.shortcode)) chosen.set(r.shortcode, { shortcode: r.shortcode, kind: 'promo', reason: 'High play count' });
  }
  return [...chosen.values()].map(p => {
    const i = pool.findIndex(r => r.shortcode === p.shortcode);
    const r = pool[i];
    return { url: r.url, shortcode: r.shortcode, username: r.username, plays: r.plays, duration: r.duration, caption: r.caption,
      cover: covers[i] ?? '', kind: p.kind, reason: p.reason, state: 'offered' as const, from: 'scout' as const };
  });
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/**
 * Adds up to five new videos to today's shortlist. Never starts a reel.
 * Accounts are only read again once their last scan is `everyDays` old and the month's request allowance is not used up;
 * in between, the shortlist is drawn from what the earlier scans found.
 */
export async function scout(d: ScoutDeps): Promise<{ offered: number; broken: string[]; requests: number }> {
  const watch = d.store.watchlist();
  if (!watch.length) {
    await d.notify('Hook Reels: the watchlist is empty, so there was nothing to scan.');
    return { offered: 0, broken: [], requests: 0 };
  }
  const month = d.today.slice(0, 7);
  const cache = d.store.pool();
  const due = watch.filter(w => !cache[w.username] || daysBetween(cache[w.username].scannedAt, d.today) >= d.budget.everyDays)
    .sort((x, y) => (cache[x.username]?.scannedAt ?? '').localeCompare(cache[y.username]?.scannedAt ?? ''))
    .slice(0, RULES.maxAccounts);
  const broken: string[] = [], read: string[] = [];
  let requests = 0;
  for (const w of due) {
    if (d.store.requests(month) >= d.budget.perMonth) break;      // this month's allowance is spent; the rest wait
    if (requests > 0) await d.pause();
    d.store.countRequest(month); requests++;
    try {
      cache[w.username] = { scannedAt: d.today, reels: await d.source.reelsOf(w.username) };
      d.store.savePool(cache);
      read.push(w.username);
    } catch (e) {
      if (e instanceof SourceBlockedError) {
        if (!Object.keys(cache).length) {
          try { await d.notify(`Hook Reels: today's scan could not run. ${e.message}`); } catch { /* the error itself is reported by the caller */ }
          throw e;
        }
        break;      // out of requests part-way: keep what was found
      }
      broken.push(w.username);
    }
  }
  if (requests > 0 && !read.length && !Object.keys(cache).length) {
    // Not one account answered and nothing is saved from before: that is an outage, not a list of broken accounts.
    const reason = 'none of the watched accounts could be read (network or API problem)';
    try { await d.notify(`Hook Reels: today's scan could not run: ${reason}.`); } catch { /* reported by the caller */ }
    throw new Error(`The scan could not run: ${reason}`);
  }
  // The scan takes a while; the list may have been edited meanwhile, so only the flags are touched.
  const current = d.store.watchlist();
  d.store.saveWatchlist(current.map(w => {
    const { broken: _was, ...rest } = w;
    return broken.includes(w.username) && read.length ? { ...rest, broken: true } : read.includes(w.username) ? rest : w;
  }));

  const reels = current.flatMap(w => cache[w.username]?.reels ?? []);
  let pool = pickPool(reels, d.store.seen());
  if (d.detail) {
    // Listings do not say how long a video is; look the shortlisted ones up and drop any that turn out too short or long.
    const full: Reel[] = [];
    let lookupWorks = true;
    for (const r of pool) {
      if (!lookupWorks || r.duration > 0) { full.push(r); continue; }
      try { full.push({ ...await d.detail(r), username: r.username }); }
      catch (e) { if (e instanceof IgAuthError || e instanceof IgRateError) lookupWorks = false; full.push(r); }
    }
    const tooOdd = full.filter(r => r.duration > 0 && (r.duration < RULES.minSeconds || r.duration > RULES.maxSeconds)).map(r => r.shortcode);
    if (tooOdd.length) d.store.markSeen(tooOdd);      // never look these up again
    pool = full.filter(r => !tooOdd.includes(r.shortcode));
  }
  if (!pool.length) {
    try { await d.notify('Hook Reels: nothing new over 2M today.'); } catch { /* nothing to lose */ }
    return { offered: 0, broken, requests };
  }
  const covers = await Promise.all(pool.map(r => d.saveCover(r).catch(() => '')));
  let picks: Pick[] = [];
  try { picks = await d.rank(pool, covers); }
  catch (e) { console.error(`Claude could not rank the videos, so the most played are offered: ${(e as Error).message.split('\n')[0]}`); }
  const candidates = settlePicks(pool, picks, covers);
  d.store.mergeShortlist(d.today, candidates);
  d.store.markSeen(candidates.map(c => c.shortcode));
  // The shortlist is saved; a Telegram hiccup must not make the scan look failed.
  try { await d.notify(`${candidates.length} ${candidates.length === 1 ? 'video' : 'videos'} to review in Hook Reels`); }
  catch (e) { console.error(`Telegram message not sent: ${(e as Error).message.split('\n')[0]}`); }
  return { offered: candidates.length, broken, requests };
}
