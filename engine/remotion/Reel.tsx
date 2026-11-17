import { AbsoluteFill, Audio, Sequence, interpolate, staticFile } from 'remotion';
import type { Scene, SceneType, Timeline } from '../src/types';
import { RawClip } from './scenes/RawClip';
import { StatOverlay } from './scenes/StatOverlay';
import { TextCard } from './scenes/TextCard';
import { NumberCard } from './scenes/NumberCard';
import { ClipCard } from './scenes/ClipCard';
import { Replay } from './scenes/Replay';
import { CommentsMock } from './scenes/CommentsMock';
import { Reaction } from './scenes/Reaction';
import { Cta } from './scenes/Cta';

export type ReelProps = { timeline: Timeline; credit: boolean; keyword: string; musicVolume?: number; /** False when there is no music bed to play. */ music?: boolean };
export type SceneProps = { scene: Scene; handle: string | null; credit: boolean; continued: boolean; keyword: string };

const SCENES = { RawClip, StatOverlay, TextCard, NumberCard, ClipCard, Replay, CommentsMock, Reaction, Cta };
const frame = (seconds: number) => Math.round(seconds * 30);

/** Sound effect and volume played when a scene of this type starts. */
const SFX: Partial<Record<SceneType, [string, number]>> = {
  StatOverlay: ['freeze', 0.5], NumberCard: ['impact', 0.5], ClipCard: ['whoosh', 0.3], Replay: ['whoosh', 0.3],
  CommentsMock: ['whoosh', 0.3], Reaction: ['whoosh', 0.3], Cta: ['chime', 0.4],
};

export const Reel = ({ timeline, credit, keyword, musicVolume = 0.14, music = true }: ReelProps) => {
  const voiceFrom = frame(timeline.voiceOffset);
  const total = Math.max(1, frame(timeline.duration));
  const musicFrom = frame(timeline.musicOffset ?? timeline.voiceOffset);
  const bed = total - musicFrom;
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {timeline.scenes.map((scene, i) => {
        const from = frame(scene.start);
        const length = Math.max(1, frame(scene.start + scene.duration) - from);
        const prev = timeline.scenes[i - 1];
        // Consecutive cards of the same kind and footage stay put instead of entering again.
        const continued = !!prev && prev.type === scene.type && prev.source?.start === scene.source?.start;
        const Component = SCENES[scene.type];
        const sfx = continued ? undefined : SFX[scene.type];
        return [
          <Sequence key={`s${i}`} from={from} durationInFrames={length}>
            <Component scene={scene} handle={timeline.handle} credit={credit} continued={continued} keyword={keyword} />
          </Sequence>,
          sfx ? (
            <Sequence key={`a${i}`} from={from} durationInFrames={45}>
              <Audio src={staticFile(`sfx/${sfx[0]}.mp3`)} volume={sfx[1]} />
            </Sequence>
          ) : null,
        ];
      })}
      <Sequence from={voiceFrom}>
        <Audio src={staticFile('voice.mp3')} />
      </Sequence>
      {music ? (
        <Sequence from={musicFrom}>
          <Audio src={staticFile('music.mp3')} loop
            volume={f => musicVolume * interpolate(f, [0, 20, Math.max(21, bed - 25), Math.max(22, bed)], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
