import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Script, StageName } from './types';
import { shortcodeFromUrl } from './clients/instagram';
import type { Store } from './store';

/** What the engine reports while it works, one JSON line each when run with --json. */
export type EngineEvent =
  | { event: 'job'; jobId: string; url: string }
  | { event: 'stage'; stage: StageName; state: 'started' | 'finished' }
  | { event: 'failed'; stage: StageName; reason: string }
  | { event: 'done'; jobId: string; file: string; caption: string; title: string };
export type Emit = (e: EngineEvent) => void;

/** Name of the copy of the breakdowns file kept next to the finished reels. */
export const BREAKDOWNS_COPY = 'Hook breakdowns.md';

/**
 * After a reel is finished: tick it off on the shortlist, never offer the video again, and note its breakdown.
 * With `copyTo` (the folder the reels go to) the whole breakdowns file is copied there as well.
 */
export function recordMade(store: Store, o: { url: string; jobId: string; script: Script; date: string; copyTo?: string }): void {
  const code = shortcodeFromUrl(o.url);
  if (code) {
    const hit = store.find(code);
    if (hit) store.setState(hit.date, code, 'made', o.jobId);
    store.markSeen([code]);
  }
  store.appendBreakdown([
    `## ${o.script.caption}`, `Made: ${o.date}`, `Source: ${o.url}`, ...(o.script.format ? [`Format: ${o.script.format}`] : []), `Hook: ${o.script.stat}`,
    ...o.script.triggers.map((t, i) => `${i + 1}. ${t.name ? `${t.name}: ` : ''}${t.lines.join(' ')}`), `${o.script.format ? 'Takeaway' : 'Formula'}: ${o.script.formula}`,
  ].join('\n'));
  if (o.copyTo && existsSync(o.copyTo)) copyFileSync(join(store.dir, 'breakdowns.md'), join(o.copyTo, BREAKDOWNS_COPY));
}
