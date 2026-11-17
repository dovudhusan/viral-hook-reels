import { useEffect, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, staticFile } from 'remotion';

export type CoverProps = { top: string; big: string; bottom: string };

const INK = '#cfe6fa';

/** The reel's cover picture: three hand-drawn lines on black, kept in the middle so the square grid crop keeps them. */
export const Cover = ({ top, big, bottom }: CoverProps) => {
  const [handle] = useState(() => delayRender('cover font'));
  useEffect(() => {
    const font = new FontFace('Londrina Solid', `url(${staticFile('fonts/LondrinaSolid-Regular.ttf')})`);
    font.load().then(f => { document.fonts.add(f); continueRender(handle); });
  }, [handle]);
  const line = { whiteSpace: 'nowrap', transform: 'scaleX(0.78)', margin: 0 } as const;
  // "13 MILLION" (10 characters) fills the width at 236px; longer numbers shrink to fit.
  const bigSize = Math.min(236, Math.round(2360 / Math.max(10, big.length)));
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', fontFamily: 'Londrina Solid', color: INK, textTransform: 'uppercase', lineHeight: 0.95, textAlign: 'center' }}>
      <p style={{ ...line, fontSize: 112, letterSpacing: 2 }}>{top}</p>
      <p style={{ ...line, fontSize: bigSize, margin: '2px 0 8px' }}>{big}</p>
      <p style={{ ...line, fontSize: 112, letterSpacing: 2 }}>{bottom}</p>
    </AbsoluteFill>
  );
};
