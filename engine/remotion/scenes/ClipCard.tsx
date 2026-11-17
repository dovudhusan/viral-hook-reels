import { AbsoluteFill } from 'remotion';
import type { SceneProps } from '../Reel';
import { center } from '../fonts';
import { Caption, useEnter } from '../motion';
import { SourceVideo } from './SourceVideo';

export const card = { width: 594, height: 1056, borderRadius: 30, overflow: 'hidden', backgroundColor: '#000', position: 'relative' } as const;

/** The source as a card in the middle of the frame, with the spoken word above it. */
export const ClipCard = ({ scene, continued }: SceneProps) => {
  const p = useEnter(continued);
  return (
    <AbsoluteFill style={{ ...center, gap: 30 }}>
      <Caption scene={scene} size={54} />
      <div style={{ ...card, transform: `translateY(${(1 - p) * 90}px)`, opacity: p }}>
        <SourceVideo source={scene.source!} />
      </div>
    </AbsoluteFill>
  );
};
