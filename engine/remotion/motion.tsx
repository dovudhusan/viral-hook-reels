import { interpolate, useCurrentFrame } from 'remotion';
import type { Scene } from '../src/types';
import { SHADOW, wide } from './fonts';

/** Scene time, in seconds on the reel's clock. */
export const useNow = (scene: Scene) => scene.start + useCurrentFrame() / 30 + 1e-3;

/**
 * Word-timed caption. "build": the phrase appears word by word, each word in its final place.
 * "single": only the word being spoken is shown. Words cut in on the frame they are spoken.
 */
export const Caption = ({ scene, size, shadow = false, maxWidth = 860 }: { scene: Scene; size: number; shadow?: boolean; maxWidth?: number }) => {
  const now = useNow(scene);
  const words = scene.words ?? [];
  const style = { ...wide, fontSize: size, textShadow: shadow ? SHADOW : undefined };
  if (scene.mode === 'build') {
    return (
      <p style={{ ...style, maxWidth, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: size * 0.3 }}>
        {words.map((w, i) => <span key={i} style={{ visibility: i === 0 || w.at <= now ? 'visible' : 'hidden' }}>{w.text}</span>)}
      </p>
    );
  }
  const current = [...words].reverse().find(w => w.at <= now) ?? words[0];
  return <p style={{ ...style, maxWidth }}>{current?.text}</p>;
};

/** Quick slide-up for a card entering the frame; 0 when the scene continues the previous one. */
export const useEnter = (continued: boolean, frames = 7) => {
  const p = interpolate(useCurrentFrame(), [0, frames], [0, 1], { extrapolateRight: 'clamp', easing: t => 1 - Math.pow(1 - t, 3) });
  return continued ? 1 : p;
};
