'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Send,
  X,
  Smartphone,
  Lock,
} from 'lucide-react';
import { useOtp } from '../../lib/otp-context';
import { ISRAELI_INSTITUTIONS } from '../../lib/types';

export default function OtpModal() {
  const { activeOtpRequest, isSubmitting, isSuccess, error, submitOtpCode, dismissOtp } = useOtp();

  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [timeLeft, setTimeLeft] = useState(180);
  const inputRefs = useRef([]);

  // Setup 180s countdown timer
  useEffect(() => {
    if (!activeOtpRequest) return;

    const remaining = Math.max(0, Math.floor((activeOtpRequest.expiresAt - Date.now()) / 1000));
    setTimeLeft(remaining);

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Auto focus first digit input
    setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 150);

    return () => clearInterval(timer);
  }, [activeOtpRequest]);

  if (!activeOtpRequest) return null;

  // Format seconds into MM:SS
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  const percentRemaining = (timeLeft / (activeOtpRequest.timeoutSeconds || 180)) * 100;

  // Institution Metadata
  const institutionKey = Object.keys(ISRAELI_INSTITUTIONS).find(
    (k) =>
      ISRAELI_INSTITUTIONS[k].name.includes(activeOtpRequest.bank) ||
      k.toLowerCase() === activeOtpRequest.bank.toLowerCase()
  );
  const institution = institutionKey ? ISRAELI_INSTITUTIONS[institutionKey] : null;

  const handleDigitChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;

    const newDigits = [...digits];
    // Handle single character
    newDigits[index] = value.slice(-1);
    setDigits(newDigits);

    // Auto advance focus to next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit if all 6 digits are filled
    const fullCode = newDigits.join('');
    if (fullCode.length === 6 && !newDigits.includes('')) {
      submitOtpCode(fullCode);
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim();
    if (/^\d{4,6}$/.test(pastedData)) {
      const chars = pastedData.split('').slice(0, 6);
      const newDigits = ['', '', '', '', '', ''];
      chars.forEach((c, i) => (newDigits[i] = c));
      setDigits(newDigits);

      const focusIdx = Math.min(chars.length, 5);
      inputRefs.current[focusIdx]?.focus();

      if (chars.length === 6) {
        submitOtpCode(chars.join(''));
      }
    }
  };

  const handleSubmitManual = (e) => {
    e.preventDefault();
    const fullCode = digits.join('');
    if (fullCode.length >= 4) {
      submitOtpCode(fullCode);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 backdrop-blur-md p-4 animate-fade-in">
      <div className="relative w-full max-w-md rounded-3xl bg-navy-900 border border-brand-cyan/30 shadow-2xl p-6 sm:p-8 overflow-hidden text-right">
        {/* Glow Header Accent */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-brand-cyan to-brand-blue" />

        {/* Close Button */}
        <button
          onClick={dismissOtp}
          className="absolute top-4 left-4 p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          title="סגור חלון"
          aria-label="סגור"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Status Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-glow-amber">
            <ShieldAlert className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white tracking-tight">
                נדרש קוד אימות חד-פעמי (OTP)
              </h3>
            </div>
            <p className="text-xs text-slate-300">
              הסנכרון הבנקאי ממתין לקוד שקיבלת בהודעת SMS
            </p>
          </div>
        </div>

        {/* Bank & Phone Info Card */}
        <div className="p-3.5 rounded-2xl bg-navy-800/80 border border-white/10 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-navy-700 flex items-center justify-center font-bold text-xs text-white">
              {institution?.logoText || 'בנק'}
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                {activeOtpRequest.bank}
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-1">
                <Smartphone className="w-3 h-3 text-brand-cyan" />
                <span>נשלח לטלפון {activeOtpRequest.phoneHint || 'המקושר'}</span>
              </div>
            </div>
          </div>

          {/* Live Countdown Timer */}
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1 text-xs font-mono font-bold text-amber-300 bg-amber-500/15 px-2.5 py-1 rounded-lg border border-amber-500/30">
              <Clock className="w-3.5 h-3.5 animate-spin" />
              <span>{timeFormatted}</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5">זמן שנותר</span>
          </div>
        </div>

        {/* 6-Digit OTP Input Boxes */}
        <form onSubmit={handleSubmitManual} className="mb-6">
          <div className="flex items-center justify-center gap-2 sm:gap-3 dir-ltr" onPaste={handlePaste}>
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => (inputRefs.current[idx] = el)}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                disabled={isSubmitting || isSuccess || timeLeft === 0}
                className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-2xl font-mono font-bold rounded-xl border transition-all ${
                  digit
                    ? 'border-brand-cyan bg-brand-cyan/10 text-white shadow-glow-cyan'
                    : 'border-white/15 bg-navy-800/80 text-slate-200 focus:border-brand-blue'
                } focus:outline-none disabled:opacity-50`}
              />
            ))}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-3 p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2 justify-center animate-fade-in">
              <AlertTriangle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          {/* Success State */}
          {isSuccess && (
            <div className="mt-3 p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 justify-center animate-fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>קוד האימות התקבל בהצלחה! הסנכרון ממשיך...</span>
            </div>
          )}

          {/* Time Expired Notice */}
          {timeLeft === 0 && (
            <div className="mt-3 p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs text-center">
              פג תוקף הקוד. אנא הפעל סנכרון מחדש כדי לקבל קוד חדש.
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-6 flex items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting || isSuccess || digits.join('').length < 4 || timeLeft === 0}
              className="flex-1 py-3 px-4 rounded-xl glass-button text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>מאמת קוד...</span>
                </>
              ) : isSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  <span>מאומת</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 rotate-180" />
                  <span>אשר קוד אימות</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={dismissOtp}
              className="py-3 px-4 rounded-xl glass-button-secondary text-sm font-medium hover:text-white"
            >
              ביטול
            </button>
          </div>
        </form>

        {/* Security Note */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <Lock className="w-3 h-3 text-brand-cyan" />
          <span>הקוד מועבר ישירות ובאופן מוצפן לסורק הבנקאי המקומי</span>
        </div>
      </div>
    </div>
  );
}
