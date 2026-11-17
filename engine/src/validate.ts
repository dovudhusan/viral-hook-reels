import { z } from 'zod';
import type { Format, Meta, Script } from './types';
import { FORMATS, buildNarration, countWords, narrationText, spokenViews } from './narration';

const range = z.object({ start: z.number(), end: z.number() });
export const scriptSchema = z.object({
  hook: range,
  stat: z.string().min(1),
  triggers: z.array(z.object({ name: z.string(), lines: z.array(z.string().min(1)).min(1), moment: range })),
  formula: z.string(),
  caption: z.string().min(1),
  format: z.string().refine(f => f in FORMATS, 'unknown format').optional(),
  payoff: z.number().optional(),
  intro: z.string().optional(),
  cta: z.number().optional(),
  ending: z.string().optional(),
});

/** What a new script must stay clear of: the outlines that are not on offer for this reel. */
export type Avoid = { formats?: Format[] };
/** The longest the untouched opening may run, in seconds. */
export const HOOK_MAX = 35;

/** Length of the whole voiceover, in words. */
export const WORDS = { min: 95, max: 130 };

/** Returns every problem with the script; an empty list means it is valid. */
export function validateScript(script: Script, meta: Meta, cta: { keyword: string; offer: string }, avoid: Avoid = {}): string[] {
  const parsed = scriptSchema.safeParse(script);
  if (!parsed.success) return parsed.error.issues.map(i => `${i.path.join('.') || 'script'}: ${i.message}`);
  const s = parsed.data;
  const problems: string[] = [];

  const outline = s.format ? FORMATS[s.format as Format] : undefined;
  const [least, most] = outline ? outline.beats : [3, 3];
  const countOk = s.triggers.length >= least && s.triggers.length <= most;
  if (!s.format) { if (!countOk) problems.push(`There must be exactly three triggers, found ${s.triggers.length}.`); }
  else {
    if (!countOk) problems.push(`The "${s.format}" format needs ${least === most ? least : `${least} to ${most}`} beats, found ${s.triggers.length}.`);
    if (avoid.formats?.includes(s.format as Format)) problems.push(`The "${s.format}" format is not on offer for this reel. Pick one of the formats listed.`);
    if (countWords(s.formula) < 4) problems.push('formula is too short. Give the formula and one line the viewer can act on.');
    if (s.format === 'timeline' && s.triggers.some((t, i) => i > 0 && t.moment.start <= s.triggers[i - 1].moment.start)) problems.push('In the "timeline" format the beats must come in rising order of time.');
    if (s.hook.start > 2) problems.push(`hook must start at the beginning of the video (second 0), not at ${s.hook.start}. Never skip the start to save time.`);
    if (typeof s.payoff === 'number' && s.hook.end < Math.min(s.payoff + 2, meta.duration, s.hook.start + HOOK_MAX) - 1e-6) problems.push(`hook ends at ${s.hook.end} s, before the payoff at ${s.payoff} s has landed. End the hook at least two seconds after the payoff.`);
  }
  const named = !outline || outline.heading === 'number' || outline.heading === 'name';
  s.triggers.forEach((t, i) => {
    if (named && !t.name.trim()) problems.push(`Beat ${i + 1} needs a name.`);
    if (countWords(t.name) > (s.format ? 4 : 3)) problems.push(`Trigger ${i + 1} name must be one to three words: "${t.name}".`);
    const m = t.moment;
    if (!(m.start >= 0 && m.start < m.end && m.end <= meta.duration + 0.05)) {
      problems.push(`Trigger ${i + 1} moment must lie inside the source (0 to ${meta.duration} s) with start before end.`);
    }
  });

  const wanted = spokenViews(meta.views);
  if (!s.stat.includes(wanted)) problems.push(`stat must contain the exact view wording "${wanted}".`);
  if (!s.formula.trim()) problems.push('formula must not be empty.');

  const len = s.hook.end - s.hook.start;
  const min = Math.min(4, meta.duration);
  const max = s.format ? HOOK_MAX : 22;
  if (!(s.hook.start >= 0 && len >= min - 1e-6 && len <= max + 1e-6)) {
    problems.push(`hook must be 4 to ${max} seconds long and start at 0 or later (got ${len.toFixed(1)} s).`);
  }

  if (countOk) {
    const words = countWords(narrationText(buildNarration(s as Script, cta)));
    const max = s.format ? WORDS.max : 125;
    if (words < WORDS.min || words > max) problems.push(`The voiceover must be ${WORDS.min} to ${max} words in total, it is ${words}.`);
  }
  return problems;
}
