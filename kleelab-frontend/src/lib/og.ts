/** Shared pieces for the share cards drawn with next/og. */

export const OG_SIZE = { width: 1200, height: 630 };

/** The Blueprint palette as rgb() strings, because ImageResponse has no Tailwind. */
export const OG_COLORS = {
  ink: 'rgb(14 21 48)',
  paper: 'rgb(243 246 252)',
  grid: 'rgb(223 230 246)',
  cobalt: 'rgb(35 64 232)',
  sun: 'rgb(255 210 63)',
} as const;

/**
 * The display face, fetched as TrueType because ImageResponse cannot read the
 * woff2 files next/font serves. Without it the card falls back to a plain sans.
 */
export async function bricolage(): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@800').then((r) => r.text());
    const url = css.match(/src: url\((.+?)\) format\('truetype'\)/)?.[1];
    return url ? await fetch(url).then((r) => r.arrayBuffer()) : null;
  } catch {
    return null;
  }
}
