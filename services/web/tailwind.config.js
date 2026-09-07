/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#060b19',
          900: '#0b132b',
          850: '#131d3b',
          800: '#1c2541',
          750: '#233054',
          700: '#2b3a67',
          600: '#3a4f8a',
          500: '#4f6cad',
        },
        slate: {
          950: '#080c14',
          900: '#0f172a',
          850: '#162036',
          800: '#1e293b',
          750: '#283548',
          700: '#334155',
          600: '#475569',
        },
        brand: {
          blue: '#3b82f6',
          'blue-hover': '#2563eb',
          'blue-light': '#60a5fa',
          cyan: '#06b6d4',
          'cyan-hover': '#0891b2',
          'cyan-light': '#22d3ee',
          emerald: '#10b981',
          'emerald-light': '#34d399',
          rose: '#f43f5e',
          'rose-light': '#fb7185',
          amber: '#f59e0b',
          'amber-light': '#fbbf24',
          indigo: '#6366f1',
          'indigo-light': '#818cf8',
          purple: '#8b5cf6',
        },
      },
      fontFamily: {
        sans: [
          'Rubik',
          'Assistant',
          'Heebo',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
      },
      boxShadow: {
        'glow-blue': '0 0 20px -3px rgba(59, 130, 246, 0.45)',
        'glow-cyan': '0 0 20px -3px rgba(6, 182, 212, 0.45)',
        'glow-emerald': '0 0 20px -3px rgba(16, 185, 129, 0.45)',
        'glow-rose': '0 0 20px -3px rgba(244, 63, 94, 0.45)',
        'glow-amber': '0 0 20px -3px rgba(245, 158, 11, 0.45)',
        'glass-card': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-10px)' },
          '40%, 80%': { transform: 'translateX(10px)' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.85', transform: 'scale(1.02)' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        shake: 'shake 0.4s ease-in-out',
        'pulse-subtle': 'pulse-subtle 3s ease-in-out infinite',
        'fade-in': 'fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-up': 'slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-down': 'slide-down 0.25s ease-out forwards',
      },
    },
  },
  plugins: [],
};
