import { loadVariableFont } from '@remotion/google-fonts/Archivo';
import { loadFont as loadSerif } from '@remotion/google-fonts/InstrumentSerif';
import type { CSSProperties } from 'react';

const archivo = loadVariableFont('normal', { subsets: ['latin'] });
const serif = loadSerif('normal', { weights: ['400'], subsets: ['latin'] });

/** White, uppercase, bold and wide: the one text style used everywhere. */
export const wide: CSSProperties = {
  fontFamily: archivo.fontFamily, fontWeight: 800, fontStretch: '125%',
  color: '#fff', textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.12, letterSpacing: '0.005em', margin: 0,
};
export const numeral: CSSProperties = { fontFamily: serif.fontFamily, fontWeight: 400, color: '#fff', lineHeight: 1, margin: 0 };
export const center: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' };
export const SHADOW = '0 2px 18px rgba(0,0,0,0.65)';
