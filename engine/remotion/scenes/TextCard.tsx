import { AbsoluteFill } from 'remotion';
import type { SceneProps } from '../Reel';
import { center } from '../fonts';
import { Caption } from '../motion';

export const TextCard = ({ scene }: SceneProps) => (
  <AbsoluteFill style={center}>
    <Caption scene={scene} size={scene.mode === 'single' ? 62 : 54} />
  </AbsoluteFill>
);
