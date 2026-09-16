'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { translations } from './i18n';
import { api } from './api';
import LockScreen from '@/components/auth/LockScreen';
import { CATEGORIES_DATA, setDynamicCategories } from './categories';
import { 
  getFinancialMonthRange, 
  getCurrentFinancialMonth, 
  getPreviousFinancialMonth, 
  getFinancialMonthKey, 
  getPastFinancialMonths 
} from './date-utils';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [lang, setLang] = useState('he');
  const [theme, setTheme] = useState('dark');
  const [mounted, setMounted] = useState(false);

  // Global Categories State
  const [categoriesTree, setCategoriesTree] = useState(null);
  const [loadingCategories, setLoadingCategories] = useState(false);

  const loadCategories = useCallback(async () => {
    try {
      setLoadingCategories(true);
      const res = await api.getCategories({ tree: 'true' });
      if (res.data?.data && Array.isArray(res.data.data) && res.data.data.length > 0) {
        setCategoriesTree(res.data.data);
        setDynamicCategories(res.data.data);
      }
    } catch (err) {
      console.error('[AppContext] Failed to fetch categories:', err);
    } finally {
      setLoadingCategories(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();

    const handleCategoryUpdate = () => {
      loadCategories();
    };

    window.addEventListener('fintrack_categories_updated', handleCategoryUpdate);
    return () => {
      window.removeEventListener('fintrack_categories_updated', handleCategoryUpdate);
    };
  }, [loadCategories]);

  const expenseCategories = useMemo(() => {
    if (!categoriesTree || categoriesTree.length === 0) return CATEGORIES_DATA.expenses;
    const filtered = categoriesTree.filter((c) => c.type === 'expense' || c.type === 'both' || !c.type);
    return filtered.length > 0 ? filtered : CATEGORIES_DATA.expenses;
  }, [categoriesTree]);

  const incomeCategories = useMemo(() => {
    if (!categoriesTree || categoriesTree.length === 0) return CATEGORIES_DATA.incomes;
    const filtered = categoriesTree.filter((c) => c.type === 'income');
    return filtered.length > 0 ? filtered : CATEGORIES_DATA.incomes;
  }, [categoriesTree]);

  // Financial Month Cycle State (day 1 to 31)
  const [monthStartDay, setMonthStartDayState] = useState(10);

  const loadSettings = useCallback(async () => {
    try {
      const res = await api.getSystemSettings();
      if (res.data?.settings?.monthStartDay !== undefined) {
        const val = parseInt(res.data.settings.monthStartDay, 10);
        if (!isNaN(val)) {
          setMonthStartDayState(Math.min(31, Math.max(1, val)));
        }
      }
    } catch (err) {
      console.warn('[AppContext] Failed to load settings:', err);
    }
  }, []);

  const setMonthStartDay = useCallback((day) => {
    const val = Math.min(31, Math.max(1, parseInt(day, 10) || 10));
    setMonthStartDayState(val);
  }, []);

  useEffect(() => {
    loadSettings();

    const handleSettingsUpdate = (e) => {
      if (e?.detail?.monthStartDay !== undefined) {
        const val = parseInt(e.detail.monthStartDay, 10);
        if (!isNaN(val)) setMonthStartDayState(Math.min(31, Math.max(1, val)));
      } else {
        loadSettings();
      }
    };

    window.addEventListener('fintrack_settings_updated', handleSettingsUpdate);
    return () => {
      window.removeEventListener('fintrack_settings_updated', handleSettingsUpdate);
    };
  }, [loadSettings]);

  const currentFinancialMonth = useMemo(() => {
    return getCurrentFinancialMonth(monthStartDay);
  }, [monthStartDay]);

  const previousFinancialMonth = useMemo(() => {
    return getPreviousFinancialMonth(monthStartDay);
  }, [monthStartDay]);

  const pastFinancialMonths = useMemo(() => {
    return getPastFinancialMonths(24, monthStartDay);
  }, [monthStartDay]);

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
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
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
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
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
        categories: categoriesTree,
        expenseCategories,
        incomeCategories,
        refreshCategories: loadCategories,
        monthStartDay,
        setMonthStartDay,
        currentFinancialMonth,
        previousFinancialMonth,
        pastFinancialMonths,
        getFinancialMonthRange: (y, m) => getFinancialMonthRange(y, m, monthStartDay),
        getFinancialMonthKey: (date) => getFinancialMonthKey(date, monthStartDay),
      }}
    >
      {/* If mounted and not authenticated, render secure LockScreen (except for scoped TMA views) */}
      {mounted && !authChecking && !isAuthenticated && !(typeof window !== 'undefined' && window.location.pathname.startsWith('/tma')) && (
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
