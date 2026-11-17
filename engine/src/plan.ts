import { endingOf } from './endings';
import { FORMATS } from './narration';
import type { Meta, Range, Scene, SceneType, Script, SegmentId, Timeline, Word } from './types';

const TAIL = 0.4;
const MAX_BUILD_WORDS = 6;
/** How consecutive phrases of a trigger's lines are shown: [scene, caption mode]. */
const LINE_CYCLE: [SceneType, 'build' | 'single'][] = [
  ['Replay', 'single'], ['TextCard', 'single'], ['ClipCard', 'single'], ['TextCard', 'build'], ['Replay', 'single'], ['TextCard', 'single'],
];

/** Which reaction meme fits a phrase. The first match that is in the library and not yet used wins. */
const REACTIONS: [string, RegExp][] = [
  ['confused', /\?|\bWAIT\b|\bWHY\b|\bHOW\b/],
  ['shocked', /CRASH|DISASTER|DANGER|\bHIT\b|WRONG|TROUBLE|DAMAGE/],
  ['mindblown', /IMPOSSIBLE|SURPRIS|TWIST|PUNCHLINE|FLIP|UNEXPECTED|\bONLY\b|\bJOKE\b|NOBODY|NEVER/],
  ['thinking', /BRAIN|EXPECT|KNOWS|PREDICT|WONDER/],
];
const MAX_REACTIONS = 3;

/** On-screen form of a spoken word: uppercase, without a trailing full stop or comma ("?" and "!" stay). */
const shown = (word: string) => word.replace(/[.,;:]+$/, '').toUpperCase();

/**
 * Turns the script and the word timings into the ordered list of scenes.
 * Every caption is word-timed: a scene carries the words of one spoken phrase and either
 * builds the phrase up word by word ("build") or shows one word at a time ("single").
 */
