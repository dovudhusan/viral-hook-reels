import { AbsoluteFill } from 'remotion';
import type { SceneProps } from '../Reel';
import { center, numeral } from '../fonts';

export const NumberCard = ({ scene }: SceneProps) => (
  <AbsoluteFill style={center}>
    {scene.stamp
      ? <p style={{ ...numeral, fontSize: 230, letterSpacing: '0.02em' }}>{scene.stamp}</p>
      : <p style={{ ...numeral, fontSize: 300 }}>{scene.numeral}</p>}
  </AbsoluteFill>
);
