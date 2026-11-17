import { AbsoluteFill } from 'remotion';
import type { SceneProps } from '../Reel';
import { center } from '../fonts';
import { Caption, useEnter } from '../motion';
import { card } from './ClipCard';

const bar = (width: number, shade: string) => ({ width, height: 18, borderRadius: 9, backgroundColor: shade });

/** A drawn comment section: grey shapes only, no real names or text. */
export const CommentsMock = ({ scene, continued }: SceneProps) => {
  const p = useEnter(continued);
  return (
    <AbsoluteFill style={{ ...center, gap: 30 }}>
      <Caption scene={scene} size={54} />
      <div style={{ ...card, backgroundColor: '#16171b', padding: '56px 36px', display: 'flex', flexDirection: 'column', gap: 62, boxSizing: 'border-box',
        transform: `translateY(${(1 - p) * 90}px)`, opacity: p }}>
        {[210, 320, 250, 350, 230, 290, 260].map((w, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: '#3a3c44', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 15, flexGrow: 1 }}>
              <div style={bar(120, '#5a5d68')} />
              <div style={bar(w, '#a3a6b1')} />
            </div>
            <div style={{ width: 28, height: 28, borderRadius: 14, border: '3px solid #6b6e79', boxSizing: 'border-box' }} />
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
