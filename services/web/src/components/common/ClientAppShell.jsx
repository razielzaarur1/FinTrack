'use client';

import React, { useEffect } from 'react';
import { ThemeProvider } from '../../lib/theme-context';
import { SecurityProvider } from '../../lib/security-context';
import { OtpProvider } from '../../lib/otp-context';
import Header from './Header';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import LockScreen from './LockScreen';
import OtpModal from './OtpModal';

export default function ClientAppShell({ children }) {
  // Register PWA Service Worker on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            console.log('FinTrack SW registered successfully:', reg.scope);
          })
          .catch((err) => {
            console.warn('FinTrack SW registration failed:', err);
          });
      });
    }
  }, []);

  return (
    <ThemeProvider>
      <SecurityProvider>
        <OtpProvider>
          <div className="min-h-screen bg-navy-950 text-slate-100 flex flex-col selection:bg-brand-blue selection:text-white">
            {/* Global Header */}
            <Header />

            {/* Main App Body */}
            <div className="flex-1 flex w-full max-w-7xl mx-auto">
              {/* Desktop Collapsible Sidebar */}
              <Sidebar />

              {/* Dynamic Page Content */}
              <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 pb-24 md:pb-8 overflow-y-auto">
                {children}
              </main>
            </div>

            {/* Mobile Bottom Navigation Bar */}
            <BottomNav />

            {/* Global Lock Screen Overlay */}
            <LockScreen />

            {/* Global Urgent OTP Modal */}
            <OtpModal />
          </div>
        </OtpProvider>
      </SecurityProvider>
    </ThemeProvider>
  );
}
