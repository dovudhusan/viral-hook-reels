import type { Segment, SegmentId, Word } from './types';
import { narrationText } from './narration';
export { narrationText };

export type Alignment = { characters: string[]; starts: number[]; ends: number[] };

/**
 * Turns per-character timings into per-word timings, tagged with the beat each word belongs to.
 * Words come from the narration; timings come from the alignment's own runs of non-space
 * characters, so small differences (a collapsed space, a changed apostrophe) do not matter.
 */
export function wordsFromAlignment(segments: Segment[], a: Alignment): Word[] {
  const expected: { word: string; segment: SegmentId }[] = segments.flatMap(s =>
    s.text.split(/\s+/).filter(Boolean).map(word => ({ word, segment: s.id })));

  const spans: { start: number; end: number }[] = [];
  let open = false;
  a.characters.forEach((ch, i) => {
    if (!ch.trim()) { open = false; return; }
    if (open) spans[spans.length - 1].end = a.ends[i];
    else { spans.push({ start: a.starts[i], end: a.ends[i] }); open = true; }
  });

  if (spans.length !== expected.length) {
    throw new Error(`The voice alignment has ${spans.length} words but the narration has ${expected.length}.`);
  }
  return expected.map((e, i) => ({ ...e, ...spans[i] }));
}
