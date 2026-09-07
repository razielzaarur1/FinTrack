'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations } from './i18n';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [lang, setLang] = useState('he');
  const [theme, setTheme] = useState('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const savedLang = localStorage.getItem('fintrack_lang') || 'he';
    const savedTheme = localStorage.getItem('fintrack_theme') || 'dark';
    setLang(savedLang);
    setTheme(savedTheme);
    setMounted(true);

    if (savedTheme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }

    document.documentElement.setAttribute('dir', savedLang === 'he' ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', savedLang);
  }, []);

  const toggleLanguage = () => {
    const nextLang = lang === 'he' ? 'en' : 'he';
    setLang(nextLang);
    localStorage.setItem('fintrack_lang', nextLang);
    document.documentElement.setAttribute('dir', nextLang === 'he' ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', nextLang);
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('fintrack_theme', nextTheme);
    if (nextTheme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  };

  const t = (key) => {
    return translations[lang]?.[key] || key;
  };

  return (
    <AppContext.Provider value={{ lang, theme, toggleLanguage, toggleTheme, t, mounted }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
