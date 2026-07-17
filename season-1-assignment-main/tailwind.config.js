/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        surface: {
          DEFAULT: '#0f0f1a',
          50: '#1a1a2e',
          100: '#16213e',
          200: '#1e2040',
          300: '#252547',
        },
        glass: 'rgba(255,255,255,0.05)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-glow': 'radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.3) 0%, transparent 70%)',
      },
      boxShadow: {
        glass: '0 4px 24px 0 rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
        glow: '0 0 24px rgba(99,102,241,0.4)',
        'glow-sm': '0 0 12px rgba(99,102,241,0.3)',
        card: '0 8px 32px rgba(0,0,0,0.5)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-left': 'slideLeft 0.4s ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
        'score-ring': 'scoreRing 1s ease-out forwards',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideLeft: { from: { opacity: '0', transform: 'translateX(16px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 12px rgba(99,102,241,0.3)' },
          '50%': { boxShadow: '0 0 28px rgba(99,102,241,0.7)' },
        },
        scoreRing: {
          from: { strokeDashoffset: '283' },
          to: { strokeDashoffset: 'var(--dash-offset)' },
        },
      },
    },
  },
  plugins: [],
};
