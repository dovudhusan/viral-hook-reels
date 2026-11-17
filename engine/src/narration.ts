import { endingLines, endingOf } from './endings';
import { EXAMPLES } from './examples';
import type { Format, Script, Segment, SegmentId } from './types';

export const SETUP_LINE = 'So why did it work? Three simple triggers.';
export const FORMULA_PREFIX = "That's the formula.";
const ORDINALS = ['one', 'two', 'three', 'four'] as const;

/** How a beat is announced: "Number one, Name.", "Second 3.", the name alone, or nothing. */
type Heading = 'number' | 'second' | 'name' | 'none';
export type Outline = { beats: [number, number]; heading: Heading; about: string; example?: string; retired?: boolean };

/**
 * The outlines a breakdown can follow. Nine are offered to new scripts; src/examples.ts holds an example
 * voiceover for each, shown to the script writer for pacing and shape.
 */
export const FORMATS: Record<Format, Outline> = {
  'ad-reveal': {
    beats: [3, 3], heading: 'number',
    about: 'For a video that turns out to be an ad. stat: "This video pulled over N views, and surprisingly, it was an ad for <product>." intro: "The creator used three simple psychology triggers." Three triggers that follow the story in order, the last one about how the brand or product lands. formula: "That\'s the formula, <A> to <B> to <C>." then one "Don\'t just ..., ..." line.',
    example: EXAMPLES['ad-reveal'],
  },
  'named-hook': {
    beats: [3, 3], heading: 'number',
    about: 'Give the hook a name. stat: "This video pulled N views, and it used one powerful hook, the <name> hook." intro: "So why did it work? Three simple triggers." Three triggers, each one a step of that hook. formula: "That\'s the formula." then one imperative sentence.',
    example: EXAMPLES['named-hook'],
  },
  'one-trigger': {
    beats: [3, 3], heading: 'none',
    about: 'One trigger, told as a short story instead of a list. stat: "This video pulled N views, and your brain fell for it before you even realized." intro: "So, why did it work? One simple trigger: <name> hook." Three unnamed beats (leave name empty) that walk through it: what it looks like at first, the moment it turns, what the viewer does next (rewatch, share). formula: "That\'s the formula. Make them <X>, then <Y>."',
    example: EXAMPLES['one-trigger'],
  },
  'crazy-part': {
    beats: [3, 3], heading: 'number',
    about: 'Lead with one surprising fact. stat: "This video pulled N views, but here\'s the crazy part. <one surprising thing that is true of this video and visible in it>." intro: "So why? Two simple triggers." The first two beats are the two triggers. The third beat is named "Why it spreads" and says why people send it to someone or comment. formula: "That\'s the formula." then one imperative sentence.',
    example: EXAMPLES['crazy-part'],
  },
  'same-concept': {
    beats: [2, 2], heading: 'number',
    about: 'A concept any brand can copy. stat: "This video pulled N views, and any brand can use the exact same concept." intro: "So why does it work? Two simple triggers." Two longer triggers; the second one ends on the payoff the brain was waiting for. formula: "That\'s the formula. Don\'t just <show the thing>. Make them want to <uncover it>."',
    example: EXAMPLES['same-concept'],
  },
  'odd-setting': {
    beats: [3, 3], heading: 'number',
    about: 'For a video where something ordinary happens in the wrong place or the wrong way. stat: "This video hit over N views, and it wasn\'t <what you would expect>, it was <what it really was>." intro: "So why did it work? Three simple triggers." Three triggers; use short fragments that list what is on screen ("Tomato. Onion. Oil.") and the questions the viewer asks. formula: "That\'s the formula." then one or two imperative sentences.',
    example: EXAMPLES['odd-setting'],
  },
  timing: {
    beats: [3, 3], heading: 'number',
    about: 'Two triggers inside the video and one outside it. stat: "This video pulled over N views" plus the interesting part. intro: "So how did it get so many views? Three simple psychology triggers." The first two triggers are in the video; the third is why it fits what people already care about (a season, a fear everyone has, a habit, a trend) and only if the frames or speech really show it. formula: "That\'s the formula, <A> to <B> to <C>."',
    example: EXAMPLES['timing'],
  },
  'this-is': {
    beats: [2, 3], heading: 'number',
    about: 'Open by labelling it, the way the channel labels clips. stat: "This is a <name> hook, and it pulled N views." intro: "Here\'s how it works." or "So why does it work? Two simple triggers." Two or three triggers. formula: "That\'s the formula." then one imperative sentence.',
    example: EXAMPLES['this-is'],
  },
  contrast: {
    beats: [3, 3], heading: 'number',
    about: 'The polished version against what this video did. stat: "This video pulled N views by doing what most <brands / creators> would cut out." intro: "So why? Three simple triggers." Trigger one: why the perfect, expected version gets scrolled past. Trigger two: what this video did instead, and the moment it happens. Trigger three: why that feels human or real. formula: "That\'s the formula, <A> to <B> to <C>." then one line of advice.',
    example: EXAMPLES['contrast'],
  },
  triggers: { beats: [3, 3], heading: 'number', about: '', retired: true },
  hook: { beats: [2, 3], heading: 'none', about: '', retired: true },
  timeline: { beats: [3, 4], heading: 'second', about: '', retired: true },
  steal: { beats: [2, 3], heading: 'name', about: '', retired: true },
};
/** The outlines new scripts may use. */
export const OFFERED = (Object.keys(FORMATS) as Format[]).filter(f => !FORMATS[f].retired);

