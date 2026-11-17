import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Exec } from '../exec';
import type { AskClaude } from '../stages/script';
import { SCRIPT_SCHEMA } from './claude';

type CliResult = { is_error?: boolean; result?: string; structured_output?: unknown };

/**
 * Writes the script through the Claude Code command-line tool in headless mode, which uses the
 * signed-in Claude subscription instead of an API key. Frames are handed over as image files.
 */
export function makeAskCli(exec: Exec, model?: string): AskClaude {
  return async ({ system, text, images }) => {
    const dir = mkdtempSync(join(tmpdir(), 'hook-reels-frames-'));
    try {
      const files = images.map((data, i) => {
        const file = join(dir, `${String(i + 1).padStart(4, '0')}.jpg`);
        writeFileSync(file, Buffer.from(data, 'base64'));
        return file;
      });
      const prompt = [
        text, '',
        files.length
          ? `The frames are these image files, one per second in order (the first is second 0). Read every one with the Read tool before answering:\n${files.join('\n')}`
          : 'No frames are available for this video.',
        '', 'Then return the finished script as your structured output.',
      ].join('\n');
      const args = [
        '-p', prompt, '--system-prompt', system,
        '--tools', 'Read', '--allowedTools', 'Read', '--add-dir', dir,
        '--output-format', 'json', '--json-schema', JSON.stringify(SCRIPT_SCHEMA),
        '--no-session-persistence', '--strict-mcp-config',
        ...(model ? ['--model', model] : []),
      ];

      let stdout: string;
      try { stdout = (await exec('claude', args)).stdout; }
      catch (e) {
        stdout = (e as { stdout?: string }).stdout ?? '';
        if (!stdout.trim()) throw e;
      }
      const out = JSON.parse(stdout.slice(stdout.indexOf('{'))) as CliResult;
      if (out.is_error) {
        const reason = out.result ?? 'unknown error';
        if (/authenticat|log ?in|oauth/i.test(reason)) {
          throw new Error(`Claude Code is not signed in (${reason}). Sign in once by running "claude" in a terminal and typing /login, then resume this job.`);
        }
        throw new Error(`Claude Code failed: ${reason}`);
      }
      if (out.structured_output) return out.structured_output;
      const body = (out.result ?? '').replace(/^```(?:json)?\s*|\s*```$/g, '');
      return JSON.parse(body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}
