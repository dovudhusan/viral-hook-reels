import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Script } from './types';

/** The scripts of the most recent other jobs, newest first: what a new script must not repeat. */
export function recentScripts(jobsRoot: string, exceptId: string, limit = 10): Script[] {
  if (!existsSync(jobsRoot)) return [];
  const out: Script[] = [];
  for (const id of readdirSync(jobsRoot).filter(d => /^\d{8}-\d{6}-[0-9a-f]{6}$/.test(d) && d !== exceptId).sort().reverse()) {
    try { out.push(JSON.parse(readFileSync(join(jobsRoot, id, 'script.json'), 'utf8')) as Script); } catch { /* no script yet */ }
    if (out.length >= limit) break;
  }
  return out;
}

/** How many other jobs have a script: used to rotate the wording of the call to action. */
export const scriptCount = (jobsRoot: string, exceptId: string) => recentScripts(jobsRoot, exceptId, Infinity).length;
