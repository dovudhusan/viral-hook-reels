import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

/** What a script for this reel may be: the outlines on offer, which closing wording, and the ending. */
export type Offer = { offered: Format[]; cta: number; ending: string };

function drawOffer(job: Job, random: () => number): { recent: Script[]; offer: Offer } {
  const jobsRoot = dirname(job.dir);
  const recent = recentScripts(jobsRoot, job.id);
  const ending = endingOf(job.has('job.json') ? job.readJson<{ ending?: string }>('job.json') : {});
  return { recent, offer: { offered: drawFormats(recent, random), cta: scriptCount(jobsRoot, job.id), ending } };
}
const avoidOf = (offer: Offer) => ({ formats: (Object.keys(FORMATS) as Format[]).filter(f => !offer.offered.includes(f)) });
/** The script with the program's own choices (closing wording, ending) filled in. */
const finished = (answer: unknown, offer: Offer) =>
  (answer && typeof answer === 'object' && (answer as Script).format ? { ...(answer as Script), cta: offer.cta, ending: offer.ending } : answer) as Script;

const SHAPE = {
  format: 'one of the formats on offer', payoff: 0, hook: { start: 0, end: 0 }, stat: '', intro: '',
  triggers: [{ name: '', lines: [''], moment: { start: 0, end: 0 } }], formula: '', caption: '',
};

/**
 * For an agent that writes the script itself instead of the engine asking Claude: writes brief.md, which holds
 * the same instructions, facts and outlines the engine would send, and where the frames are. The draw of outlines
 * is kept in offer.json, so the script handed in later is judged against the same offer.
 */
export function writeBrief(job: Job, config: Config, random: () => number = Math.random): string {
  const meta = job.readJson<Meta>('meta.json');
  const analysis = job.readJson<Analysis>('transcript.json');
  const { recent, offer: drawn } = drawOffer(job, random);
  const offer = job.has('offer.json') ? job.readJson<Offer>('offer.json') : drawn;
  job.writeJson('offer.json', offer);
  const { system, text } = buildPrompt(meta, analysis, config, [], undefined, { recent, ...offer });
  const frames = analysis.frames.filter(f => existsSync(job.path(f)));
  const brief = [
    `# Script brief for job ${job.id}`, '',
    'You write the script for this reel. Look at every frame before you write a word.', '',
    '## The video', '',
    frames.length
      ? `Frames, one per second in order (the first is second 0): ${frames.length} image files, ${job.path(frames[0])} to ${job.path(frames[frames.length - 1])}. Open and look at every one.`
      : 'No frames are available for this video.',
    '', text, '',
    '## Instructions', '', system, '',
    '## What to hand in', '',
    'Save the script as a JSON file with exactly these fields:', '',
    '```json', JSON.stringify(SHAPE, null, 2), '```', '',
    `Then hand it in with: node_modules/.bin/tsx src/cli.ts script ${job.id} <file>`,
    'The engine checks it and lists any problems. Fix all of them and hand it in again.', '',
  ].join('\n');
  writeFileSync(job.path('brief.md'), brief);
  return job.path('brief.md');
}

/** Checks a script written outside the engine against the rules and the offer in offer.json; saves it when it passes. Returns the problems. */
export function submitScript(job: Job, config: Config, answer: unknown): string[] {
  if (!job.has('offer.json')) throw new Error('No brief has been written for this job. Run "prepare" (or "brief") first.');
  const offer = job.readJson<Offer>('offer.json');
  const script = finished(answer, offer);
  const problems = validateScript(script, job.readJson<Meta>('meta.json'), config.cta, avoidOf(offer));
  if (!problems.length) job.writeJson('script.json', script);
  return problems;
}

/**
 * Asks Claude for the script, checks it, retries with the problems, then fails.
 * Each reel is offered a random few of the outlines, never the ones the last reels used, and Claude picks the best fit.
 */
export async function scriptStage(job: Job, config: Config, ask: AskClaude, random: () => number = Math.random): Promise<Script> {
  const meta = job.readJson<Meta>('meta.json');
  const analysis = job.readJson<Analysis>('transcript.json');
  const images = analysis.frames.filter(f => existsSync(job.path(f))).map(f => readFileSync(job.path(f)).toString('base64'));
  const { recent, offer } = drawOffer(job, random);
  const avoid = avoidOf(offer);

  let problems: string[] = [];
  let previous: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const answer = (await ask({ ...buildPrompt(meta, analysis, config, problems, previous, { recent, ...offer }), images })) as Script;
    previous = answer;
    // The wording of the closing line is the program's choice; scripts in the old outline keep the first wording.
    const script = finished(answer, offer);
    problems = validateScript(script, meta, config.cta, avoid);
    if (!problems.length) { job.writeJson('script.json', script); return script; }
  }
  throw new Error(`Script invalid after retry: ${problems.join(' ')}`);
}
