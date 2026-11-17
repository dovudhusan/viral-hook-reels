import type { Script } from './types';

export type CoverLines = { top: string; big: string; bottom: string };

const AD = /\bads?\b|\bpromo|sales pitch|\bsold\b|\bsell|\bbuy\b|\bproduct|\bbrand/i;

/** The three lines on a reel's cover picture: who hit it, how many views, and the tease. */
export function coverLines(views: number, script: Pick<Script, 'stat' | 'formula' | 'caption'>): CoverLines {
  const top = `THIS ${AD.test(`${script.stat} ${script.formula} ${script.caption}`) ? 'AD' : 'VIDEO'}`;
  if (views >= 1_000_000) return { top: `${top} HIT`, big: `${Math.floor(views / 1_000_000)} MILLION`, bottom: 'VIEWS USING THESE' };
  if (views >= 1_000) return { top: `${top} HIT`, big: `${Math.floor(views / 1_000)} THOUSAND`, bottom: 'VIEWS USING THESE' };
  return { top: `${top} WENT`, big: 'VIRAL', bottom: 'USING THESE' };
}

/** Where a reel's cover picture sits: next to the reel, same name, ending in -cover.png. */
export const coverPathFor = (reelFile: string) => reelFile.replace(/\.mp4$/i, '') + '-cover.png';
