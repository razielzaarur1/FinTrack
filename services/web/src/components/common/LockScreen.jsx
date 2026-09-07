'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Lock,
  Unlock,
  ShieldAlert,
  Fingerprint,
  Delete,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { useSecurity } from '../../lib/security-context';

export default function LockScreen() {
  const {
    isLocked,
    unlockWithPin,
    unlockWithBiometrics,
    failedAttempts,
    lockoutRemaining,
    biometricsAvailable,
  } = useSecurity();

  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // Reset PIN input when lock screen appears
  useEffect(() => {
    if (isLocked) {
      setPin('');
      setErrorMsg('');
    }
  }, [isLocked]);

  // Handle digit press
  const handleDigit = useCallback(
    async (digit) => {
      if (lockoutRemaining > 0) return;
      if (pin.length >= 6) return;

      const nextPin = pin + digit;
      setPin(nextPin);
      setErrorMsg('');

      // If user typed 4 digits, attempt verification
      if (nextPin.length === 4) {
        const success = await unlockWithPin(nextPin);
        if (!success) {
          setIsShaking(true);
          setErrorMsg('קוד PIN שגוי. נסה שוב.');
          setTimeout(() => {
            setPin('');
            setIsShaking(false);
          }, 600);
        }
      }
    },
    [pin, lockoutRemaining, unlockWithPin]
  );

  // Handle backspace
  const handleBackspace = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
    setErrorMsg('');
  }, []);

  // Handle clear
  const handleClear = useCallback(() => {
    setPin('');
    setErrorMsg('');
  }, []);

  // Keyboard events listener
  useEffect(() => {
    if (!isLocked) return;

    const handleKeyDown = (e) => {
      if (/^[0-9]$/.test(e.key)) {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape') {
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, handleDigit, handleBackspace, handleClear]);

  // Handle biometrics unlock
  const handleBiometrics = async () => {
    if (lockoutRemaining > 0) return;
    const success = await unlockWithBiometrics();
    if (!success) {
      setErrorMsg('אימות ביומטרי נכשל. נא להזין קוד PIN.');
    }
  };

  if (!isLocked) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/90 backdrop-blur-2xl px-4 select-none animate-fade-in">
      <div className="w-full max-w-sm flex flex-col items-center">
        {/* App Emblem & Header */}
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-brand-blue via-brand-cyan to-brand-emerald p-[3px] shadow-glow-blue">
            <div className="w-full h-full bg-navy-900 rounded-[21px] flex items-center justify-center">
              <Lock className="w-9 h-9 text-brand-cyan animate-pulse-subtle" />
            </div>
          </div>
          <div className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-emerald-500 text-navy-950 shadow-md">
            <ShieldCheck className="w-4 h-4" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-white tracking-tight text-center mb-1">
          FinTrack מאובטח
        </h2>
        <p className="text-xs text-slate-400 text-center mb-6">
          הזן קוד PIN אישי או השתמש בזיהוי ביומטרי לפתיחה
        </p>

        {/* Lockout Warning */}
        {lockoutRemaining > 0 && (
          <div className="w-full mb-5 p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs flex items-center gap-2 justify-center animate-pulse">
            <ShieldAlert className="w-4 h-4" />
            <span>הגישה נחסמה זמנית. נסה שוב בעוד {lockoutRemaining} שניות.</span>
          </div>
        )}

        {/* PIN Indicators (4 dots) */}
        <div
          className={`flex items-center justify-center gap-4 mb-6 transition-transform ${
            isShaking ? 'animate-shake' : ''
          }`}
        >
          {[0, 1, 2, 3].map((idx) => {
            const isFilled = pin.length > idx;
            return (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full transition-all duration-200 ${
                  isFilled
                    ? 'bg-brand-cyan scale-125 shadow-glow-cyan'
                    : 'bg-white/15 border border-white/20'
                }`}
              />
            );
          })}
        </div>

        {/* Error Feedback */}
        {errorMsg && (
          <div className="text-xs text-rose-400 font-medium mb-4 flex items-center gap-1.5 animate-fade-in">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Numeric Keypad Grid */}
        <div className="grid grid-cols-3 gap-3.5 w-full max-w-[280px] mb-6">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              onClick={() => handleDigit(num)}
              disabled={lockoutRemaining > 0}
              className="h-16 rounded-2xl bg-navy-800/80 hover:bg-navy-700/80 active:scale-95 border border-white/10 text-2xl font-semibold text-white transition-all shadow-sm flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none"
            >
              {num}
            </button>
          ))}

          {/* Biometrics / FaceID / TouchID */}
          <button
            onClick={handleBiometrics}
            disabled={lockoutRemaining > 0}
            className="h-16 rounded-2xl bg-navy-800/50 hover:bg-navy-700/60 active:scale-95 border border-brand-cyan/20 text-brand-cyan transition-all flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none"
            title="זיהוי ביומטרי / Touch ID"
          >
            <Fingerprint className="w-7 h-7" />
          </button>

          {/* Zero */}
          <button
            onClick={() => handleDigit('0')}
            disabled={lockoutRemaining > 0}
            className="h-16 rounded-2xl bg-navy-800/80 hover:bg-navy-700/80 active:scale-95 border border-white/10 text-2xl font-semibold text-white transition-all shadow-sm flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none"
          >
            0
          </button>

          {/* Backspace */}
          <button
            onClick={handleBackspace}
            disabled={lockoutRemaining > 0 || pin.length === 0}
            className="h-16 rounded-2xl bg-navy-800/50 hover:bg-navy-700/60 active:scale-95 border border-white/10 text-slate-300 hover:text-white transition-all flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none"
            title="מחק ספרה אחרונה"
          >
            <Delete className="w-6 h-6" />
          </button>
        </div>

        {/* PIN Hint / Help Drawer */}
        <div className="w-full text-center">
          <button
            onClick={() => setShowHint(!showHint)}
            className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>שכחת את הקוד?</span>
          </button>

          {showHint && (
            <div className="mt-2 p-2.5 rounded-lg bg-navy-900/90 border border-white/10 text-[11px] text-slate-300 animate-fade-in">
              קוד ה-PIN ההתחלתי של המערכת הוא <span className="font-mono text-brand-cyan font-bold">1234</span>.
              ניתן לשנות אותו בכל עת במסך האבטחה והכספת.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
