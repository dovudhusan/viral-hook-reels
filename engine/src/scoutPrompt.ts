import type { Reel } from './clients/instagram';
import { RULES, type Pick } from './scout';

export const PICK_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['picks'],
  properties: { picks: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['shortcode', 'kind', 'reason'],
    properties: { shortcode: { type: 'string' }, kind: { type: 'string', enum: ['promo', 'general'] }, reason: { type: 'string' } },
  } } },
};

export const PICK_SYSTEM = [
  'You choose source videos for short "why this hook worked" breakdown reels aimed at marketers and creators.',
  `From the list, choose the best ${RULES.shortlist} (fewer if fewer are worth it), best first.`,
  'Prefer videos whose opening hook leads into a product, a brand or a business: a viral ad or promo. Tag those "promo".',
  `Any other strong viral video is "general". At most ${RULES.maxGeneral} of your picks may be "general".`,
  'A good pick has a clear, visual hook in its first seconds that can be explained in three psychological triggers.',
  'Skip videos that depend on a long story, on dialogue in a language other than English, or on context a viewer would not have.',
  'Judge by the cover image and the caption. For each pick give one plain sentence saying why the hook is worth breaking down.',
  'Use each shortcode exactly as given.',
].join('\n');

const plays = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}K`);

export function pickPrompt(pool: Reel[], covers: string[]): string {
  const rows = pool.map((r, i) => [
    `${i + 1}. shortcode: ${r.shortcode}`, `   account: @${r.username}`, `   plays: ${plays(r.plays)}`, `   length: ${Math.round(r.duration)} s`,
    `   caption: ${r.caption.replace(/\s+/g, ' ').slice(0, 300) || '(none)'}`,
    covers[i] ? `   cover image file: ${covers[i]}` : '   cover image: not available',
  ].join('\n'));
  return [`Candidate videos (${pool.length}):`, '', rows.join('\n\n'), '',
    covers.some(Boolean) ? 'Read each cover image file with the Read tool before choosing.' : '', 'Return your picks as structured output.'].join('\n');
}

/** Whatever Claude returned, as a list of picks (possibly empty). */
export function readPicks(answer: unknown): Pick[] {
  const picks = (answer as { picks?: unknown })?.picks;
  return Array.isArray(picks) ? picks.filter((p): p is Pick => typeof p?.shortcode === 'string') : [];
}
