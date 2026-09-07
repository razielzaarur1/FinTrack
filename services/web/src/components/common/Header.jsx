import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Sun,
  Moon,
  Sparkles,
  RefreshCw,
  BellRing,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';
import { useTheme } from '../../lib/theme-context';
import { useSecurity } from '../../lib/security-context';
import { useOtp } from '../../lib/otp-context';
import { triggerScrape, getVaultStatus } from '../../lib/api';
import VaultUnsealModal from './VaultUnsealModal';

export default function Header() {
  const { theme, toggleTheme } = useTheme();
  const { lockNow } = useSecurity();
  const { activeOtpRequest } = useOtp();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState(null);
  const [vaultStatus, setVaultStatus] = useState({ isSealed: false, initialized: true });
  const [isUnsealModalOpen, setIsUnsealModalOpen] = useState(false);

  const fetchVault = async () => {
    try {
      const status = await getVaultStatus();
      if (status) setVaultStatus(status);
    } catch (e) {
      // quiet
    }
  };

  useEffect(() => {
    fetchVault();
    const interval = setInterval(fetchVault, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleSyncNow = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncFeedback('מסנכרן חשבונות...');

    try {
      await triggerScrape();
      setSyncFeedback('הסנכרון הושלם בהצלחה');
    } catch (e) {
      setSyncFeedback('שגיאה בסנכרון');
    } finally {
      setTimeout(() => {
        setIsSyncing(false);
        setSyncFeedback(null);
      }, 2500);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 w-full glass-panel border-b border-white/10 px-4 lg:px-8 py-3 transition-colors duration-200">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Brand & Logo */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-blue via-brand-cyan to-brand-emerald p-[2px] shadow-glow-blue transition-transform group-hover:scale-105">
                <div className="w-full h-full bg-navy-900 rounded-[10px] flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-brand-cyan group-hover:text-white transition-colors" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xl tracking-tight bg-gradient-to-l from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                    FinTrack
                  </span>
                  <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-brand-blue/20 text-brand-blue-light border border-brand-blue/30">
                    PRO
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 hidden sm:block">
                  ניהול פיננסי מאובטח &bull; כספת מוצפנת
                </p>
              </div>
            </Link>
          </div>

          {/* Live Security & Sync Badges */}
          <div className="hidden md:flex items-center gap-3">
            {/* Vault Status Badge */}
            {vaultStatus.isSealed ? (
              <button
                onClick={() => setIsUnsealModalOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/50 text-xs text-amber-300 hover:bg-amber-500/30 transition-all animate-pulse cursor-pointer shadow-glow-amber"
                title="לחץ לפתיחת הכספת באמצעות מפתח Unseal"
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-bold">כספת נעולה (Sealed)</span>
                <span className="text-amber-400">|</span>
                <span className="text-[11px] underline underline-offset-2">לחץ ל-Unseal</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-navy-800/80 border border-emerald-500/30 text-xs text-slate-200">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="font-medium text-emerald-400">כספת Vault</span>
                <span className="text-slate-400">|</span>
                <span className="text-[11px] text-slate-300">הצפנת Transit פעילה</span>
              </div>
            )}

            {/* Sync Status Banner */}
            {syncFeedback && (
              <div className="animate-fade-in flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-blue/20 border border-brand-blue/40 text-xs text-brand-blue-light">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-cyan" />
                <span>{syncFeedback}</span>
              </div>
            )}
          </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* OTP Alert Indicator (Shows ONLY when a real OTP request is active) */}
          {activeOtpRequest && (
            <button
              onClick={() => {}}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-300 text-xs font-semibold animate-pulse shadow-glow-amber"
              title="נדרש קוד אימות חד-פעמי"
            >
              <BellRing className="w-4 h-4 text-amber-400 animate-bounce" />
              <span>קוד אימות פעיל ({activeOtpRequest.bank})</span>
            </button>
          )}

          {/* Trigger Scraping / Refresh */}
          <button
            onClick={handleSyncNow}
            disabled={isSyncing}
            className="p-2 rounded-lg bg-navy-800/80 hover:bg-navy-700/80 border border-white/10 text-slate-300 hover:text-white transition-all disabled:opacity-50"
            title="סנכרון נתונים מיידי"
            aria-label="סנכרון נתונים"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-brand-cyan' : ''}`} />
          </button>

          {/* Theme Switcher */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg bg-navy-800/80 hover:bg-navy-700/80 border border-white/10 text-slate-300 hover:text-white transition-colors"
            title={`החלפת ערכת נושא (נוכחי: ${theme === 'dark' ? 'כחול כהה' : theme === 'midnight' ? 'לילה עמוק' : 'בהיר'})`}
            aria-label="החלפת ערכת נושא"
          >
            {theme === 'dark' ? (
              <Moon className="w-4 h-4 text-brand-blue-light" />
            ) : theme === 'midnight' ? (
              <Sparkles className="w-4 h-4 text-brand-cyan" />
            ) : (
              <Sun className="w-4 h-4 text-amber-400" />
            )}
          </button>

          {/* Lock Now Button */}
          <button
            onClick={lockNow}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 text-xs font-medium transition-all shadow-sm"
            title="נעל מסך כעת"
            aria-label="נעילת מסך"
          >
            <Lock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">נעילה</span>
          </button>
        </div>
      </div>
    </header>

    {/* Global Vault Unseal Modal */}
    <VaultUnsealModal
      isOpen={isUnsealModalOpen}
      onClose={() => setIsUnsealModalOpen(false)}
      onUnsealed={() => {
        fetchVault();
      }}
    />
  </>
  );
}
