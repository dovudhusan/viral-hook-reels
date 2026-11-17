import { readFileSync } from 'node:fs';
import { okJson, withRetry } from '../retry';
import type { Alignment } from '../words';

const API = 'https://api.elevenlabs.io/v1';
export const VOICE_MODEL = 'eleven_v4';
/** Lower stability and some style make the read less flat; tuned by ear on short samples. */
export const VOICE_SETTINGS = { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true, speed: 1.2 };
export const TRANSCRIBE_MODEL = 'scribe_v3';

/** Speech in an audio file as plain text ('' when there is none). */
export function transcribe(key: string, file: string): Promise<string> {
  return withRetry(async () => {
    const form = new FormData();
    form.append('model_id', TRANSCRIBE_MODEL);
    form.append('file', new Blob([readFileSync(file)], { type: 'audio/mpeg' }), 'audio.mp3');
    const json = await okJson(await fetch(`${API}/speech-to-text`, { method: 'POST', headers: { 'xi-api-key': key }, body: form }), 'ElevenLabs transcription');
    return typeof json.text === 'string' ? json.text : '';
  });
}

/** Voiceover audio (mp3) plus the time at which each character is spoken. */
export function speak(key: string, voiceId: string, text: string, model = VOICE_MODEL): Promise<{ audio: Buffer; alignment: Alignment }> {
  return withRetry(async () => {
    const res = await fetch(`${API}/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: model, voice_settings: VOICE_SETTINGS }),
    });
    const json = await okJson(res, 'ElevenLabs voiceover');
    const a = json.alignment;
    if (!json.audio_base64 || !a?.characters) throw new Error('ElevenLabs returned no audio or no word timings.');
    return {
      audio: Buffer.from(json.audio_base64, 'base64'),
      alignment: { characters: a.characters, starts: a.character_start_times_seconds, ends: a.character_end_times_seconds },
    };
  });
}
