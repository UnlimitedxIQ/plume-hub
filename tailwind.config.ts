import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // UO Duck green palette
        plume: {
          50:  '#e6f2ee',
          100: '#c2dfd3',
          200: '#93c0a9',
          300: '#64a17f',
          400: '#358256',
          500: '#006747', // UO primary green
          600: '#005c3f',
          700: '#154733', // dark variant
          800: '#0f3525',
          900: '#0a2419',
        },
        // UO Duck yellow
        'plume-yellow': '#FEE123',
      },
    },
  },
  plugins: [],
} satisfies Config
