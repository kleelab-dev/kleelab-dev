/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  // Tailwind's `hover:` variant fires on touch devices too, where the "hover"
  // sticks after a tap. Restricting it to real pointers keeps phones honest.
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      // Blueprint: an engineering drawing with a sense of humour. Graph paper,
      // ink linework, a cobalt pen for annotations and a yellow highlighter.
      colors: {
        paper: '#f3f6fc',
        grid: '#dfe6f6',
        white: '#ffffff',
        ink: {
          DEFAULT: '#0e1530',
          soft: '#2b3555',
        },
        // 6.0:1 on paper and 6.5:1 on white, so it carries secondary copy.
        muted: '#55607f',
        line: {
          DEFAULT: '#cfd8ec',
          strong: '#0e1530',
        },
        cobalt: {
          DEFAULT: '#2340e8',
          dark: '#1a30b8',
          soft: '#e6eafd',
        },
        sun: {
          DEFAULT: '#ffd23f',
          soft: '#fff3c4',
        },
        mint: '#d9f5e5',
        danger: {
          DEFAULT: '#b42318',
          soft: '#fde8e6',
        },
      },
      fontFamily: {
        // display -> headlines; sans -> body and interface; mono -> labels,
        // references, dimensions and anything that is a piece of data.
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        // The hard offset shadow is the house signature on cards that matter.
        block: '6px 6px 0 0 #0e1530',
        'block-sm': '3px 3px 0 0 #0e1530',
        'block-cobalt': '6px 6px 0 0 #2340e8',
      },
      maxWidth: {
        content: '1180px',
        measure: '66ch',
      },
      letterSpacing: {
        label: '0.08em',
        tightest: '-0.04em',
      },
    },
  },
  plugins: [],
};
