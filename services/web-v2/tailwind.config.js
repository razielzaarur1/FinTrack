const plugin = require('tailwindcss/plugin');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0a0d14',
          surface: '#111726',
          'surface-elevated': '#182035',
          border: '#1e293b',
          text: '#f1f5f9',
          'text-muted': '#94a3b8',
        },
        light: {
          bg: '#f8fafc',
          surface: '#ffffff',
          'surface-elevated': '#f1f5f9',
          border: '#e2e8f0',
          text: '#0f172a',
          'text-muted': '#64748b',
        },
        brand: {
          primary: '#6366f1',
          'primary-hover': '#4f46e5',
          income: '#10b981',
          'income-bg': 'rgba(16, 185, 129, 0.1)',
          expense: '#ef4444',
          'expense-bg': 'rgba(239, 68, 68, 0.1)',
          cyan: '#06b6d4',
          amber: '#f59e0b',
        },
      },
      fontFamily: {
        sans: ['Rubik', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [
    plugin(function({ addVariant }) {
      addVariant('light', ['.light &', '.light&']);
    }),
  ],
};
