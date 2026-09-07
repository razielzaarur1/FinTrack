'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { submitOtp } from './api';

/**
 * @typedef {Object} OtpRequestContext
 * @property {import('./types').OtpRequest|null} activeOtpRequest
 * @property {boolean} isSubmitting
 * @property {boolean} isSuccess
 * @property {string|null} error
 * @property {(code: string) => Promise<boolean>} submitOtpCode
 * @property {() => void} dismissOtp
 * @property {(bankName?: string) => void} triggerDemoOtp
 */

const OtpContext = createContext({
  activeOtpRequest: null,
  isSubmitting: false,
  isSuccess: false,
  error: null,
  submitOtpCode: async (code) => false,
  dismissOtp: () => {},
  triggerDemoOtp: (bankName) => {},
});

export function OtpProvider({ children }) {
  const [activeOtpRequest, setActiveOtpRequest] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState(null);

  // Clear modal state
  const dismissOtp = useCallback(() => {
    setActiveOtpRequest(null);
    setIsSubmitting(false);
    setIsSuccess(false);
    setError(null);
  }, []);

  // Listen to service worker push events / custom window events
  useEffect(() => {
    const handleCustomOtpEvent = (e) => {
      if (e.detail) {
        const { bank, phoneHint, requestId, timeoutSeconds } = e.detail;
        const duration = timeoutSeconds || 180;
        setActiveOtpRequest({
          bank: bank || 'בנק לאומי',
          phoneHint: phoneHint || '****78',
          requestId: requestId || `req-${Date.now()}`,
          timeoutSeconds: duration,
          expiresAt: Date.now() + duration * 1000,
        });
        setError(null);
        setIsSuccess(false);
      }
    };

    window.addEventListener('fintrack-otp-request', handleCustomOtpEvent);
    return () => window.removeEventListener('fintrack-otp-request', handleCustomOtpEvent);
  }, []);

  // Submit entered OTP code
  const submitOtpCode = async (code) => {
    if (!code || code.length < 4) {
      setError('נא להזין קוד אימות תקין');
      return false;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await submitOtp(code, activeOtpRequest?.requestId);
      if (res && res.status === 'success') {
        setIsSuccess(true);
        setTimeout(() => {
          dismissOtp();
        }, 1200);
        return true;
      } else {
        setError(res?.message || 'הקוד שהוזן שגוי או שפג תוקפו');
        setIsSubmitting(false);
        return false;
      }
    } catch (err) {
      setError('שגיאת תקשורת באימות הקוד');
      setIsSubmitting(false);
      return false;
    }
  };

  // Demo Trigger for testing / simulation
  const triggerDemoOtp = (bankName = 'בנק לאומי') => {
    const duration = 180;
    setActiveOtpRequest({
      bank: bankName,
      phoneHint: '054-***892',
      requestId: `demo-${Date.now()}`,
      timeoutSeconds: duration,
      expiresAt: Date.now() + duration * 1000,
    });
    setError(null);
    setIsSuccess(false);
  };

  const value = {
    activeOtpRequest,
    isSubmitting,
    isSuccess,
    error,
    submitOtpCode,
    dismissOtp,
    triggerDemoOtp,
  };

  return <OtpContext.Provider value={value}>{children}</OtpContext.Provider>;
}

export function useOtp() {
  const context = useContext(OtpContext);
  if (!context) {
    throw new Error('useOtp must be used within an OtpProvider');
  }
  return context;
}
