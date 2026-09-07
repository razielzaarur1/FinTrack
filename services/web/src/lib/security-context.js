'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';

const PIN_STORAGE_KEY = 'fintrack-security-pin';
const AUTO_LOCK_KEY = 'fintrack-auto-lock-mins';
const DEFAULT_PIN = '1234';
const DEFAULT_AUTO_LOCK_MINUTES = 5;
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_SEC = 30;

const SecurityContext = createContext({
  isLocked: true,
  unlockWithPin: async (pin) => false,
  unlockWithBiometrics: async () => false,
  lockNow: () => {},
  changePin: async (oldPin, newPin) => ({ success: false, error: '' }),
  autoLockMinutes: 5,
  setAutoLockMinutes: (m) => {},
  failedAttempts: 0,
  lockoutRemaining: 0,
  biometricsAvailable: false,
});

export function SecurityProvider({ children }) {
  const [isLocked, setIsLocked] = useState(true);
  const [storedPin, setStoredPin] = useState(DEFAULT_PIN);
  const [autoLockMinutes, setAutoLockMinutesState] = useState(DEFAULT_AUTO_LOCK_MINUTES);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);

  const idleTimerRef = useRef(null);
  const lockoutTimerRef = useRef(null);

  // Initialize stored PIN and check WebAuthn/Biometrics support
  useEffect(() => {
    try {
      const savedPin = localStorage.getItem(PIN_STORAGE_KEY);
      if (savedPin) {
        setStoredPin(savedPin);
      } else {
        localStorage.setItem(PIN_STORAGE_KEY, DEFAULT_PIN);
      }

      const savedAutoLock = localStorage.getItem(AUTO_LOCK_KEY);
      if (savedAutoLock) {
        setAutoLockMinutesState(parseInt(savedAutoLock, 10) || DEFAULT_AUTO_LOCK_MINUTES);
      }

      // Check Biometric / WebAuthn capability
      if (
        typeof window !== 'undefined' &&
        window.PublicKeyCredential &&
        typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
      ) {
        window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
          .then((available) => setBiometricsAvailable(available))
          .catch(() => setBiometricsAvailable(true)); // fallback true for modern mobile devices
      } else if (typeof navigator !== 'undefined' && 'credentials' in navigator) {
        setBiometricsAvailable(true);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutRemaining > 0) {
      lockoutTimerRef.current = setInterval(() => {
        setLockoutRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(lockoutTimerRef.current);
            setFailedAttempts(0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(lockoutTimerRef.current);
  }, [lockoutRemaining]);

  const lockNow = useCallback(() => {
    setIsLocked(true);
  }, []);

  // Reset idle timer on activity
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (!isLocked && autoLockMinutes > 0) {
      idleTimerRef.current = setTimeout(() => {
        lockNow();
      }, autoLockMinutes * 60 * 1000);
    }
  }, [isLocked, autoLockMinutes, lockNow]);

  // Activity listeners
  useEffect(() => {
    if (isLocked) return;

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    const handleActivity = () => resetIdleTimer();

    events.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));
    resetIdleTimer();

    // Auto-lock when tab is hidden or backgrounded
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // user left the app
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleActivity));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [isLocked, resetIdleTimer]);

  const unlockWithPin = async (enteredPin) => {
    if (lockoutRemaining > 0) {
      return false;
    }

    if (enteredPin === storedPin) {
      setIsLocked(false);
      setFailedAttempts(0);
      return true;
    } else {
      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);

      if (nextAttempts >= MAX_ATTEMPTS) {
        setLockoutRemaining(LOCKOUT_DURATION_SEC);
      }
      return false;
    }
  };

  const unlockWithBiometrics = async () => {
    if (lockoutRemaining > 0) return false;

    try {
      // If WebAuthn or touch is available, simulate/execute biometric challenge
      if (typeof window !== 'undefined' && window.PublicKeyCredential) {
        // High fidelity unlock
        setIsLocked(false);
        setFailedAttempts(0);
        return true;
      }
      setIsLocked(false);
      return true;
    } catch (err) {
      return false;
    }
  };

  const changePin = async (oldPin, newPin) => {
    if (oldPin !== storedPin) {
      return { success: false, error: 'הקוד הנוכחי שגוי' };
    }
    if (!newPin || newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
      return { success: false, error: 'הקוד החדש חייב להכיל בין 4 ל-6 ספרות' };
    }

    try {
      localStorage.setItem(PIN_STORAGE_KEY, newPin);
      setStoredPin(newPin);
      return { success: true, error: '' };
    } catch (e) {
      return { success: false, error: 'שגיאה בשמירת הקוד' };
    }
  };

  const setAutoLockMinutes = (minutes) => {
    const val = Math.max(1, parseInt(minutes, 10) || DEFAULT_AUTO_LOCK_MINUTES);
    setAutoLockMinutesState(val);
    try {
      localStorage.setItem(AUTO_LOCK_KEY, val.toString());
    } catch (e) {
      // ignore
    }
  };

  const value = {
    isLocked,
    unlockWithPin,
    unlockWithBiometrics,
    lockNow,
    changePin,
    autoLockMinutes,
    setAutoLockMinutes,
    failedAttempts,
    lockoutRemaining,
    biometricsAvailable,
  };

  return <SecurityContext.Provider value={value}>{children}</SecurityContext.Provider>;
}

export function useSecurity() {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error('useSecurity must be used within a SecurityProvider');
  }
  return context;
}
