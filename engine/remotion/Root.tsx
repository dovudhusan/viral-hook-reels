import { Composition, Still, type CalculateMetadataFunction } from 'remotion';
import { Cover } from './Cover';
import { Reel, type ReelProps } from './Reel';

const calculateMetadata: CalculateMetadataFunction<ReelProps> = ({ props }) => ({
  durationInFrames: Math.max(1, Math.round(props.timeline.duration * props.timeline.fps)),
});

const empty: ReelProps = {
  credit: true, keyword: 'hooks',
  timeline: { fps: 30, width: 1080, height: 1920, duration: 1, voiceOffset: 0, handle: null, scenes: [] },
};

export const Root = () => (
  <>
    <Composition id="Reel" component={Reel} fps={30} width={1080} height={1920} durationInFrames={30}
      defaultProps={empty} calculateMetadata={calculateMetadata} />
    <Still id="Cover" component={Cover} width={1080} height={1920} defaultProps={{ top: 'THIS VIDEO HIT', big: '13 MILLION', bottom: 'VIEWS USING THESE' }} />
  </>
);
