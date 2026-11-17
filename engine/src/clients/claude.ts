import Anthropic from '@anthropic-ai/sdk';
import { withRetry } from '../retry';
import type { AskClaude } from '../stages/script';

const range = { type: 'object', properties: { start: { type: 'number' }, end: { type: 'number' } }, required: ['start', 'end'], additionalProperties: false } as const;
export const SCRIPT_SCHEMA = {
  type: 'object',
  properties: {} as Record<string, unknown>,
  required: ['format', 'payoff', 'hook', 'stat', 'intro', 'triggers', 'formula', 'caption'],
  additionalProperties: false,
};
const TOOL = {
  name: 'write_script',
  description: 'Record the finished hook-breakdown script.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      format: { type: 'string', enum: ['ad-reveal', 'named-hook', 'one-trigger', 'crazy-part', 'same-concept', 'odd-setting', 'timing', 'this-is', 'contrast'] },
      payoff: { type: 'number' },
      hook: range,
      stat: { type: 'string' },
      intro: { type: 'string' },
      triggers: {
        type: 'array',
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, lines: { type: 'array', items: { type: 'string' } }, moment: range },
          required: ['name', 'lines', 'moment'], additionalProperties: false,
        },
      },
      formula: { type: 'string' },
      caption: { type: 'string' },
    },
    required: ['format', 'payoff', 'hook', 'stat', 'intro', 'triggers', 'formula', 'caption'],
    additionalProperties: false,
  },
} as const;

Object.assign(SCRIPT_SCHEMA, TOOL.input_schema);

/** One Claude call: frames plus facts in, the write_script tool input out. */
export function makeAsk(key: string, model: string): AskClaude {
  const client = new Anthropic({ apiKey: key, maxRetries: 0 });
  return ({ system, text, images }) => withRetry(async () => {
    const res = await client.messages.create({
      model, max_tokens: 8000, system,
      tools: [TOOL as never],
      messages: [{
        role: 'user',
        content: [
          ...images.map(data => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data } })),
          { type: 'text' as const, text: `${text}\n\nAnswer only by calling the write_script tool.` },
        ],
      }],
    });
    const call = res.content.find(b => b.type === 'tool_use');
    if (!call || call.type !== 'tool_use') throw new Error(`Claude did not return a script (stop reason: ${res.stop_reason}).`);
    return call.input;
  });
}
