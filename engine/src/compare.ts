import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config';
import { coverPathFor } from './cover';
import type { Exec } from './exec';
import { openJob, type Job } from './job';
import { cutFilter, parseSilences, pauseCuts, shiftTime } from './pauses';
import type { Speak } from './stages/voice';
import type { Range, Scene, Segment, Timeline, Word } from './types';
import { wordsFromAlignment, type Alignment } from './words';

/**
 * A comparison reel: one clip plays untouched and gets its label, a second clip plays untouched and gets its
 * label, then the voice explains the difference over replays, cards and reactions.
 */
export type CompareLine = {
  text: string;
  /** label: on the frozen last frame of a clip. build: the phrase builds on black. word: one word at a time on black.
   *  replay: full-screen footage. card: small footage card. reaction: a reaction clip from assets/reactions. */
  show: 'label' | 'build' | 'word' | 'replay' | 'card' | 'reaction';
  clip?: 'first' | 'second';
  /** Part of the file to play for replay/card, when not the whole clip. */
  range?: Range;
  reaction?: string;
  /** Words of a label to show large, in capitals. */
  big?: string[];
};
export type CompareSpec = {
  /** A video file holding both clips, each untouched somewhere in it. */
  file: string; first: Range; second: Range;
  /** lines[0] is spoken after the first clip; the second clip then plays; the rest follow. */
  lines: CompareLine[];
  caption: string; views: number;
};

const SHOWS = ['label', 'build', 'word', 'replay', 'card', 'reaction'];
export function readSpec(file: string): CompareSpec {
  const spec = JSON.parse(readFileSync(file, 'utf8')) as CompareSpec;
  const ok = (r?: Range) => !!r && r.start >= 0 && r.end > r.start;
  if (!spec.file || !existsSync(spec.file)) throw new Error(`The video file was not found: ${spec.file}`);
  if (!ok(spec.first) || !ok(spec.second)) throw new Error('first and second must each be { start, end } in seconds, with start before end');
  if (!Array.isArray(spec.lines) || spec.lines.length < 2) throw new Error('lines needs at least two entries: the label of each clip');
  spec.lines.forEach((l, i) => { if (!l.text?.trim() || !SHOWS.includes(l.show)) throw new Error(`Line ${i + 1} needs text and a show of: ${SHOWS.join(', ')}`); });
  if (!spec.caption?.trim()) throw new Error('caption is missing');
  return spec;
}

const HOLD = 0.35;   // the first label stays this long after its last word, before the second clip starts
const TAIL = 0.5;
const shown = (w: string) => w.replace(/[.,;:]+$/, '').toUpperCase();
const segmentOf = (i: number) => `t${i + 1}.line0` as Segment['id'];
export const compareSegments = (spec: CompareSpec): Segment[] => spec.lines.map((l, i) => ({ id: segmentOf(i), text: l.text.trim() }));

/**
 * The scenes of a comparison reel. `words` are timed against the voice as recorded in one piece; the voice is
 * then split after the first line, where `gap` seconds of silence go in while the second clip plays.
 */
export function compareTimeline(spec: CompareSpec, words: Word[], voiceDuration: number): { timeline: Timeline; split: number; gap: number } {
  const count = words.filter(w => w.segment === segmentOf(0)).length;
  if (!count || count >= words.length) throw new Error('The voice timings do not cover the lines.');
  const split = (words[count - 1].end + words[count].start) / 2;
  const gap = HOLD + (spec.second.end - spec.second.start);
  const at = (i: number) => words[i].start + (i < count ? 0 : gap);
  const voiceOffset = spec.first.end - spec.first.start;
  const clipOf = (l: CompareLine, i: number) => (l.clip ?? (i === 0 ? 'first' : 'second')) === 'first' ? spec.first : spec.second;

  const scenes: Scene[] = [{ type: 'RawClip', start: 0, duration: voiceOffset, source: spec.first }];
  let w = 0;
  spec.lines.forEach((l, i) => {
    const n = words.filter(x => x.segment === segmentOf(i)).length;
    const ids = Array.from({ length: n }, (_, k) => w + k);
    w += n;
    const clip = clipOf(l, i);
    const base = { start: at(ids[0]) + voiceOffset, duration: 0, text: ids.map(k => shown(words[k].word)).join(' '), words: ids.map(k => ({ text: shown(words[k].word), at: at(k) + voiceOffset })) };
    if (l.show === 'label') scenes.push({ ...base, type: 'StatOverlay', source: { start: clip.end - 0.04, end: clip.end }, big: l.big?.map(b => b.toUpperCase()) });
    else if (l.show === 'reaction') scenes.push({ ...base, type: 'Reaction', mode: 'single', reaction: l.reaction ?? 'confused' });
    else if (l.show === 'replay' || l.show === 'card') scenes.push({ ...base, type: l.show === 'replay' ? 'Replay' : 'ClipCard', mode: 'single', source: l.range ?? clip });
    else scenes.push({ ...base, type: 'TextCard', mode: l.show === 'build' ? 'build' : 'single' });
    // The second clip ends on the exact frame its label starts.
    if (i === 0) scenes.push({ type: 'RawClip', start: voiceOffset + at(count) - (spec.second.end - spec.second.start), duration: 0, source: spec.second });
  });
  const end = voiceOffset + voiceDuration + gap + TAIL;
  scenes[1].start = voiceOffset;
  scenes.forEach((s, i) => { if (i) s.duration = (scenes[i + 1]?.start ?? end) - s.start; });
  // The music bed waits until the second clip, which has its own sound, has played.
  return { timeline: { fps: 30, width: 1080, height: 1920, duration: end, voiceOffset, handle: null, scenes, musicOffset: scenes[3].start }, split, gap };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '') || 'reel';

