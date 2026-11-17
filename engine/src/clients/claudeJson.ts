import type { Exec } from '../exec';

type CliResult = { is_error?: boolean; result?: string; structured_output?: unknown };

/** One headless Claude Code call (the signed-in subscription) that answers in a given JSON shape; it may read image files under `dir`. */
export async function askClaudeJson(exec: Exec, o: { system: string; prompt: string; schema: object; dir?: string; model?: string }): Promise<unknown> {
  const args = [
    '-p', o.prompt, '--system-prompt', o.system,
    ...(o.dir ? ['--tools', 'Read', '--allowedTools', 'Read', '--add-dir', o.dir] : ['--tools', '']),
    '--output-format', 'json', '--json-schema', JSON.stringify(o.schema),
    '--no-session-persistence', '--strict-mcp-config',
    ...(o.model ? ['--model', o.model] : []),
  ];
  let stdout: string;
  try { stdout = (await exec('claude', args)).stdout; }
  catch (e) {
    stdout = (e as { stdout?: string }).stdout ?? '';
    if (!stdout.trim()) throw e;
  }
  const out = JSON.parse(stdout.slice(stdout.indexOf('{'))) as CliResult;
  if (out.is_error) throw new Error(`Claude Code failed: ${out.result ?? 'unknown error'}`);
  if (out.structured_output) return out.structured_output;
  const body = (out.result ?? '').replace(/^```(?:json)?\s*|\s*```$/g, '');
  return JSON.parse(body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1));
}
