/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef9f3',
          100: '#d6f1e3',
          200: '#aee3c8',
          300: '#7cd0a7',
          400: '#48b885',
          500: '#22a16a',
          600: '#178054',
          700: '#136545',
          800: '#0f4f37',
          900: '#0b3d2c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
