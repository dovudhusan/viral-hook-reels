import { AbsoluteFill, OffthreadVideo, staticFile } from 'remotion';
import type { SceneProps } from '../Reel';
import { center } from '../fonts';
import { Caption, useEnter } from '../motion';

/** A reaction meme on a rounded card that drops in from above, with the spoken word under it. */
export const Reaction = ({ scene, continued }: SceneProps) => {
  const p = useEnter(continued);
  return (
    <AbsoluteFill style={{ ...center, gap: 36 }}>
      <div style={{ width: 640, height: 400, borderRadius: 28, overflow: 'hidden', backgroundColor: '#111', transform: `translateY(${(1 - p) * -140}px)`, opacity: p }}>
        <OffthreadVideo src={staticFile(`reactions/${scene.reaction}.mp4`)} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <Caption scene={scene} size={62} />
    </AbsoluteFill>
  );
};
