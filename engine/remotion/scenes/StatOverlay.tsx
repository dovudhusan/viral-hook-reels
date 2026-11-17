import { AbsoluteFill } from 'remotion';
import type { SceneProps } from '../Reel';
import { SHADOW, wide } from '../fonts';
import { useNow } from '../motion';
import { SourceVideo } from './SourceVideo';

const BIG = /^(\d|VIDEO$|VIEWS$)/;

/** The video stops on its last frame and the stat stacks up word by word, big words and small words mixed. */
export const StatOverlay = ({ scene }: SceneProps) => {
  const now = useNow(scene);
  const words = scene.words ?? [];
  // One word per line, except that the unit after a number ("25.3 MILLION") shares its line.
  const lines: number[][] = [];
  words.forEach((w, i) => { if (i > 0 && /^\d/.test(words[i - 1].text)) lines[lines.length - 1].push(i); else lines.push([i]); });
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <SourceVideo source={scene.source!} />
      <AbsoluteFill style={{ backgroundColor: 'rgba(0,0,0,0.18)' }} />
      <AbsoluteFill style={{ alignItems: 'center', paddingTop: 470 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
          {lines.map((line, l) => (
            <div key={l} style={{ display: 'flex', alignItems: 'baseline', gap: 22 }}>
              {line.map(i => (
                <span key={i} style={{ ...wide, textAlign: 'left', lineHeight: 1.02, textShadow: SHADOW, fontSize: BIG.test(words[i].text) || scene.big?.includes(words[i].text) ? 138 : 60,
                  visibility: i === 0 || words[i].at <= now ? 'visible' : 'hidden' }}>{words[i].text}</span>
              ))}
            </div>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
