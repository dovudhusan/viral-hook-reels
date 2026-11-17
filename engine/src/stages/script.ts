import { existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Config } from '../config';
import type { Job } from '../job';
import { endingOf } from '../endings';
import { FORMATS, OFFERED } from '../narration';
import type { Analysis, Format, Meta, Script } from '../types';
import { buildPrompt } from '../prompt';
import { recentScripts, scriptCount } from '../recent';
import { validateScript } from '../validate';

export type AskClaude = (req: { system: string; text: string; images: string[] }) => Promise<unknown>;

/** How many outlines Claude may choose between for one reel, and how many recent ones are held back. */
const CHOICES = 3, REST = 3;

/** Draws the outlines on offer for this reel: a random few, leaving out the ones the last reels used. */
export function drawFormats(recent: Script[], random: () => number = Math.random): Format[] {
  const used = new Set(recent.slice(0, REST).map(r => r.format));
  const pool = OFFERED.filter(f => !used.has(f));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, CHOICES);
}

/**
 * Asks Claude for the script, checks it, retries with the problems, then fails.
 * Each reel is offered a random few of the outlines, never the ones the last reels used, and Claude picks the best fit.
 */
export async function scriptStage(job: Job, config: Config, ask: AskClaude, random: () => number = Math.random): Promise<Script> {
  const meta = job.readJson<Meta>('meta.json');
  const analysis = job.readJson<Analysis>('transcript.json');
  const images = analysis.frames.filter(f => existsSync(job.path(f))).map(f => readFileSync(job.path(f)).toString('base64'));
  const jobsRoot = dirname(job.dir);
  const recent = recentScripts(jobsRoot, job.id);
  const offered = drawFormats(recent, random);
  const cta = scriptCount(jobsRoot, job.id);
  const ending = endingOf(job.has('job.json') ? job.readJson<{ ending?: string }>('job.json') : {});
  const avoid = { formats: (Object.keys(FORMATS) as Format[]).filter(f => !offered.includes(f)) };

  let problems: string[] = [];
  let previous: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const answer = (await ask({ ...buildPrompt(meta, analysis, config, problems, previous, { recent, offered, cta, ending }), images })) as Script;
    previous = answer;
    // The wording of the closing line is the program's choice; scripts in the old outline keep the first wording.
    const script = answer && typeof answer === 'object' && answer.format ? { ...answer, cta, ending } : answer;
    problems = validateScript(script, meta, config.cta, avoid);
    if (!problems.length) { job.writeJson('script.json', script); return script; }
  }
  throw new Error(`Script invalid after retry: ${problems.join(' ')}`);
}
