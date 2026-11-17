import { renameSync, writeFileSync } from 'node:fs';
import type { Config } from '../config';
import type { Exec } from '../exec';
import type { Job } from '../job';
import type { Script, Word } from '../types';
import { buildNarration, narrationText } from '../narration';
import { wordsFromAlignment, type Alignment } from '../words';
import { cutFilter, parseSilences, pauseCuts, shiftTime, type Span } from '../pauses';

export type Speak = (text: string) => Promise<{ audio: Buffer; alignment: Alignment }>;

/** Generates the voiceover and the time at which each word is spoken. */
export async function voiceStage(job: Job, config: Config, speak: Speak, exec: Exec): Promise<{ words: Word[]; duration: number }> {
  const segments = buildNarration(job.readJson<Script>('script.json'), config.cta);
  const { audio, alignment } = await speak(narrationText(segments));
  writeFileSync(job.path('voice.mp3'), audio);   // keep the audio even if the timings turn out unusable
  let words = wordsFromAlignment(segments, alignment);
  // Influencer pace: cut the pauses out, then speed the audio up a little without changing its pitch.
  // The word timings move with both.
  const tempo = Math.min(2, Math.max(0.5, config.voiceTempo ?? 1.15));
  let cuts: Span[] = [];
  if (config.tightenPauses !== false) {
    const log = await exec('ffmpeg', ['-hide_banner', '-i', job.path('voice.mp3'), '-af', 'silencedetect=noise=-38dB:d=0.1', '-f', 'null', '-']);
    cuts = pauseCuts(parseSilences(log.stderr));
  }
  const filters = [cutFilter(cuts), Math.abs(tempo - 1) > 1e-3 ? `atempo=${tempo}` : ''].filter(Boolean);
  if (filters.length) {
    renameSync(job.path('voice.mp3'), job.path('voice-raw.mp3'));
    await exec('ffmpeg', ['-v', 'error', '-y', '-i', job.path('voice-raw.mp3'), '-filter:a', filters.join(','), '-b:a', '192k', job.path('voice.mp3')]);
    words = words.map(w => ({ ...w, start: shiftTime(w.start, cuts) / tempo, end: shiftTime(w.end, cuts) / tempo }));
  }
  const probe = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', job.path('voice.mp3')]);
  const duration = Number(probe.stdout.trim());
  if (!(duration > 0)) throw new Error('The voiceover audio is empty.');
  job.writeJson('words.json', words);
  job.writeJson('voice.json', { duration });
  return { words, duration };
}
