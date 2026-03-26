/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      animation: {
        'fluid-mesh': 'fluid 20s ease infinite',
        'drift-slow': 'drift 30s ease-in-out infinite',
        'drift-slower': 'drift 38s ease-in-out infinite',
        'drift-reverse': 'driftReverse 34s ease-in-out infinite',
        'glass-sheen': 'glassSheen 14s ease-in-out infinite',
      },
      keyframes: {
        fluid: {
          '0%, 100%': { 'background-position': '0% 50%' },
          '50%': { 'background-position': '100% 50%' },
        },
        drift: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          '50%': { transform: 'translate3d(10px, -14px, 0) scale(1.06)' },
        },
        driftReverse: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          '50%': { transform: 'translate3d(-12px, 10px, 0) scale(1.05)' },
        },
        glassSheen: {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '0.78' },
        },
      },
    },
  },
  plugins: [],
};
