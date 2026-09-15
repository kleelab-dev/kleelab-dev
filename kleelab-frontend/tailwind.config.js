/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  // Tailwind's `hover:` variant fires on touch devices too, where the "hover"
  // sticks after a tap and the element looks permanently selected. Restricting
  // it to devices that actually have a pointer makes every hover style below
  // safe on phones without wrapping each one by hand.
  future: {
    hoverOnlyWhenSupported: true,
  },
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
        // #71717a measured 4.40:1 against `canvas` - just under the 4.5:1 AA
        // floor for normal text. `canvas` is the background of every
        // alternating marketing band, so most of the site's secondary copy was
        // failing. Same hue, two steps darker: 4.80:1 on canvas, 5.28:1 on
        // paper. Measured, not eyeballed - re-check both if you change it.
        muted: '#6b6b74',
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
