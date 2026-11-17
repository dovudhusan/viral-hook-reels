export type Range = { start: number; end: number };
export type Meta = { url: string; views: number; handle: string | null; duration: number; width: number; height: number };
export type Analysis = { frames: string[]; cuts: number[]; transcript: string };
export type Trigger = { name: string; lines: string[]; moment: Range };
/** How a breakdown is told. Scripts written before formats existed have none and follow the old fixed outline. */
export type Format =
  | 'ad-reveal' | 'named-hook' | 'one-trigger' | 'crazy-part' | 'same-concept' | 'odd-setting' | 'timing' | 'this-is' | 'contrast'
  /** Outlines used by a few earlier reels; no longer offered, kept so those jobs still open. */
  | 'triggers' | 'hook' | 'timeline' | 'steal';
export type Script = {
  hook: Range; stat: string; triggers: Trigger[]; formula: string; caption: string;
  /** The second of the source at which the viewer understands what the opening leads to (the product, the reveal, the result). */
  payoff?: number;
  /** The outline this script follows. */
  format?: Format;
  /** The line that leads from the opening into the beats; may be empty. */
  intro?: string;
  /** How the reel ends: hooks, viral, follow, save, share or like. */
  ending?: string;
  /** Which wording of that ending closes the reel. */
  cta?: number;
};
export type SegmentId = 'stat' | 'setup' | `t${number}.name` | `t${number}.line${number}` | 'formula' | 'cta';
export type Segment = { id: SegmentId; text: string };
export type Word = { word: string; start: number; end: number; segment: SegmentId };
export type SceneType = 'RawClip' | 'StatOverlay' | 'TextCard' | 'NumberCard' | 'ClipCard' | 'Replay' | 'CommentsMock' | 'Reaction' | 'Cta';
export type Scene = {
  type: SceneType; start: number; duration: number; text?: string;
  words?: { text: string; at: number }[]; source?: Range; numeral?: number;
  /** On the closing scene: what the viewer is asked to do (follow, save, share, like), when it is not a comment. */
  ask?: string;
  /** Words a StatOverlay shows large in addition to the numbers. */
  big?: string[];
  /** A timestamp shown on a NumberCard instead of a numeral, such as "0:03". */
  stamp?: string;
  /** How the words appear: the phrase builds up word by word, or one word shows at a time. */
  mode?: 'build' | 'single';
  /** Name of the reaction clip (assets/reactions/<name>.mp4) shown on a Reaction card. */
  reaction?: string;
};
export type Timeline = {
  fps: 30; width: 1080; height: 1920; duration: number; voiceOffset: number; handle: string | null; scenes: Scene[];
  /** When the music bed comes in, if not with the voice (a reel that plays a second raw clip after the voice has started). */
  musicOffset?: number;
};
export type StageName = 'fetch' | 'analyze' | 'script' | 'voice' | 'plan' | 'render' | 'deliver';
export type Status = { stage: StageName; state: 'running' | 'done' | 'failed'; error?: string; notice?: string };
