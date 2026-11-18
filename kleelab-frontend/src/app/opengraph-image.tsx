import { ImageResponse } from 'next/og';
import { bricolage, OG_COLORS, OG_SIZE } from '@/lib/og';

/**
 * The picture shown when a page is shared on LinkedIn, WhatsApp, X and the
 * like. Drawn in the Blueprint look: ink on paper over a faint grid, with a
 * cobalt label. Portfolio items replace it with their own cover screenshot.
 */
export const alt = 'KleeLab: websites and systems, built where you can see them';
export const size = OG_SIZE;
export const contentType = 'image/png';

const { ink: INK, paper: PAPER, grid: GRID, cobalt: COBALT, sun: SUN } = OG_COLORS;

export default async function Image() {
  const display = await bricolage();
  const heading = display ? 'Bricolage' : 'sans-serif';
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: PAPER,
          backgroundImage: `linear-gradient(${GRID} 1.5px, transparent 1.5px), linear-gradient(90deg, ${GRID} 1.5px, transparent 1.5px)`,
          backgroundSize: '48px 48px',
          color: INK,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 14, background: SUN, border: `3px solid ${INK}` }} />
          <div style={{ fontFamily: heading, fontSize: 44, fontWeight: 800, letterSpacing: -1 }}>KleeLab</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              padding: '8px 16px',
              border: `3px solid ${COBALT}`,
              color: COBALT,
              fontSize: 24,
              letterSpacing: 3,
              textTransform: 'uppercase',
            }}
          >
            Websites · web apps · internal systems
          </div>
          <div style={{ fontFamily: heading, fontSize: 80, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, maxWidth: 1000 }}>
            Built where you can see them.
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26 }}>
          <div>Follow every step on your own dashboard</div>
          <div style={{ color: COBALT }}>kleelab.com</div>
        </div>
      </div>
    ),
    { ...size, fonts: display ? [{ name: 'Bricolage', data: display, weight: 800, style: 'normal' }] : undefined },
  );
}