export function planTimeline(script: Script, words: Word[], meta: Meta, voiceDuration: number, reactions: string[] = []): Timeline {
  const dur = meta.duration;
  const clamp = (r: Range): Range | null => {
    const start = Math.max(0, Math.min(r.start, dur));
    const end = Math.max(start, Math.min(r.end, dur));
    return end - start >= 0.2 ? { start, end } : null;
  };
  const hook = clamp(script.hook) ?? { start: 0, end: Math.min(dur, 35) };
  const heading = script.format ? FORMATS[script.format].heading : 'number';
  const voiceOffset = hook.end - hook.start;
  const end = voiceOffset + voiceDuration + TAIL;
  const at = (i: number) => words[i].start + voiceOffset;

  /** Splits consecutive word indices into phrases: at punctuation, and after six words. */
  const phrases = (ids: number[]): number[][] => {
    const out: number[][] = [];
    let cur: number[] = [];
    for (const i of ids) {
      cur.push(i);
      if (/[.?!,]$/.test(words[i].word) || cur.length >= MAX_BUILD_WORDS) { out.push(cur); cur = []; }
    }
    if (cur.length) out.push(cur);
    return out;
  };

  const runs: { id: SegmentId; ids: number[] }[] = [];
  words.forEach((w, i) => {
    const last = runs[runs.length - 1];
    if (last && last.id === w.segment) last.ids.push(i); else runs.push({ id: w.segment, ids: [i] });
  });

  const scenes: Scene[] = [{ type: 'RawClip', start: 0, duration: voiceOffset, source: hook }];
  const push = (type: SceneType, ids: number[], extra: Partial<Scene> = {}) => {
    if (!ids.length) return;
    scenes.push({
      type, start: at(ids[0]), duration: 0,
      text: ids.map(i => shown(words[i].word)).join(' '),
      words: ids.map(i => ({ text: shown(words[i].word), at: at(i) })),
      ...extra,
    });
  };
  const phraseIndex: Record<number, number> = {};
  const usedReactions = new Set<string>();
  /** A reaction meme for this phrase, if the library has a fitting one that has not been shown yet. */
  const reactionFor = (ids: number[]): string | undefined => {
    if (usedReactions.size >= MAX_REACTIONS) return undefined;
    const text = ids.map(i => shown(words[i].word)).join(' ');
    const name = REACTIONS.find(([n, re]) => reactions.includes(n) && !usedReactions.has(n) && re.test(text))?.[0];
    if (name) usedReactions.add(name);
    return name;
  };

  for (const run of runs) {
    const trig = /^t(\d+)\.(name|line)/.exec(run.id);
    if (run.id === 'stat') {
      // The frozen last frame of the hook carries the stat up to "views"; the rest continues on black.
      const v = run.ids.findIndex(i => /^views\b/i.test(words[i].word));
      const cut = v >= 0 ? v + 1 : run.ids.length;
      push('StatOverlay', run.ids.slice(0, cut), { source: { start: Math.max(hook.start, hook.end - 0.04), end: hook.end } });
      for (const p of phrases(run.ids.slice(cut))) push('TextCard', p, { mode: 'build' });
    } else if (run.id === 'cta') {
      // A follow, save, share or like ending shows that action; a comment ending shows the hooks document.
      const ending = endingOf(script);
      push('Cta', run.ids, { mode: 'single', ...(ending === 'hooks' || ending === 'viral' ? {} : { ask: ending }) });
    } else if (run.id === 'setup') {
      phrases(run.ids).forEach((p, k) => {
        const reaction = k === 0 ? reactionFor(p) : undefined;
        if (reaction) push('Reaction', p, { mode: 'single', reaction });
        else push('TextCard', p, { mode: k === 0 ? 'single' : 'build' });
      });
    } else if (trig && trig[2] === 'name' && heading === 'second') {
      // "Second 3." is shown as a clock reading: 0:03.
      const second = Math.max(0, Math.round(script.triggers[Number(trig[1]) - 1]?.moment.start ?? 0));
      push('NumberCard', run.ids, { stamp: `${Math.floor(second / 60)}:${String(second % 60).padStart(2, '0')}` });
    } else if (trig && trig[2] === 'name' && heading !== 'number') {
      // A spoken heading ("The usual way.") builds up on a black card.
      for (const p of phrases(run.ids)) push('TextCard', p, { mode: 'build' });
    } else if (trig && trig[2] === 'name') {
      const comma = run.ids.findIndex(i => words[i].word.endsWith(','));
      const cut = comma >= 0 ? comma + 1 : Math.min(2, run.ids.length - 1);
      push('NumberCard', run.ids.slice(0, cut), { numeral: Number(trig[1]) });
      push('TextCard', run.ids.slice(cut), { mode: 'build' });
    } else if (trig) {
      const n = Number(trig[1]);
      const moment = clamp(script.triggers[n - 1]?.moment ?? hook) ?? hook;
      for (const p of phrases(run.ids)) {
        const k = phraseIndex[n] ?? 0;
        phraseIndex[n] = k + 1;
        const text = p.map(i => shown(words[i].word)).join(' ');
        const [type, mode] = /COMMENT|REPLAY|SHARE/.test(text) ? (['CommentsMock', 'single'] as const) : LINE_CYCLE[k % LINE_CYCLE.length];
        // Black cards and small clip cards may give way to a reaction meme; full-screen footage never does.
        const reaction = type === 'TextCard' || type === 'ClipCard' ? reactionFor(p) : undefined;
        if (reaction) push('Reaction', p, { mode: 'single', reaction });
        else push(type, p, { mode, ...(type === 'Replay' || type === 'ClipCard' ? { source: moment } : {}) });
      }
    } else {
      for (const p of phrases(run.ids)) push('TextCard', p, { mode: 'build' });
    }
  }

  // Each scene lasts until the next one starts; the voice starts exactly when the hook ends.
  if (scenes[1]) scenes[1].start = voiceOffset;
  scenes.forEach((s, i) => { if (i) s.duration = (scenes[i + 1]?.start ?? end) - s.start; });

  return { fps: 30, width: 1080, height: 1920, duration: end, voiceOffset, handle: meta.handle, scenes };
}
