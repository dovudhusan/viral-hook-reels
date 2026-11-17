import type { Script } from './types';

/** How a reel ends: a comment keyword (hooks, viral) or a plain ask (follow, save, share, like). */
export const ENDINGS = ['hooks', 'viral', 'follow', 'save', 'share', 'like'] as const;
export type Ending = (typeof ENDINGS)[number];
export const isEnding = (v: unknown): v is Ending => ENDINGS.includes(v as Ending);

type Cta = { keyword: string; offer: string };
const VIRAL_OFFER = 'psychology-based hooks you can use in your own videos.';
const comment = (keyword: string, offer: string) => [
  `Comment ${keyword}, and I'll send you ${offer}`,
  `Want more like this? Comment ${keyword}, and I'll send you ${offer}`,
  `Comment the word ${keyword}, and I'll send you ${offer}`,
];

/** The wordings of each ending. A reel takes one of them in turn, so two reels in a row do not close on the same sentence. */
export function endingLines(ending: Ending, cta: Cta): string[] {
  switch (ending) {
    case 'hooks': return comment(cta.keyword, cta.offer.trim());
    case 'viral': return comment('viral', VIRAL_OFFER);
    case 'follow': return ['Follow for a new hook breakdown every day.', "Follow, and I'll break down another viral hook tomorrow.", 'Follow for more breakdowns like this one.'];
    case 'save': return ['Save this, and use the formula in your next video.', 'Save this one before you film your next video.', 'Save this, so the formula is there when you need it.'];
    case 'share': return ['Send this to someone who makes videos.', 'Share this with a friend who is stuck on their hooks.', 'Send this to the person who edits your videos.'];
    case 'like': return ['Like this if you want the next breakdown.', 'Like this if it changed how you see that video.', "Tap like if you'd watch another one of these."];
  }
}

/** The ending a script closes with; scripts made before endings existed ask for the comment keyword. */
export const endingOf = (script: Pick<Script, 'ending'>): Ending => (isEnding(script.ending) ? script.ending : 'hooks');
/** The comment keyword a reel asks for, or null when its ending asks for something else. */
export function keywordOf(script: Pick<Script, 'ending'>, cta: Cta): string | null {
  const ending = endingOf(script);
  return ending === 'hooks' ? cta.keyword : ending === 'viral' ? 'viral' : null;
}
/** The post caption to paste: the caption line, plus the keyword to watch for when the reel asks for a comment. */
export function postCaption(script: Pick<Script, 'ending' | 'caption'>, cta: Cta): string {
  const keyword = keywordOf(script, cta);
  return keyword ? `${script.caption}\nComment keyword: ${keyword}` : script.caption;
}