export type CompareDeps = { exec: Exec; speak: Speak; render: (job: Job, config: Config) => Promise<string> };

/** Records the voice, builds and renders a comparison reel, and saves it with its cover in the output folder. */
export async function compareReel(spec: CompareSpec, jobsRoot: string, config: Config, deps: CompareDeps, now = new Date()): Promise<{ file: string; job: Job }> {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const id = `compare-${day}-${slug(spec.caption).slice(0, 30)}`;
  mkdirSync(join(jobsRoot, id), { recursive: true });
  const job = openJob(jobsRoot, id);
  copyFileSync(spec.file, job.path('source.mp4'));
  const segments = compareSegments(spec);

  // The voice is recorded once and kept: running the same spec again re-plans and re-renders without a new recording.
  const said = segments.map(s => s.text).join(' ');
  if (!(job.has('voice-raw.mp3') && job.has('alignment.json') && job.has('said.txt') && readFileSync(job.path('said.txt'), 'utf8') === said)) {
    const { audio, alignment } = await deps.speak(said);
    writeFileSync(job.path('voice-raw.mp3'), audio);
    job.writeJson('alignment.json', alignment);
    writeFileSync(job.path('said.txt'), said);
  }
  // Influencer pace, as for every reel: cut the pauses, then speed up a little.
  const tempo = Math.min(2, Math.max(0.5, config.voiceTempo ?? 1.15));
  const log = await deps.exec('ffmpeg', ['-hide_banner', '-i', job.path('voice-raw.mp3'), '-af', 'silencedetect=noise=-38dB:d=0.1', '-f', 'null', '-']);
  const cuts = config.tightenPauses === false ? [] : pauseCuts(parseSilences(log.stderr));
  const filters = [cutFilter(cuts), `atempo=${tempo}`].filter(Boolean).join(',');
  await deps.exec('ffmpeg', ['-v', 'error', '-y', '-i', job.path('voice-raw.mp3'), '-filter:a', filters, '-b:a', '192k', job.path('voice-paced.mp3')]);
  const words = wordsFromAlignment(segments, job.readJson<Alignment>('alignment.json')).map(w => ({ ...w, start: shiftTime(w.start, cuts) / tempo, end: shiftTime(w.end, cuts) / tempo }));
  const paced = Number((await deps.exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', job.path('voice-paced.mp3')])).stdout.trim());

  const { timeline, split, gap } = compareTimeline(spec, words, paced);
  await deps.exec('ffmpeg', ['-v', 'error', '-y', '-i', job.path('voice-paced.mp3'), '-filter_complex',
    `[0:a]atrim=0:${split},asetpts=N/SR/TB[a];anullsrc=r=44100:cl=mono,atrim=0:${gap}[s];[0:a]atrim=${split},asetpts=N/SR/TB[b];[a][s][b]concat=n=3:v=0:a=1`, '-b:a', '192k', job.path('voice.mp3')]);
  job.writeJson('timeline.json', timeline);
  job.writeJson('meta.json', { url: spec.file, views: spec.views, handle: null, duration: Math.max(spec.first.end, spec.second.end), width: 0, height: 0 });
  job.writeJson('script.json', { hook: spec.first, stat: spec.lines[0].text, triggers: [], formula: spec.lines.at(-1)!.text, caption: spec.caption });
  await deps.render(job, config);

  if (!existsSync(config.outputDir)) mkdirSync(config.outputDir);
  let file = join(config.outputDir, `${day}-${slug(spec.caption)}.mp4`);
  for (let n = 2; existsSync(file); n++) file = join(config.outputDir, `${day}-${slug(spec.caption)}-${n}.mp4`);
  copyFileSync(job.path('out.mp4'), file);
  if (job.has('cover.png')) copyFileSync(job.path('cover.png'), coverPathFor(file));
  return { file, job };
}
