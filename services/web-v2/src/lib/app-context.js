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
  const [hasPasscode, setHasPasscode] = useState(false);
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
        const configured = Boolean(res.data.hasPasscode);
        setHasPasscode(configured);

        if (!configured) {
          // If no master passcode has been set up, enter directly!
          setIsAuthenticated(true);
        } else if (res.data.authenticated) {
          // Client has valid verified JWT
          setIsAuthenticated(true);
          resetActivityTimer();
        } else {
          // Passcode exists, prompt lock screen
          setIsAuthenticated(false);
        }
      } else {
        // Fallback: server offline, upgrading, or error - DO NOT lock out the user!
        console.warn('[Auth] Status check fallback:', res?.error);
        setHasPasscode(false);
        setIsAuthenticated(true);
      }
      setAuthChecking(false);
      setMounted(true);
    }).catch((err) => {
      console.warn('[Auth] Status check exception:', err);
      setHasPasscode(false);
      setIsAuthenticated(true);
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

  // Emergency Bypass Lock (prevents lockout on server failure)
  const bypassLock = () => {
    setIsAuthenticated(true);
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
        bypassLock,
      }}
    >
      {/* If mounted and not authenticated, render secure LockScreen */}
      {mounted && !authChecking && !isAuthenticated && (
        <LockScreen
          isSetup={!hasPasscode}
          onUnlock={unlock}
          onSetup={setupPasscode}
          onBypass={bypassLock}
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
