'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { translations } from './i18n';
import { api } from './api';
import LockScreen from '@/components/auth/LockScreen';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [lang, setLang] = useState('he');
  const [theme, setTheme] = useState('dark');
  const [mounted, setMounted] = useState(false);

  // Security & Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasPasscode, setHasPasscode] = useState(true);
  const [authChecking, setAuthChecking] = useState(true);

  // Inactivity Auto-lock Timer (15 minutes of inactivity)
  const activityTimeoutRef = useRef(null);

  const resetActivityTimer = useCallback(() => {
    if (activityTimeoutRef.current) clearTimeout(activityTimeoutRef.current);
    activityTimeoutRef.current = setTimeout(() => {
      // Auto-lock after 15 minutes of no mouse/keyboard interaction
      if (typeof window !== 'undefined' && localStorage.getItem('fintrack_auth_token')) {
        localStorage.removeItem('fintrack_auth_token');
        setIsAuthenticated(false);
      }
    }, 15 * 60 * 1000);
  }, []);

  useEffect(() => {
    const handleUserActivity = () => {
      resetActivityTimer();
    };

    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('touchstart', handleUserActivity);

    return () => {
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
      if (activityTimeoutRef.current) clearTimeout(activityTimeoutRef.current);
    };
  }, [resetActivityTimer]);

  // Initial Auth & Theme Check on Mount
  useEffect(() => {
    const savedLang = localStorage.getItem('fintrack_lang') || 'he';
    const savedTheme = localStorage.getItem('fintrack_theme') || 'dark';
    setLang(savedLang);
    setTheme(savedTheme);

    if (savedTheme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }

    document.documentElement.setAttribute('dir', savedLang === 'he' ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', savedLang);

    // Check Master Auth Status from Backend
    api.getAuthStatus().then((res) => {
      if (res.data) {
        setHasPasscode(res.data.hasPasscode);
        if (!res.data.hasPasscode) {
          // If no passcode exists in DB yet, show setup screen
          setIsAuthenticated(false);
        } else if (res.data.authenticated) {
          // Client already had a valid JWT in localStorage
          setIsAuthenticated(true);
          resetActivityTimer();
        } else {
          // Passcode exists, but client is not authenticated
          setIsAuthenticated(false);
        }
      }
      setAuthChecking(false);
      setMounted(true);
    }).catch(() => {
      setAuthChecking(false);
      setMounted(true);
    });
  }, [resetActivityTimer]);

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

  // Unlock with Master Passcode
  const unlock = async (passcode) => {
    const res = await api.verifyPasscode(passcode);
    if (res.data?.token) {
      localStorage.setItem('fintrack_auth_token', res.data.token);
      setIsAuthenticated(true);
      resetActivityTimer();
      return { success: true };
    }
    return { error: res.error || 'קוד הגישה שגוי. אנא נסה שוב.' };
  };

  // Setup Master Passcode
  const setupPasscode = async (passcode) => {
    const res = await api.setupPasscode(passcode);
    if (res.data?.token) {
      localStorage.setItem('fintrack_auth_token', res.data.token);
      setHasPasscode(true);
      setIsAuthenticated(true);
      resetActivityTimer();
      return { success: true };
    }
    return { error: res.error || 'שגיאה בהגדרת קוד המאסטר' };
  };

  // Lock the Application Immediately
  const lock = () => {
    localStorage.removeItem('fintrack_auth_token');
    setIsAuthenticated(false);
  };

  return (
    <AppContext.Provider
      value={{
        lang,
        theme,
        toggleLanguage,
        toggleTheme,
        t,
        mounted,
        isAuthenticated,
        hasPasscode,
        authChecking,
        unlock,
        setupPasscode,
        lock,
      }}
    >
      {/* If mounted and not authenticated, render secure LockScreen */}
      {mounted && !authChecking && !isAuthenticated && (
        <LockScreen
          isSetup={!hasPasscode}
          onUnlock={unlock}
          onSetup={setupPasscode}
        />
      )}

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
