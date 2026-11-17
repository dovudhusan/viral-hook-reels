import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import type { Exec } from '../exec';
import type { Job } from '../job';
import type { Analysis } from '../types';

/** Samples frames, finds scene cuts and transcribes any speech in the source. */
export async function analyzeStage(job: Job, exec: Exec, transcribe: (file: string) => Promise<string>): Promise<Analysis> {
  const src = job.path('source.mp4');
  mkdirSync(job.path('frames'), { recursive: true });
  await exec('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', 'fps=1,scale=360:-2', '-frames:v', '40', job.path('frames/%04d.jpg')]);
  const frames = existsSync(job.path('frames'))
    ? readdirSync(job.path('frames')).filter(f => f.endsWith('.jpg')).sort().map(f => `frames/${f}`)
    : [];

  const { stderr } = await exec('ffmpeg', ['-hide_banner', '-i', src, '-vf', "select='gt(scene,0.25)',showinfo", '-an', '-f', 'null', '-']);
  const cuts = [...stderr.matchAll(/pts_time:([0-9.]+)/g)].map(m => Math.round(Number(m[1]) * 100) / 100);

  let transcript = '';
  const audio = await exec('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', src]);
  if (audio.stdout.trim()) {
    await exec('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vn', '-ac', '1', '-ar', '16000', job.path('source-audio.mp3')]);
    transcript = (await transcribe(job.path('source-audio.mp3'))).trim();
  }

  const analysis: Analysis = { frames, cuts, transcript };
  job.writeJson('transcript.json', analysis);
  return analysis;
}
