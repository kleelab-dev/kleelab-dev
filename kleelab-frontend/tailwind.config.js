/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      // KleeLab's palette: monochrome - ink, paper and ash.
      //
      // Note this is the *studio's* palette, used by the marketing site and the
      // builder's own chrome. Customer sites no longer share it: their colours
      // live in a per-site theme (see THEME_SLOTS in src/lib/document.ts).
      colors: {
        paper: '#ffffff',
        canvas: '#f4f4f5',
        ink: {
          DEFAULT: '#0a0a0a',
          soft: '#3f3f46',
        },
        muted: '#71717a',
        line: {
          DEFAULT: '#e4e4e7',
          strong: '#d4d4d8',
          soft: '#f4f4f5',
        },
        mint: '#f4f4f5',
        accent: {
          DEFAULT: '#0a0a0a',
          dark: '#3f3f46',
        },
        // Status tones are greyscale too, to keep the palette honest. Errors and
        // confirmations are told apart by their icon, weight and border rather
        // than by hue - which is also what WCAG 1.4.1 asks for.
        danger: {
          DEFAULT: '#18181b',
          surface: '#fafafa',
          line: '#a1a1aa',
        },
        success: {
          DEFAULT: '#18181b',
          surface: '#fafafa',
          line: '#d4d4d8',
        },
      },
      fontFamily: {
        // Three roles, deliberately distinct:
        //   serif -> editorial display (headings, pull quotes)
        //   sans  -> body and interface copy
        //   mono  -> labels, eyebrows, metadata (the studio's technical voice)
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        serif: ['var(--font-display)', 'ui-serif', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      maxWidth: {
        content: '1200px',
        measure: '68ch',
      },
      letterSpacing: {
        label: '0.14em',
      },
    },
  },
  plugins: [],
};
