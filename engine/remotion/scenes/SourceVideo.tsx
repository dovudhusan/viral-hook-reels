import { Loop, OffthreadVideo, staticFile } from 'remotion';
import type { Range } from '../../src/types';

/** The source clip, fitted inside its box on black (never stretched or cropped). */
export const SourceVideo = ({ source, muted = true, loop = true }: { source: Range; muted?: boolean; loop?: boolean }) => {
  const video = (
    <OffthreadVideo src={staticFile('source.mp4')} trimBefore={Math.round(source.start * 30)} muted={muted}
      style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#000' }} />
  );
  if (!loop) return video;
  return <Loop durationInFrames={Math.max(1, Math.round((source.end - source.start) * 30))} layout="none">{video}</Loop>;
};
