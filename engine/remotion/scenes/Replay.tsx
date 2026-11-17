import { AbsoluteFill } from 'remotion';
import type { SceneProps } from '../Reel';
import { Caption } from '../motion';
import { SourceVideo } from './SourceVideo';

/** The described moment plays full screen with the spoken word over it. */
export const Replay = ({ scene }: SceneProps) => (
  <AbsoluteFill style={{ backgroundColor: '#000' }}>
    <SourceVideo source={scene.source!} />
    <AbsoluteFill style={{ backgroundColor: 'rgba(0,0,0,0.14)' }} />
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Caption scene={scene} size={72} shadow />
    </AbsoluteFill>
  </AbsoluteFill>
);
