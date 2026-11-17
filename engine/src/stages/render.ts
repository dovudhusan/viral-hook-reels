import { copyFileSync, cpSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import type { Config } from '../config';
import type { Job } from '../job';
import { coverLines } from '../cover';
import { postCaption } from '../endings';
import type { Meta, Script, Timeline } from '../types';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Remotion's default headless shell crashes on this macOS (its GPU process cannot start); Chrome for Testing works.
const chromeMode = 'chrome-for-testing' as const;

/** The headless browser sometimes fails to reach Remotion's local server on the first try; a fresh attempt works. */
async function patiently<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await work(); }
    catch (err) {
      if (attempt >= 3 || !/got no response|Target closed|Timed out/i.test(String((err as Error).message))) throw err;
    }
  }
}

/** Draws the reel's cover picture (cover.png, 1080 x 1920) from its view count and script. */
export async function renderCover(job: Job, serveUrl?: string): Promise<string> {
  cpSync(join(root, 'assets', 'fonts'), job.path('fonts'), { recursive: true });
  const url = serveUrl ?? await bundle({ entryPoint: join(root, 'remotion', 'index.ts'), publicDir: job.dir });
  const inputProps = coverLines(job.has('meta.json') ? job.readJson<Meta>('meta.json').views : 0, job.readJson<Script>('script.json'));
  const output = job.path('cover.png');
  await patiently(async () => {
    const composition = await selectComposition({ serveUrl: url, id: 'Cover', inputProps, chromeMode });
    await renderStill({ composition, serveUrl: url, inputProps, output, chromeMode });
  });
  return output;
}

/** Renders timeline.json to out.mp4 (1080 x 1920, 30 fps, H.264 CRF 16, AAC 192k), draws cover.png and writes caption.txt. */
export async function renderStage(job: Job, config: Config): Promise<string> {
  // The music bed is optional: a reel made without assets/music/bed.mp3 has the voice and sound effects only.
  const bed = join(root, 'assets', 'music', 'bed.mp3');
  const music = existsSync(bed);
  const inputProps = { timeline: job.readJson<Timeline>('timeline.json'), credit: config.creditSource, keyword: config.cta.keyword, musicVolume: config.musicVolume ?? 0.14, music };
  // Sound effects ship with the engine; they go into the job folder, with the music bed, so the scenes can load them.
  cpSync(join(root, 'assets', 'sfx'), job.path('sfx'), { recursive: true });
  if (music) copyFileSync(bed, job.path('music.mp3'));
  if (existsSync(join(root, 'assets', 'reactions'))) cpSync(join(root, 'assets', 'reactions'), job.path('reactions'), { recursive: true });
  cpSync(join(root, 'assets', 'fonts'), job.path('fonts'), { recursive: true });
  // The job folder is the public folder, so the scenes load source.mp4 and voice.mp3 by name.
  const serveUrl = await bundle({ entryPoint: join(root, 'remotion', 'index.ts'), publicDir: job.dir });
  const out = job.path('out.mp4');
  await patiently(async () => {
    const composition = await selectComposition({ serveUrl, id: 'Reel', inputProps, chromeMode });
    await renderMedia({ composition, serveUrl, codec: 'h264', crf: 16, audioCodec: 'aac', audioBitrate: '192k', inputProps, outputLocation: out, chromeMode });
  });
  // The cover is a bonus: a reel without one is still delivered, and deliver says the cover is missing.
  try { await renderCover(job, serveUrl); } catch { /* reported at delivery */ }

  const script = job.readJson<Script>('script.json');
  writeFileSync(job.path('caption.txt'), `${postCaption(script, config.cta)}\n`);
  return out;
}
