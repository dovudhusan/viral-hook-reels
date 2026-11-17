import { AbsoluteFill, interpolate, spring, useCurrentFrame } from 'remotion';
import type { SceneProps } from '../Reel';
import { Caption } from '../motion';

/** The hooks document shown behind the call to action: real entries, blurred just past readable. */
const ENTRIES: [hook: string, example: string, psychology: string][] = [
  ['POV: you made the mistake everyone fears.', 'POV: you left the car in neutral on a hill.', 'Relatable dread (the viewer has to see how bad it gets).'],
  ['Nobody films this part of the job.', 'Nobody films what happens after the restaurant closes.', 'Hidden access (curiosity about what is kept off camera).'],
  ['I tried the thing you were told never to do.', 'I washed a white shirt with red socks on purpose.', 'Rule breaking (a small risk the viewer wants resolved).'],
  ['This should not work, and it does.', 'Cooking a full dinner on a moving bike.', 'Pattern break (it does not fit what the brain expects).'],
  ['Watch what happens at the end.', 'I light the fuse, then put it in my pocket.', 'Open loop (an unanswered question holds attention).'],
  ['Stop scrolling if you sell anything online.', 'Stop scrolling if your ads stopped working this month.', 'Call-out (the right viewer feels spoken to directly).'],
  ['The easiest way to get the result, no hard part.', 'The easiest way to fix your posture, no gym.', 'Effort reduction (lowers the cost of trying).'],
  ['If you want X, skip this and do that instead.', 'If you want more reach, skip hashtags and fix the first second.', 'Contrast framing (replaces a habit with a better one).'],
  ['I did this for 30 days. Here is day 30.', 'I posted twice a day for 30 days. Here is the graph.', 'Proof first (the payoff is promised up front).'],
  ['Everyone gets this wrong, including me.', 'Everyone prices their first product wrong, including me.', 'Shared mistake (lowers the guard, raises trust).'],
  ['You are one small change away from it.', 'You are one sentence away from a better hook.', 'Near win (the goal feels close enough to act on).'],
  ['Here is what they never tell you about it.', 'Here is what they never tell you about going viral.', 'Insider knowledge (promises an unfair advantage).'],
  ['This took four seconds and changed everything.', 'This four-second cut doubled our watch time.', 'Specific number (a concrete claim is easier to believe).'],
  ['Do not buy this until you have seen that.', 'Do not buy a microphone until you have heard this test.', 'Loss aversion (avoiding a mistake beats chasing a gain).'],
];

const SCROLL = 150;   // pixels a second
const FONT = 'Helvetica Neue, Helvetica, Arial, sans-serif';

const Row = ({ label, text, top }: { label: string; text: string; top?: boolean }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', marginTop: top ? 0 : 34 }}>
    <div style={{ width: 268, flexShrink: 0, fontFamily: FONT, fontSize: 40, fontWeight: 600, color: '#ededf0', filter: 'blur(0.6px)' }}>{label}</div>
    <div style={{ fontFamily: FONT, fontSize: 40, lineHeight: 1.32, color: '#d6d6db', filter: 'blur(3.5px)' }}>{text}</div>
  </div>
);

/** The action a non-comment ending asks for, drawn as the app's own button: an outline that gets tapped and fills. */
const ICONS: Record<string, { paths: string[]; colour: string }> = {
  like: { paths: ['M12 20.5C5 15.5 2.5 12 2.5 8.5A4.75 4.75 0 0 1 12 6.5A4.75 4.75 0 0 1 21.5 8.5C21.5 12 19 15.5 12 20.5Z'], colour: '#ff3b5c' },
  save: { paths: ['M6 3H18V21L12 16.5L6 21Z'], colour: '#ffffff' },
  share: { paths: ['M21.5 2.5L2.5 10L10 13L13 21Z', 'M10 13L21.5 2.5'], colour: '#ffffff' },
  follow: { paths: ['M10 12A4 4 0 1 0 10 4A4 4 0 0 0 10 12Z', 'M2.5 20.5C2.5 16.5 5.8 14 10 14C14.2 14 17.5 16.5 17.5 20.5Z', 'M19.5 7.5V13.5M16.5 10.5H22.5'], colour: '#ffffff' },
};
const TAP = 10;   // the frame on which the button is "pressed"

const Ask = ({ scene }: SceneProps) => {
  const frame = useCurrentFrame();
  const icon = ICONS[scene.ask ?? ''] ?? ICONS.like;
  const enter = spring({ frame, fps: 30, config: { damping: 12, stiffness: 180 } });
  const press = spring({ frame: frame - TAP, fps: 30, config: { damping: 8, stiffness: 220 } });
  const pressed = frame >= TAP;
  const scale = enter * (pressed ? interpolate(press, [0, 1], [0.78, 1]) : 1);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox="0 0 24 24" width={340} height={340} style={{ transform: `scale(${scale})`, marginBottom: 90, overflow: 'visible' }}>
        {icon.paths.map((d, i) => (
          <path key={i} d={d} fill={pressed && d.endsWith('Z') ? icon.colour : 'none'} stroke={pressed ? icon.colour : '#fff'}
            strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        ))}
      </svg>
      <Caption scene={{ ...scene, mode: 'build' }} size={74} />
    </AbsoluteFill>
  );
};

/** The hooks document scrolls past, out of focus, while the spoken words land one at a time in the middle. */
export const Cta = (props: SceneProps) => {
  const { scene } = props;
  const frame = useCurrentFrame();
  if (scene.ask) return <Ask {...props} />;
  return (
    <AbsoluteFill style={{ backgroundColor: '#1a1a1d', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 64, right: 56, top: 40 - (frame / 30) * SCROLL, display: 'flex', flexDirection: 'column', gap: 92 }}>
        {ENTRIES.map(([hook, example, psychology], i) => (
          <div key={i}>
            <Row top label={`${i + 1}) Hook`} text={hook} />
            <Row label="Example:" text={example} />
            <Row label="Psychology:" text={psychology} />
          </div>
        ))}
      </div>
      <AbsoluteFill style={{ backgroundColor: 'rgba(0,0,0,0.18)', alignItems: 'center', justifyContent: 'center' }}>
        <Caption scene={scene} size={78} shadow />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
