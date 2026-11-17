import { copyFileSync, renameSync, rmSync } from 'node:fs';
import type { Exec } from '../exec';
import type { Job } from '../job';
import type { Meta } from '../types';
import { IgAuthError, IgRateError } from '../clients/instagram';

export type FetchOpts = { url: string; file?: string; views?: number; igCookiesFile?: string; igCookiesBrowser?: string;
  /** Mirror the source left to right before anything else uses it. */
  flip?: boolean;
  /** Asked for the play count when the download reports none (Instagram never does). */
  lookupViews?: (url: string) => Promise<number | undefined>;
};

const isInstagram = (url: string) => {
  try { return /(^|\.)instagram\.com$/.test(new URL(url).hostname); } catch { return false; }
};

/** Downloads the source video (or copies a local file) and records its view count, creator and size. */
export async function fetchStage(job: Job, opts: FetchOpts, exec: Exec): Promise<Meta> {
  let info: { view_count?: number; uploader_id?: string; channel?: string; uploader?: string } = {};
  if (opts.file) {
    copyFileSync(opts.file, job.path('source.mp4'));
  } else {
    const args = [
      '--dump-single-json', '--no-simulate', '--no-warnings', '--no-playlist',
      // Prefer H.264: the renderer cannot decode every HEVC stream.
      '-S', 'vcodec:h264,res:1080,ext:mp4:m4a', '--merge-output-format', 'mp4', '--remux-video', 'mp4',
      '-o', job.path('source.%(ext)s'),
    ];
    if (isInstagram(opts.url)) {
      // Instagram needs a signed-in session: a cookies file, or the cookies of a browser where the user is signed in.
      if (opts.igCookiesFile) args.push('--cookies', opts.igCookiesFile);
      else if (opts.igCookiesBrowser) args.push('--cookies-from-browser', opts.igCookiesBrowser);
    }
    args.push(opts.url);
    info = JSON.parse((await exec('yt-dlp', args)).stdout || '{}');
  }

  if (opts.flip) {
    // Everything downstream (frames for the script, the render) then sees the mirrored video.
    const src = job.path('source.mp4'), original = job.path('source-original.mp4');
    renameSync(src, original);
    await exec('ffmpeg', ['-v', 'error', '-y', '-i', original, '-vf', 'hflip', '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'copy', src]);
    rmSync(original, { force: true });
  }

  let views = opts.views ?? info.view_count;
  if (!(typeof views === 'number' && views > 0) && opts.lookupViews && !opts.file) {
    try { views = await opts.lookupViews(opts.url); }
    catch (e) { if (e instanceof IgAuthError || e instanceof IgRateError) throw e; /* otherwise fall through to the message below */ }
  }
  if (typeof views !== 'number' || !(views > 0)) throw new Error('View count not found; pass --views <number>');

  const probe = JSON.parse((await exec('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', job.path('source.mp4')])).stdout);
  const video = probe.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');
  if (!video) throw new Error('The source file has no video stream.');

  // Which field holds the @handle differs by site, and some hold a numeric account id instead.
  const names = [info.uploader_id, info.channel, info.uploader]
    .map(v => (v ?? '').replace(/^@/, '').trim()).filter(v => v && !/^\d+$/.test(v));
  const handle = names.find(v => !/\s/.test(v)) ?? names[0] ?? null;
  const meta: Meta = { url: opts.url, views, handle, duration: Number(probe.format.duration), width: video.width, height: video.height };
  job.writeJson('meta.json', meta);
  return meta;
}
