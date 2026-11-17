import type { Config } from './config';
import type { Analysis, Format, Meta, Script } from './types';
import { FORMATS, closingLine, OFFERED, countWords, spokenViews } from './narration';
import { HOOK_MAX, WORDS } from './validate';

/** What earlier reels said, and which outlines are on offer for this one. */
export type Past = { recent?: Script[]; offered?: Format[]; cta?: number; ending?: string };

function pastNotes(recent: Script[]): string {
  if (!recent.length) return 'No earlier reels yet.';
  return recent.map((r, i) => [
    `${i + 1}. format: ${r.format ?? 'triggers'}`,
    `   opening: ${r.stat}`,
    `   trigger names: ${r.triggers.map(t => t.name).filter(Boolean).join(' / ') || 'none'}`,
    `   formula: ${r.formula}`,
  ].join('\n')).join('\n');
}

export function buildPrompt(meta: Meta, analysis: Analysis, config: Config, problems: string[] = [], previous?: unknown, past: Past = {}): { system: string; text: string } {
  const views = spokenViews(meta.views);
  const offered = past.offered?.length ? past.offered : OFFERED;
  const cta = closingLine({ format: 'named-hook', cta: past.cta, ending: past.ending }, config.cta);
  const formats = offered.map(f => {
    const o = FORMATS[f];
    const [least, most] = o.beats;
    return `- "${f}" (${least === most ? least : `${least} to ${most}`} beats${o.heading === 'number' ? '; the program says "Number one, <name>." before each' : '; beats are not announced'}): ${o.about}\n  Voiceover of the reference reel this comes from: ${o.example}`;
  }).join('\n');

  const system = `You write voiceover scripts for short "hook breakdown" reels in the style of one reference channel. Each reel replays the opening of a viral video, then explains in plain words why that opening kept people watching.

You are given frames from the viral video (one per second, in order: the first frame is second 0, the next second 1, and so on), its scene-cut times, any speech in it, and its view count. Study what happens second by second before you write. Then call write_script.

Fields of write_script:
1. format: the approach for this reel. Today's choices are below; pick the one that fits THIS video best and follow its shape closely, adapting every sentence to what this video shows. A format made for ads only fits a video that is an ad.
${formats}
2. payoff: the second of the source at which a first-time viewer understands what the opening was leading to. If the video turns out to be an ad, that is the second the product or brand is clearly on screen or named, not the second the scene changes. Otherwise it is the reveal, the punchline or the result.
3. hook: the opening stretch of the source that plays untouched, with its own sound, before the voice starts. It ALWAYS starts at second 0: never skip the beginning. It ends two to four seconds after the payoff, so the viewer has seen the payoff and had time to register it before the voice cuts in. Cutting in before the payoff is the worst mistake you can make, because the viewer then hears "it was an ad" without having seen the ad. When unsure, end later. It may be 4 to ${HOOK_MAX} seconds long; if the payoff comes later than that, end at the last moment that still makes sense.
4. stat: the first spoken sentence, in the shape the format gives. It must contain the exact phrase "${views}".
5. intro: the line that leads into the triggers, in the shape the format gives.
6. triggers: the beats of the format, in spoken order. Each has a name (one to three words; empty where the format says beats are unnamed), one to three short lines, and a moment: the start and end, in source seconds, of the part of the video that shows it.
7. formula: the closing lesson, in the shape the format gives ("That's the formula ..."), ending on advice a viewer can use in their own video.
8. caption: one line for the post caption, under 12 words, no hashtags, no emoji.
The program then closes with: "${cta}". Do not write a call to action, and do not ask for a follow, like, save, share or comment anywhere else.

What makes it good:
- Follow the format's sentence shapes, but every detail must come from this video: what is on screen, what is said, what the brain does at that second. A script that could be read over a different video is a failure.
- Name triggers after what happens here. Avoid a name an earlier reel already used unless nothing else is true.
- Short spoken sentences. Plain words. Talk about the viewer's brain: what it expects, what question opens, what surprises it.

Earlier reels on this channel, newest first. Do not repeat their trigger names or their formula:
${pastNotes(past.recent ?? [])}

Rules:
- The whole voiceover, including the program's "Number one," headings and its closing line, must be ${WORDS.min} to ${WORDS.max} words. The closing line takes ${countWords(cta)} of them. Count before you answer.
- Describe only what is visible in the frames or audible in the transcript. Do not invent details, names or numbers.
- Every moment must lie inside the source (0 to ${meta.duration} seconds).
- No hashtags, emoji or stage directions in any field.`;

  const text = [
    `Views: ${meta.views} (say "${views}")`,
    `Creator: ${meta.handle ? '@' + meta.handle : 'unknown'}`,
    `Source length: ${meta.duration} seconds`,
    `Scene cuts at seconds: ${analysis.cuts.length ? analysis.cuts.join(', ') : 'none detected'}`,
    `Speech in the source: ${analysis.transcript ? JSON.stringify(analysis.transcript) : 'no speech'}`,
    ...(problems.length ? [
      '', 'Your previous answer was:', JSON.stringify(previous ?? null, null, 2),
      '', 'It had these problems. Keep what was right, fix all of them and call write_script again:', ...problems.map(p => `- ${p}`),
    ] : []),
  ].join('\n');

  return { system, text };
}
