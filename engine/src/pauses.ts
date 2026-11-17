export type Span = { start: number; end: number };

/** Reads the silent stretches out of ffmpeg's silencedetect log. */
export function parseSilences(log: string): Span[] {
  const starts = [...log.matchAll(/silence_start: (-?[\d.]+)/g)].map(m => Math.max(0, Number(m[1])));
  const ends = [...log.matchAll(/silence_end: (-?[\d.]+)/g)].map(m => Number(m[1]));
  return ends.map((end, i) => ({ start: starts[i], end })).filter(s => s.end > s.start);
}

/**
 * The parts of each pause to cut out, so the voice runs on like a fast talker's:
 * a short breath stays between words, a slightly longer one after a sentence.
 */
export function pauseCuts(silences: Span[], keepShort = 0.07, keepLong = 0.14, longFrom = 0.3): Span[] {
  const cuts: Span[] = [];
  for (const s of silences) {
    const length = s.end - s.start;
    const keep = length >= longFrom ? keepLong : keepShort;
    if (length - keep < 0.03) continue;
    cuts.push({ start: s.start + keep / 2, end: s.end - keep / 2 });
  }
  return cuts;
}

/** Where a moment of the original audio lands once the cuts are removed. */
export function shiftTime(t: number, cuts: Span[]): number {
  let removed = 0;
  for (const c of cuts) {
    if (t <= c.start) break;
    removed += Math.min(t, c.end) - c.start;
  }
  return t - removed;
}

/** ffmpeg audio filter that drops the cuts and closes the gaps. */
export function cutFilter(cuts: Span[]): string {
  if (!cuts.length) return '';
  const spans = cuts.map(c => `between(t,${c.start.toFixed(3)},${c.end.toFixed(3)})`).join('+');
  return `aselect='not(${spans})',asetpts=N/SR/TB`;
}
