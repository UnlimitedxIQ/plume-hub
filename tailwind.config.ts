import type { Config } from 'tailwindcss'

// Warm dusk palette. Honors the scene sentence:
//   "Sunday night, dorm desk, two assignments before sleep, lamp light,
//    body tired but focused."
//
// All ramps derived in OKLCH so lightness and chroma move monotonically.
//
//   plume       = warm chocolate identity color (the brand)
//   plumeyellow = soft amber accent (the canonical Build action)
//   ink         = warm-dark surface bases (page, panel, card)
//
// Names kept from the previous palette for migration ease; values are
// entirely new. Anything green or duck-yellow has been retired.

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Chocolate ramp at hue ~50 (warm orange-brown).
        plume: {
          50:  '#f4ece1', // oklch(0.94 0.020 60)
          100: '#e2d2bd', // oklch(0.86 0.038 60)
          200: '#cdb09a', // oklch(0.76 0.052 60)
          300: '#b08c75', // oklch(0.64 0.060 60)  - identity text color
          400: '#8d6650', // oklch(0.52 0.062 55)
          500: '#6a4938', // oklch(0.42 0.054 50)  - primary chocolate
          600: '#4d3528', // oklch(0.32 0.046 50)
          700: '#3a2820', // oklch(0.25 0.035 50)  - hero band
          800: '#2a1d18', // oklch(0.18 0.025 45)
          900: '#1c130f', // oklch(0.12 0.018 45)
          950: '#100b08', // oklch(0.07 0.012 45)
        },

        // Amber ramp at hue ~65 (warm orange). Used sparingly: Build button,
        // Send button, identity moments. Never as a surface.
        plumeyellow: {
          300: '#f0bf86',  // oklch(0.82 0.105 70)
          400: '#e8a865',  // oklch(0.76 0.115 68)  - hover Build
          500: '#d99750',  // oklch(0.72 0.120 65)  - Build base
          600: '#c08039',  // oklch(0.64 0.115 60)
          700: '#9d6628',  // oklch(0.54 0.100 55)
        },

        // Warm dark surface base. Pulled toward chocolate (hue 40) so the
        // app feels like a single warm bulb is illuminating it.
        ink: {
          50:  '#efe7da',
          100: '#d8c8b3',
          200: '#a89684',
          300: '#7a6c5f',
          400: '#52483f',
          500: '#383027',
          600: '#26201a',
          700: '#1d1814',
          800: '#14100c',
          900: '#0d0a07',
          950: '#070504',
        },

        // Cream tones for body text, replacing zinc-100/200. Warm, off-white.
        cream: {
          DEFAULT: '#efe4d4', // oklch(0.92 0.025 70)
          muted:   '#9b8c80', // oklch(0.62 0.015 60)  - muted text
          dim:     '#736759', // oklch(0.50 0.012 60)  - placeholder/disabled
        },
      },
      fontSize: {
        micro: ['11px', { lineHeight: '14px', letterSpacing: '0.02em' }],
      },
      transitionTimingFunction: {
        quiet: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      transitionDuration: {
        quick: '120ms',
        mid: '180ms',
        slow: '220ms',
      },
    },
  },
  plugins: [],
} satisfies Config
