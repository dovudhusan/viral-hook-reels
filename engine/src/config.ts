import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';

export type Config = {
  cta: { keyword: string; offer: string };
  voiceId: string; model: string; outputDir: string; creditSource: boolean;
  /** Optional link to the output folder (a shared Drive folder, say), added to the finished-reel message. */
  driveFolderUrl: string;
  /** 'subscription' writes scripts through the signed-in Claude Code CLI; 'api' uses ANTHROPIC_API_KEY. */
  claudeVia: 'subscription' | 'api';
  /** Optional model alias for subscription mode, for example "opus". */
  subscriptionModel?: string;
  /** Optional ElevenLabs voice model; the default is the most natural one that returns word timings. */
  voiceModel?: string;
  /** Extra speed-up applied to the finished voiceover (1 = none). Default 1.15, on top of cutting the pauses out. */
  voiceTempo?: number;
  tightenPauses?: boolean;
  /** How loud the music bed is under the voice, 0 to 0.4. Default 0.14. */
  musicVolume?: number;
  /** How often a watched account is read again, in days. Default 30, which fits a 20-request monthly plan. */
  scanEveryDays?: number;
  /** The most account listings to request in a calendar month. Default 20 (the free plan). */
  scanRequestsPerMonth?: number;
};
export type Env = { anthropicKey: string; elevenKey: string; telegramToken: string; telegramChatId: string; igCookiesFile?: string; igCookiesBrowser?: string };

const REQUIRED = ['cta.keyword', 'cta.offer', 'voiceId', 'model', 'outputDir'] as const;

/** The output folder as an absolute path. Its parent must already exist, so a mistyped path fails instead of quietly creating folders. */
export function resolveOutputDir(dir: string): string {
  const full = dir === '~' || dir.startsWith('~/') ? join(homedir(), dir.slice(1)) : dir;
  if (!isAbsolute(full)) throw new Error(`outputDir must be an absolute path (or start with ~/): "${dir}"`);
  if (!existsSync(dirname(full))) throw new Error(`outputDir's parent folder does not exist: ${dirname(full)}`);
  return full;
}

export function loadConfig(dir: string): Config {
  const raw = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
  const get = (path: string) => path.split('.').reduce((o: any, k) => o?.[k], raw);
  const missing = REQUIRED.filter(k => typeof get(k) !== 'string' || get(k).trim() === '');
  if (missing.length) throw new Error(`config.json is missing: ${missing.join(', ')}`);
  const claudeVia = raw.claudeVia ?? 'subscription';
  if (claudeVia !== 'subscription' && claudeVia !== 'api') throw new Error('config.json: claudeVia must be "subscription" or "api"');
  return {
    cta: { keyword: raw.cta.keyword, offer: raw.cta.offer },
    voiceId: raw.voiceId, model: raw.model, outputDir: resolveOutputDir(raw.outputDir),
    driveFolderUrl: typeof raw.driveFolderUrl === 'string' ? raw.driveFolderUrl.trim() : '', creditSource: raw.creditSource !== false,
    claudeVia, ...(raw.subscriptionModel ? { subscriptionModel: String(raw.subscriptionModel) } : {}),
    ...(raw.voiceModel ? { voiceModel: String(raw.voiceModel) } : {}),
    ...(typeof raw.voiceTempo === 'number' ? { voiceTempo: raw.voiceTempo } : {}),
    ...(typeof raw.tightenPauses === 'boolean' ? { tightenPauses: raw.tightenPauses } : {}),
    ...(typeof raw.musicVolume === 'number' ? { musicVolume: raw.musicVolume } : {}),
    ...(typeof raw.scanEveryDays === 'number' ? { scanEveryDays: raw.scanEveryDays } : {}),
    ...(typeof raw.scanRequestsPerMonth === 'number' ? { scanRequestsPerMonth: raw.scanRequestsPerMonth } : {}),
  };
}

export function loadEnv(env: NodeJS.ProcessEnv, needAnthropicKey = true): Env {
  const names = [...(needAnthropicKey ? ['ANTHROPIC_API_KEY'] : []), 'ELEVENLABS_API_KEY'];   // Telegram is optional: without it nothing is announced
  const missing = names.filter(n => !env[n]?.trim());
  if (missing.length) throw new Error(`.env is missing: ${missing.join(', ')}`);
  return {
    anthropicKey: env.ANTHROPIC_API_KEY?.trim() ?? '', elevenKey: env.ELEVENLABS_API_KEY!,
    telegramToken: env.TELEGRAM_BOT_TOKEN?.trim() ?? '', telegramChatId: env.TELEGRAM_CHAT_ID?.trim() ?? '',
    igCookiesFile: env.IG_COOKIES_FILE?.trim() || undefined,
    igCookiesBrowser: env.IG_COOKIES_BROWSER?.trim() || undefined,
  };
}