/** What is spoken before a beat's lines, or null when the beat has no heading. */
export function beatHeading(script: Script, i: number): string | null {
  const t = script.triggers[i];
  const name = t.name.trim().replace(/[.!?]+$/, '');
  const heading = script.format ? FORMATS[script.format].heading : 'number';
  if (heading === 'number') return `Number ${ORDINALS[i] ?? i + 1}, ${name}.`;
  if (heading === 'second') return `Second ${Math.max(0, Math.round(t.moment.start))}.`;
  return heading === 'name' && name ? `${name}.` : null;
}

/** View count as it is spoken: one decimal, rounded down, ".0" dropped. */
export function spokenViews(views: number): string {
  for (const [unit, name] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']] as const) {
    if (views >= unit) return `${Math.floor(views / (unit / 10)) / 10} ${name}`;
  }
  return String(Math.floor(views));
}

/** The sentence the reel closes on. */
export function closingLine(script: Pick<Script, 'ending' | 'cta' | 'format'>, cta: { keyword: string; offer: string }): string {
  const lines = endingLines(endingOf(script), cta);
  return lines[script.format ? (script.cta ?? 0) % lines.length : 0];
}

/** The full voiceover, one segment per beat part, in spoken order. */
export function buildNarration(script: Script, cta: { keyword: string; offer: string }): Segment[] {
  const old = !script.format;   // written before formats: the program speaks the fixed lines
  const segs: Segment[] = [{ id: 'stat', text: script.stat.trim() }];
  const intro = old ? SETUP_LINE : script.intro?.trim();
  if (intro) segs.push({ id: 'setup', text: intro });
  script.triggers.forEach((t, i) => {
    const heading = beatHeading(script, i);
    if (heading) segs.push({ id: `t${i + 1}.name`, text: heading });
    t.lines.forEach((line, j) => segs.push({ id: `t${i + 1}.line${j}` as SegmentId, text: line.trim() }));
  });
  segs.push({ id: 'formula', text: old ? `${FORMULA_PREFIX} ${script.formula.trim()}` : script.formula.trim() });
  segs.push({ id: 'cta', text: closingLine(script, cta) });
  return segs;
}

export const narrationText = (segments: Segment[]) => segments.map(s => s.text).join(' ');
export const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Reads a view count typed on the command line: 34000000, 34,000,000, 2.3m, 850k, 1.2b. */
export function parseViews(input: string): number {
  const m = /^([\d.]+)([kmb]?)$/i.exec(input.replace(/[,_\s]/g, ''));
  const n = m ? Number(m[1]) * ({ '': 1, k: 1e3, m: 1e6, b: 1e9 } as Record<string, number>)[m[2].toLowerCase()] : NaN;
  if (!(n > 0)) throw new Error(`--views must be a number such as 34000000 or 2.3m, got "${input}"`);
  return Math.round(n);
}
