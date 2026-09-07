'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

/**
 * @typedef {'dark'|'light'|'midnight'} ThemeMode
 */

const ThemeContext = createContext({
  theme: 'dark',
  setTheme: (t) => {},
  toggleTheme: () => {},
  isDark: true,
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('fintrack-theme');
      if (savedTheme && ['dark', 'light', 'midnight'].includes(savedTheme)) {
        setThemeState(savedTheme);
      } else {
        // Default to dark bluish theme
        setThemeState('dark');
      }
    } catch (e) {
      // localStorage error fallback
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem('fintrack-theme', theme);
      const root = document.documentElement;
      root.classList.remove('dark', 'light', 'midnight');
      root.classList.add(theme);

      // Meta theme-color dynamic update
      let metaColor = '#0b132b';
      if (theme === 'light') metaColor = '#f0f4f8';
      if (theme === 'midnight') metaColor = '#030712';

      let metaTag = document.querySelector('meta[name="theme-color"]');
      if (metaTag) {
        metaTag.setAttribute('content', metaColor);
      }
    } catch (e) {
      // ignore
    }
  }, [theme, mounted]);

  const setTheme = (newTheme) => {
    if (['dark', 'light', 'midnight'].includes(newTheme)) {
      setThemeState(newTheme);
    }
  };

  const toggleTheme = () => {
    setThemeState((curr) => {
      if (curr === 'dark') return 'midnight';
      if (curr === 'midnight') return 'light';
      return 'dark';
    });
  };

  const value = {
    theme,
    setTheme,
    toggleTheme,
    isDark: theme !== 'light',
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
