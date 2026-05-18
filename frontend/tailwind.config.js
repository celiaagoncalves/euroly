/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Primary: deep plum / aubergine. Distinct from the typical
        // green/blue palette of finance apps; conveys quiet seriousness
        // without being clinical.
        brand: {
          50:  '#faf5fb',
          100: '#f3e8f5',
          200: '#e7d3eb',
          300: '#d4afdc',
          400: '#bb83c7',
          500: '#9d5cae',
          600: '#7f4291',
          700: '#683676',
          800: '#562e60',
          900: '#48294f',
          950: '#2e1633',
        },
        // Accent: warm amber. Used for highlights, suggestion banners,
        // and the logo glyph mark.
        accent: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        // Neutral surfaces tinted slightly warm so they don't clash
        // with the warm accent.
        surface: {
          0:   '#ffffff',
          50:  '#fafafa',
          100: '#f5f5f4',
          200: '#e7e5e4',
          300: '#d6d3d1',
          400: '#a8a29e',
          500: '#78716c',
          600: '#57534e',
          700: '#44403c',
          800: '#292524',
          900: '#1c1917',
        },
      },
      fontFamily: {
        // Manrope is geometric and friendly, distinctive without being
        // exotic. Less common than Inter so the app reads differently.
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        // Tabular monospace for numeric columns and balances.
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      animation: {
        // Tailwind's default `animate-pulse` is fine for skeletons but
        // a custom shimmer reads more "production-quality".
        shimmer: 'shimmer 1.8s linear infinite',
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
