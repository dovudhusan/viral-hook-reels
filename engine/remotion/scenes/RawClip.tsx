import { AbsoluteFill } from 'remotion';
import type { SceneProps } from '../Reel';
import { SourceVideo } from './SourceVideo';

export const RawClip = ({ scene, handle, credit }: SceneProps) => (
  <AbsoluteFill style={{ backgroundColor: '#000' }}>
    <SourceVideo source={scene.source!} muted={false} loop={false} />
    {credit && handle ? (
      <div style={{ position: 'absolute', left: 40, bottom: 48, fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 28, color: 'rgba(255,255,255,0.7)' }}>
        @{handle}
      </div>
    ) : null}
  </AbsoluteFill>
);
