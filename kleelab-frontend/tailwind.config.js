/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      // KleeLab editorial palette. This is the single source of truth for
      // colour - components must use these tokens, never raw hex values.
      colors: {
        paper: '#f6f7f2',
        canvas: '#eef1eb',
        ink: {
          DEFAULT: '#17231c',
          soft: '#2a3a30',
        },
        muted: '#627067',
        line: {
          DEFAULT: '#d8e0d5',
          strong: '#ccd8ca',
          soft: '#edf0ea',
        },
        mint: '#d8e2d2',
        accent: {
          DEFAULT: '#e25d3f',
          dark: '#c94d32',
        },
        danger: {
          DEFAULT: '#a63d24',
          surface: '#fdf1ed',
          line: '#f0c3b7',
        },
        success: {
          DEFAULT: '#2c5540',
          surface: '#eef6f0',
          line: '#bcd8c2',
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
