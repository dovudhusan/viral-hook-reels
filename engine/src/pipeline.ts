import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config } from './config';
import type { Exec } from './exec';
import type { Job } from './job';
import type { Meta, Script, StageName, Word } from './types';
import { analyzeStage } from './stages/analyze';
import { deliverStage, type Notify } from './stages/deliver';
import { fetchStage, type FetchOpts } from './stages/fetch';
import { scriptStage, type AskClaude } from './stages/script';
import { voiceStage, type Speak } from './stages/voice';
import { planTimeline } from './plan';
import type { Emit } from './events';

export type Deps = {
  exec: Exec; ask: AskClaude; speak: Speak;
  transcribe: (file: string) => Promise<string>;
  notify: Notify;
  render: (job: Job, config: Config) => Promise<string>;
  /** Progress for whoever is watching (the Mac app). */
  emit?: Emit;
};

/** Names of the reaction clips in assets/reactions (file names without .mp4). */
export function reactionLibrary(): string[] {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'reactions');
  return existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.mp4')).map(f => f.slice(0, -4)) : [];
}

export const STAGES: StageName[] = ['fetch', 'analyze', 'script', 'voice', 'plan', 'render', 'deliver'];
const OUTPUTS: Record<StageName, string[]> = {
  fetch: ['source.mp4', 'meta.json'], analyze: ['transcript.json'], script: ['script.json'],
  voice: ['voice.mp3', 'words.json', 'voice.json'], plan: ['timeline.json'], render: ['out.mp4'], deliver: ['deliver.json'],
};

/** Runs the stages in order. With `from`, earlier stages are reused if their files exist. */
export async function runPipeline(job: Job, opts: FetchOpts, config: Config, deps: Deps, from?: StageName): Promise<void> {
  const run: Record<StageName, () => Promise<unknown>> = {
    fetch: () => fetchStage(job, opts, deps.exec),
    analyze: () => analyzeStage(job, deps.exec, deps.transcribe),
    script: () => scriptStage(job, config, deps.ask),
    voice: () => voiceStage(job, config, deps.speak, deps.exec),
    plan: async () => job.writeJson('timeline.json', planTimeline(
      job.readJson<Script>('script.json'), job.readJson<Word[]>('words.json'),
      job.readJson<Meta>('meta.json'), job.readJson<{ duration: number }>('voice.json').duration, reactionLibrary())),
    render: () => deps.render(job, config),
    deliver: () => deliverStage(job, config, deps.notify),
  };
  const first = from ? STAGES.indexOf(from) : STAGES.length;

  for (const [i, stage] of STAGES.entries()) {
    if (i < first && OUTPUTS[stage].every(f => job.has(f))) continue;
    job.setStatus({ stage, state: 'running' });
    deps.emit?.({ event: 'stage', stage, state: 'started' });
    try {
      await run[stage]();
    } catch (e) {
      const error = ((e as Error).message || String(e)).split('\n')[0];
      job.setStatus({ stage, state: 'failed', error });
      deps.emit?.({ event: 'failed', stage, reason: error });
      try { await deps.notify(['Hook reel failed', `Source: ${opts.url}`, `Stage: ${stage}`, `Reason: ${error}`].join('\n')); } catch { /* the stage error matters more */ }
      throw e;
    }
    const notice = stage === 'deliver' ? job.readJson<{ notice?: string }>('deliver.json').notice : undefined;
    job.setStatus(notice ? { stage, state: 'done', notice } : { stage, state: 'done' });
    deps.emit?.({ event: 'stage', stage, state: 'finished' });
  }
}
