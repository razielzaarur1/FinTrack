'use client';

import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  KeyRound, 
  Delete, 
  Check, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  Keyboard, 
  Hash 
} from 'lucide-react';

export default function LockScreen({
  isSetup = false,
  onUnlock,
  onSetup,
  onBypass,
}) {
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [step, setStep] = useState('enter'); // 'enter' | 'confirm' (for setup mode)
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [useKeyboardInput, setUseKeyboardInput] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [shake, setShake] = useState(false);

  const triggerShake = (errMsg) => {
    setError(errMsg);
    setShake(true);
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate([80, 50, 80]); } catch (_) {}
    }
    setTimeout(() => setShake(false), 500);
  };

  const handleKeyPress = (digit) => {
    setError('');
    if (passcode.length < 12) {
      const next = passcode + digit;
      setPasscode(next);
      // If setup mode and reached at least 4 digits, user can press enter or proceed
      // If unlock mode and reached 4 or 6 digits, we can auto-submit or let user click
    }
  };

  const handleBackspace = () => {
    setError('');
    setPasscode((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setError('');
    setPasscode('');
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!passcode || passcode.length < 4) {
      triggerShake('קוד הגישה חייב להכיל לפחות 4 תווים');
      return;
    }

    if (isSetup) {
      if (step === 'enter') {
        setConfirmPasscode(passcode);
        setPasscode('');
        setStep('confirm');
        setError('');
        return;
      }

      if (step === 'confirm') {
        if (passcode !== confirmPasscode) {
          triggerShake('הקודים שהוזנו אינם תואמים. נסה שוב.');
          setPasscode('');
          setStep('enter');
          return;
        }

        setLoading(true);
        try {
          const res = await onSetup(passcode);
          if (res?.error) {
            triggerShake(res.error);
            setStep('enter');
            setPasscode('');
          }
        } catch (err) {
          triggerShake(err.message || 'שגיאה בהגדרת הקוד');
        } finally {
          setLoading(false);
        }
        return;
      }
    }

    // Unlock Mode
    setLoading(true);
    try {
      const res = await onUnlock(passcode);
      if (res?.error) {
        triggerShake(res.error);
        setPasscode('');
      }
    } catch (err) {
      triggerShake(err.message || 'קוד הגישה שגוי');
      setPasscode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-bg/95 light:bg-light-bg/95 backdrop-blur-xl p-4 selection:bg-brand-primary selection:text-white">
      <div className={`w-full max-w-sm flex flex-col items-center text-center space-y-6 ${shake ? 'animate-shake' : ''}`}>
        {/* Brand Logo & Lock Badge */}
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-primary to-brand-cyan flex items-center justify-center text-white text-2xl font-black shadow-xl shadow-brand-primary/25">
            FT
          </div>
          <div className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-dark-surface light:bg-light-surface border-2 border-brand-primary flex items-center justify-center text-brand-primary shadow-sm">
            {isSetup ? <KeyRound className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
          </div>
        </div>

        {/* Title & Description */}
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold text-dark-text light:text-light-text">
            {isSetup
              ? step === 'enter'
                ? 'הגדרת קוד גישה מאסטר'
                : 'אימות קוד הגישה'
              : 'FinTrack מאובטח'}
          </h2>
          <p className="text-xs text-dark-text-muted light:text-light-text-muted max-w-xs mx-auto">
            {isSetup
              ? step === 'enter'
                ? 'בחר קוד גישה (PIN או סיסמה) להגנה על הנתונים שלך בכל המכשירים והפלטפורמות'
                : 'אנא הזן את קוד הגישה פעם נוספת לאימות'
              : 'הזן קוד גישה לפתיחה וצפייה בחשבונות ובתנועות שלך'}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="w-full p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex flex-col items-center justify-center gap-2 animate-in fade-in">
            <div className="flex items-center gap-2 text-center">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            {onBypass && (
              <button
                type="button"
                onClick={onBypass}
                className="mt-1 px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-[11px] font-bold text-rose-300 transition-colors"
              >
                המשך לאפליקציה (עקוף נעילה)
              </button>
            )}
          </div>
        )}

        {/* Passcode Indicator Dots (if using PIN Mode) */}
        {!useKeyboardInput ? (
          <div className="flex items-center justify-center gap-3 py-2">
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const isFilled = passcode.length > i;
              return (
                <div
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${
                    isFilled
                      ? 'bg-brand-primary scale-110 shadow-sm shadow-brand-primary'
                      : 'border-2 border-dark-border light:border-light-border bg-dark-surface/50'
                  }`}
                />
              );
            })}
          </div>
        ) : (
          /* Text Input Mode */
          <form onSubmit={handleSubmit} className="w-full space-y-3">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={passcode}
                onChange={(e) => { setError(''); setPasscode(e.target.value); }}
                placeholder={isSetup ? 'הזן סיסמה מאסטר...' : 'הזן סיסמה...'}
                className="w-full p-3.5 text-center text-base rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text focus:outline-none focus:border-brand-primary"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 rtl:left-3 ltr:right-3 top-1/2 -translate-y-1/2 text-dark-text-muted hover:text-dark-text p-1"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </form>
        )}

        {/* Numeric Keypad (for mobile & touch) */}
        {!useKeyboardInput && (
          <div className="w-full grid grid-cols-3 gap-2.5 max-w-[280px]">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleKeyPress(num.toString())}
                className="h-14 rounded-2xl border border-dark-border/80 light:border-light-border/80 bg-dark-surface/80 light:bg-light-surface/80 text-dark-text light:text-light-text text-xl font-bold active:scale-95 active:bg-brand-primary active:text-white transition-all shadow-xs flex items-center justify-center"
              >
                {num}
              </button>
            ))}

            {/* Clear / Backspace */}
            <button
              type="button"
              onClick={handleClear}
              className="h-14 rounded-2xl border border-dark-border/40 light:border-light-border/40 text-dark-text-muted text-xs font-semibold active:scale-95 transition-all flex items-center justify-center"
            >
              נקה
            </button>

            <button
              type="button"
              onClick={() => handleKeyPress('0')}
              className="h-14 rounded-2xl border border-dark-border/80 light:border-light-border/80 bg-dark-surface/80 light:bg-light-surface/80 text-dark-text light:text-light-text text-xl font-bold active:scale-95 active:bg-brand-primary active:text-white transition-all shadow-xs flex items-center justify-center"
            >
              0
            </button>

            <button
              type="button"
              onClick={handleBackspace}
              className="h-14 rounded-2xl border border-dark-border/40 light:border-light-border/40 text-dark-text-muted active:scale-95 transition-all flex items-center justify-center"
              title="מחק תו אחרון"
            >
              <Delete className="w-5 h-5 rtl:rotate-180" />
            </button>
          </div>
        )}

        {/* Submit Action Button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || passcode.length < 4}
          className="w-full max-w-[280px] py-3.5 rounded-xl bg-brand-primary text-white font-bold text-sm hover:bg-brand-primary-hover active:scale-[0.98] disabled:opacity-40 transition-all shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-2"
        >
          {loading ? (
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Check className="w-4 h-4 stroke-[3]" />
              <span>
                {isSetup
                  ? step === 'enter'
                    ? 'המשך לאימות'
                    : 'קבע קוד מאסטר והיכנס'
                  : 'פתח אפליקציה'}
              </span>
            </>
          )}
        </button>

        {/* Toggle Input Mode (PIN vs Alphanumeric Keyboard) */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => {
              setUseKeyboardInput(!useKeyboardInput);
              setPasscode('');
              setError('');
            }}
            className="text-[11px] text-dark-text-muted light:text-light-text-muted hover:text-brand-primary transition-colors flex items-center gap-1.5"
          >
            {useKeyboardInput ? (
              <>
                <Hash className="w-3 h-3" />
                <span>מעבר ללוח מקשים נומרי (PIN)</span>
              </>
            ) : (
              <>
                <Keyboard className="w-3 h-3" />
                <span>מעבר להקלדת סיסמה חופשית (אותיות ומספרים)</span>
              </>
            )}
          </button>
        </div>

        {/* Skip / Direct access option */}
        {onBypass && (
          <button
            type="button"
            onClick={onBypass}
            className="text-xs text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text transition-colors py-1 underline-offset-4 hover:underline"
          >
            דלג והיכנס ישירות למערכת
          </button>
        )}
      </div>
    </div>
  );
}
