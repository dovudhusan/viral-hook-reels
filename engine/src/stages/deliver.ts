import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { resolveOutputDir, type Config } from '../config';
import { coverPathFor } from '../cover';
import { endingOf, keywordOf } from '../endings';
import type { Job } from '../job';
import type { Meta, Script } from '../types';

export type Notify = (text: string) => Promise<void>;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '') || 'reel';
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Copies the finished video, unchanged, and its cover picture into the output folder and announces it. Never overwrites. */
export async function deliverStage(job: Job, config: Config, notify: Notify, today = new Date()): Promise<string> {
  const script = job.readJson<Script>('script.json');
  const meta = job.readJson<Meta>('meta.json');
  const dir = resolveOutputDir(config.outputDir);
  if (!existsSync(dir)) mkdirSync(dir);

  const base = `${ymd(today)}-${slug(script.caption)}`;
  let file = join(dir, `${base}.mp4`);
  for (let n = 2; existsSync(file); n++) file = join(dir, `${base}-${n}.mp4`);
  copyFileSync(job.path('out.mp4'), file);
  if (statSync(file).size !== statSync(job.path('out.mp4')).size) throw new Error(`The copy in ${dir} is incomplete.`);

  const message = [script.caption, keywordOf(script, config.cta) ? `Comment keyword: ${keywordOf(script, config.cta)}` : `Ending: ${endingOf(script)}`, `Source: ${meta.url}`, `File: ${basename(file)}`, ...(config.driveFolderUrl ? [`Folder: ${config.driveFolderUrl}`] : [])].join('\n');
  const notices: string[] = [];
  let cover: string | undefined;
  if (job.has('cover.png')) { cover = coverPathFor(file); copyFileSync(job.path('cover.png'), cover); }
  else notices.push('The cover picture was not made.');
  try { await notify(message); }
  catch (e) { notices.push(`Telegram message not sent: ${(e as Error).message.split('\n')[0]}`); }
  job.writeJson('deliver.json', { file, cover, notice: notices.join(' ') || undefined });
  return file;
}
