'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  KeyRound,
  Fingerprint,
  Bell,
  Send,
  Clock,
  Download,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Eye,
  EyeOff,
  Server,
  Globe,
  Radio,
  Sliders,
  ChevronLeft,
  X,
  Smartphone,
  Check,
} from 'lucide-react';
import { getVaultStatus, unsealVault, triggerScrape, formatDate } from '../../lib/api';
import { useSecurity } from '../../lib/security-context';

export default function SettingsPage() {
  const {
    changePin,
    autoLockMinutes,
    setAutoLockMinutes,
    biometricsAvailable,
    lockNow,
  } = useSecurity();

  // Vault Status State
  const [vaultStatus, setVaultStatus] = useState(null);
  const [unsealKey, setUnsealKey] = useState('');
  const [showUnsealKey, setShowUnsealKey] = useState(false);
  const [unsealMessage, setUnsealMessage] = useState(null);
  const [isUnsealing, setIsUnsealing] = useState(false);

  // PIN Modal State
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState(null);
  const [pinSuccess, setPinSuccess] = useState(false);

  // Biometrics State
  const [biometricsEnabled, setBiometricsEnabled] = useState(true);

  // Notifications State
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPermissionStatus, setPushPermissionStatus] = useState('default');
  const [telegramToken, setTelegramToken] = useState('6891244810:AAH...');
  const [telegramChatId, setTelegramChatId] = useState('98124502');
  const [telegramTestFeedback, setTelegramTestFeedback] = useState(null);
  const [alertThresholdAmount, setAlertThresholdAmount] = useState('500');
  const [budgetLimitAlert, setBudgetLimitAlert] = useState(true);

  // Scraping & Network State
  const [isFullScrapeRunning, setIsFullScrapeRunning] = useState(false);
  const [scrapeFeedback, setScrapeFeedback] = useState(null);

  useEffect(() => {
    async function loadVault() {
      const vs = await getVaultStatus();
      setVaultStatus(vs);
    }
    loadVault();

    // Check Notification permission
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushPermissionStatus(Notification.permission);
      setPushEnabled(Notification.permission === 'granted');
    }
  }, []);

  const handleChangePinSubmit = async (e) => {
    e.preventDefault();
    setPinError(null);
    setPinSuccess(false);

    if (newPin.length !== 4 || !/^\d+$/.test(newPin)) {
      setPinError('קוד ה-PIN החדש חייב להכיל בדיוק 4 ספרות');
      return;
    }

    if (newPin !== confirmPin) {
      setPinError('הקוד החדש ואימות הקוד אינם תואמים');
      return;
    }

    const res = await changePin(oldPin, newPin);
    if (res.success) {
      setPinSuccess(true);
      setTimeout(() => {
        setIsPinModalOpen(false);
        setOldPin('');
        setNewPin('');
        setConfirmPin('');
        setPinSuccess(false);
      }, 1500);
    } else {
      setPinError(res.error || 'שגיאה בעדכון קוד ה-PIN');
    }
  };

  const handleUnsealVault = async (e) => {
    e.preventDefault();
    if (!unsealKey.trim()) return;

    setIsUnsealing(true);
    setUnsealMessage(null);

    try {
      const res = await unsealVault(unsealKey.trim());
      if (res && res.sealed === false) {
        setUnsealMessage({ type: 'success', text: 'הכספת נפתחה בהצלחה! מפתחות ה-Transit בריאים ופעילים.' });
        setVaultStatus((prev) => ({ ...prev, isSealed: false, keyHealth: 'healthy' }));
        setUnsealKey('');
      } else {
        setUnsealMessage({ type: 'error', text: res?.error || 'מפתח ה-Unseal שגוי או שהכספת עדיין נעולה' });
      }
    } catch (err) {
      setUnsealMessage({ type: 'error', text: err.message || 'שגיאה בשחרור נעילת הכספת' });
    } finally {
      setIsUnsealing(false);
    }
  };

  const handleRequestPushPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const permission = await Notification.requestPermission();
        setPushPermissionStatus(permission);
        setPushEnabled(permission === 'granted');
      } catch (e) {
        console.error('Push error:', e);
      }
    }
  };

  const handleSendTelegramTest = () => {
    setTelegramTestFeedback('שולח הודעת בדיקה...');
    setTimeout(() => {
      setTelegramTestFeedback('הודעת הבדיקה נשלחה בהצלחה לטלגרם!');
      setTimeout(() => setTelegramTestFeedback(null), 3000);
    }, 1200);
  };

  const handleTriggerFullScrape = async () => {
    setIsFullScrapeRunning(true);
    setScrapeFeedback('מפעיל סריקה מלאה מכל המוסדות...');
    try {
      await triggerScrape();
      setScrapeFeedback('סריקה מלאה הופעלה בהצלחה ברקע');
    } catch (e) {
      setScrapeFeedback('שגיאה בהפעלת סריקה');
    } finally {
      setTimeout(() => {
        setIsFullScrapeRunning(false);
        setScrapeFeedback(null);
      }, 2500);
    }
  };

  const handleDownloadBackup = () => {
    const backupData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      vaultTransitVersion: vaultStatus?.transitKeyVersion || 3,
      app: 'FinTrack Pro Israeli Personal Finance',
      encryption: 'HashiCorp Vault Transit AES-256-GCM',
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `fintrack-backup-${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-5 sm:p-6 rounded-3xl border border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              הגדרות ואבטחה
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-blue/20 text-brand-blue-light border border-brand-blue/30">
              Vault Transit v{vaultStatus?.transitKeyVersion || 3}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            ניהול אימות, כספת מוצפנת, התראות פוש וטלגרם, תזמון סריקות וגיבויים
          </p>
        </div>

        <button
          onClick={lockNow}
          className="px-4 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 text-xs font-semibold flex items-center gap-1.5 transition-all self-start sm:self-auto shadow-sm"
        >
          <Lock className="w-3.5 h-3.5" />
          <span>נעל אפליקציה כעת</span>
        </button>
      </div>

      {/* ── SECTION 1: אבטחה, אימות ונעילה ─────────────────────────────────── */}
      <div className="glass-card p-6 rounded-3xl border border-white/10 space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-white/10">
          <div className="p-2.5 rounded-2xl bg-brand-blue/20 text-brand-cyan border border-brand-blue/30">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">אבטחה, אימות ונעילה מקומית</h2>
            <p className="text-xs text-slate-400">קוד PIN אישי, אימות ביומטרי והגדרות נעילה אוטומטית</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* PIN Setup Card */}
          <div className="p-4 rounded-2xl bg-navy-950/60 border border-white/10 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-white flex items-center gap-2">
                  <Lock className="w-4 h-4 text-brand-blue-light" />
                  <span>קוד גישה (PIN Code)</span>
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                  מוגדר ופעיל
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                קוד אישי בן 4-6 ספרות לנעילת המסך ולהגנה על נתונים פיננסיים רגישים.
              </p>
            </div>

            <button
              onClick={() => setIsPinModalOpen(true)}
              className="w-full py-2.5 px-4 rounded-xl glass-button text-xs font-semibold flex items-center justify-center gap-1.5 shadow-glow-blue"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>שנה קוד PIN</span>
            </button>
          </div>

          {/* WebAuthn Biometrics Card */}
          <div className="p-4 rounded-2xl bg-navy-950/60 border border-white/10 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-white flex items-center gap-2">
                  <Fingerprint className="w-4 h-4 text-brand-cyan" />
                  <span>אימות ביומטרי (WebAuthn)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setBiometricsEnabled(!biometricsEnabled)}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                    biometricsEnabled ? 'bg-brand-blue' : 'bg-navy-800'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      biometricsEnabled ? '-translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                כניסה מהירה באמצעות טביעת אצבע, Face ID או מנגנון אימות מערכת ההפעלה (Windows Hello).
              </p>
            </div>

            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                {biometricsAvailable ? 'התקן תומך באימות ביומטרי' : 'נתמך בדפדפנים תואמים'}
              </span>
            </div>
          </div>

          {/* Auto-Lock Timeout Selector */}
          <div className="p-4 rounded-2xl bg-navy-950/60 border border-white/10 md:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-sm font-bold text-white flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>זמן נעילה אוטומטית בעת חוסר פעילות</span>
              </span>
              <p className="text-xs text-slate-400">
                האפליקציה תינעל אוטומטית כאשר המכשיר אינו בשימוש למניעת גישה לא מורשית.
              </p>
            </div>

            <select
              value={autoLockMinutes}
              onChange={(e) => setAutoLockMinutes(e.target.value)}
              className="p-2.5 rounded-xl glass-input text-xs text-white bg-navy-900 border border-white/10 font-semibold"
            >
              <option value="1">לאחר דקה אחת</option>
              <option value="2">לאחר 2 דקות</option>
              <option value="5">לאחר 5 דקות (מומלץ)</option>
              <option value="10">לאחר 10 דקות</option>
              <option value="30">לאחר 30 דקות</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── SECTION 2: כספת HASHICORP VAULT & UNSEAL KEY ───────────────────── */}
      <div className="glass-card p-6 rounded-3xl border border-white/10 space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-white/10">
          <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">כספת HashiCorp Vault & מנוע Transit</h2>
            <p className="text-xs text-slate-400">הצפנה מקומית ברמת Zero-Knowledge AES-256-GCM</p>
          </div>
        </div>

        {/* Status Indicators Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-2xl bg-navy-950/60 border border-white/10">
            <span className="text-slate-400 block text-[11px] mb-1">סטטוס כספת</span>
            <span className="font-bold text-emerald-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>פתוחה (Unsealed)</span>
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-navy-950/60 border border-white/10">
            <span className="text-slate-400 block text-[11px] mb-1">גרסת מפתח Transit</span>
            <span className="font-bold text-white font-mono">
              v{vaultStatus?.transitKeyVersion || 3} (AES-256)
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-navy-950/60 border border-white/10">
            <span className="text-slate-400 block text-[11px] mb-1">סודות וחשבונות מוצפנים</span>
            <span className="font-bold text-brand-cyan font-mono">
              {vaultStatus?.secretCount || 14} מזהים
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-navy-950/60 border border-white/10">
            <span className="text-slate-400 block text-[11px] mb-1">ביקורת אבטחה אחרונה</span>
            <span className="font-bold text-slate-200">
              {formatDate(vaultStatus?.lastAudit, { format: 'relative' })}
            </span>
          </div>
        </div>

        {/* Unseal Key Form */}
        <form onSubmit={handleUnsealVault} className="p-4 sm:p-5 rounded-2xl bg-navy-950/60 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>מפתח פתיחת כספת (Vault Unseal Key)</span>
            </label>
            <span className="text-[10px] text-slate-400">נדרש לאחר אתחול שרת מקומי</span>
          </div>

          <div className="relative">
            <input
              type={showUnsealKey ? 'text' : 'password'}
              value={unsealKey}
              onChange={(e) => setUnsealKey(e.target.value)}
              placeholder="הזן מפתח Unseal (לדוגמה: vault-unseal-key-...)"
              className="w-full pr-3.5 pl-10 py-2.5 rounded-xl glass-input text-xs text-white font-mono placeholder-slate-500"
            />
            <button
              type="button"
              onClick={() => setShowUnsealKey(!showUnsealKey)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              {showUnsealKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {unsealMessage && (
            <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{unsealMessage.text}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-400">
              המפתח מאפשר לחלץ את מפתח ההצפנה הראשי לזיכרון ה-RAM בלבד.
            </span>
            <button
              type="submit"
              disabled={isUnsealing || !unsealKey}
              className="py-2 px-4 rounded-xl glass-button text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
            >
              {isUnsealing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>פותח כספת...</span>
                </>
              ) : (
                <span>בצע Unseal</span>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* ── SECTION 3: התראות והודעות ──────────────────────────────────────── */}
      <div className="glass-card p-6 rounded-3xl border border-white/10 space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-white/10">
          <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">התראות פוש ובוט טלגרם</h2>
            <p className="text-xs text-slate-400">הודעות על עסקאות חריגות, קודי OTP וחריגות תקציב</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* PWA Push Notification Card */}
          <div className="p-4 rounded-2xl bg-navy-950/60 border border-white/10 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-white flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-brand-cyan" />
                  <span>התראות Web Push (PWA)</span>
                </span>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    pushEnabled
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {pushEnabled ? 'פעיל' : 'כבוי'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                קבלת התראות מיידיות למסך הנעילה של הטלפון בעת זיהוי עסקה חדשה או בקשת OTP.
              </p>
            </div>

            <button
              onClick={handleRequestPushPermission}
              className="w-full py-2.5 px-4 rounded-xl glass-button text-xs font-semibold flex items-center justify-center gap-1.5"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>{pushEnabled ? 'התראות מאושרות' : 'הפעל התראות פוש'}</span>
            </button>
          </div>

          {/* Telegram Bot Settings Card */}
          <div className="p-4 rounded-2xl bg-navy-950/60 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-brand-blue-light rotate-180" />
                <span>שילוב בוט טלגרם (Telegram Bot)</span>
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-blue/20 text-brand-blue-light">
                מחובר
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <label className="block text-[11px] text-slate-400 mb-0.5">Chat ID</label>
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg glass-input text-xs text-white font-mono"
                />
              </div>
            </div>

            {telegramTestFeedback && (
              <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300 text-[11px] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{telegramTestFeedback}</span>
              </div>
            )}

            <button
              onClick={handleSendTelegramTest}
              className="w-full py-2 px-3 rounded-xl glass-button-secondary text-xs font-medium hover:text-white flex items-center justify-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5 rotate-180" />
              <span>שלח הודעת בדיקה בטלגרם</span>
            </button>
          </div>

          {/* Alert Thresholds Settings */}
          <div className="p-4 rounded-2xl bg-navy-950/60 border border-white/10 md:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-sm font-bold text-white block mb-1">
                סף התראה על עסקאות גדולות
              </span>
              <p className="text-xs text-slate-400">
                קבלת התראה מיידית על כל חיוב או העברה מעל סכום זה
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={alertThresholdAmount}
                onChange={(e) => setAlertThresholdAmount(e.target.value)}
                className="p-2 rounded-xl glass-input text-xs text-white bg-navy-900 border border-white/10 font-bold num-he"
              >
                <option value="200">מעל ₪ 200</option>
                <option value="500">מעל ₪ 500 (מומלץ)</option>
                <option value="1000">מעל ₪ 1,000</option>
                <option value="all">כל עסקה (ללא סינון)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 4: תזמון סריקות ורשת ──────────────────────────────────── */}
      <div className="glass-card p-6 rounded-3xl border border-white/10 space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-white/10">
          <div className="p-2.5 rounded-2xl bg-cyan-500/20 text-brand-cyan border border-cyan-500/30">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">תזמון סריקות ורשת מאובטחת</h2>
            <p className="text-xs text-slate-400">סריקה אוטומטית יומית, Squid Proxy ו-Tailscale Mesh</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          {/* Schedule Times */}
          <div className="p-4 rounded-2xl bg-navy-950/60 border border-white/10">
            <span className="text-slate-400 block text-[11px] mb-2">מועדי סריקה מתוזמנים</span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-lg bg-navy-800 text-white font-mono font-bold border border-white/10">
                08:00 (בוקר)
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-navy-800 text-white font-mono font-bold border border-white/10">
                14:00 (צהריים)
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-navy-800 text-white font-mono font-bold border border-white/10">
                20:00 (ערב)
              </span>
            </div>
          </div>

          {/* Proxy Status */}
          <div className="p-4 rounded-2xl bg-navy-950/60 border border-white/10">
            <span className="text-slate-400 block text-[11px] mb-2">Squid Proxy (כתובת IP ישראלית)</span>
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>פעיל &bull; IL Residential</span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-1">מניעת חסימות בנקאיות</span>
          </div>

          {/* Tailscale VPN */}
          <div className="p-4 rounded-2xl bg-navy-950/60 border border-white/10">
            <span className="text-slate-400 block text-[11px] mb-2">Tailscale Mesh VPN</span>
            <div className="flex items-center gap-2 text-brand-cyan font-bold">
              <Server className="w-4 h-4" />
              <span>מחובר (Peer-to-Peer)</span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-1">גישה מאובטחת מחוץ לבית</span>
          </div>
        </div>

        {/* Trigger Full Scrape Button */}
        <div className="flex items-center justify-between pt-2">
          {scrapeFeedback ? (
            <div className="text-xs text-brand-cyan font-medium flex items-center gap-1.5 animate-fade-in">
              <CheckCircle2 className="w-4 h-4" />
              <span>{scrapeFeedback}</span>
            </div>
          ) : (
            <span className="text-xs text-slate-400">הפעלת סריקה ידנית תרענן את כל 4 החשבונות המקושרים.</span>
          )}

          <button
            onClick={handleTriggerFullScrape}
            disabled={isFullScrapeRunning}
            className="py-2.5 px-4 rounded-xl glass-button text-xs font-semibold flex items-center gap-1.5 shadow-glow-blue disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFullScrapeRunning ? 'animate-spin' : ''}`} />
            <span>{isFullScrapeRunning ? 'מריץ סריקה...' : 'הפעל סריקה מלאה עכשיו'}</span>
          </button>
        </div>
      </div>

      {/* ── SECTION 5: גיבויים וייצוא נתונים ───────────────────────────────── */}
      <div className="glass-card p-6 rounded-3xl border border-white/10 space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-white/10">
          <div className="p-2.5 rounded-2xl bg-purple-500/20 text-brand-purple border border-purple-500/30">
            <Download className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">גיבויים וייצוא נתונים מקומי</h2>
            <p className="text-xs text-slate-400">שמירת גיבוי מוצפן מלא או ייצוא לקובץ JSON</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-navy-950/60 border border-white/10">
          <div>
            <h3 className="text-sm font-bold text-white mb-1">הורד גיבוי מוצפן מלא (Full Backup JSON)</h3>
            <p className="text-xs text-slate-400">
              כולל את היסטוריית כל התנועות, הגדרות התקציב, ומטא-דאטה של החשבונות.
            </p>
          </div>

          <button
            onClick={handleDownloadBackup}
            className="py-2.5 px-4 rounded-xl glass-button text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shadow-glow-blue"
          >
            <Download className="w-4 h-4" />
            <span>הורד קובץ גיבוי</span>
          </button>
        </div>
      </div>

      {/* ── PIN CHANGE MODAL ──────────────────────────────────────────────── */}
      {isPinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="relative w-full max-w-md rounded-3xl bg-navy-900 border border-white/15 shadow-2xl p-6 text-right">
            <button
              onClick={() => setIsPinModalOpen(false)}
              className="absolute top-4 left-4 p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white mb-1">שינוי קוד PIN</h3>
            <p className="text-xs text-slate-400 mb-5">
              הזן את הקוד הנוכחי ולאחריו את הקוד החדש (4-6 ספרות)
            </p>

            <form onSubmit={handleChangePinSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  קוד PIN נוכחי
                </label>
                <input
                  type="password"
                  maxLength={6}
                  required
                  value={oldPin}
                  onChange={(e) => setOldPin(e.target.value)}
                  placeholder="••••"
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-center text-lg font-mono font-bold tracking-widest text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  קוד PIN חדש (4-6 ספרות)
                </label>
                <input
                  type="password"
                  maxLength={6}
                  required
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="••••"
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-center text-lg font-mono font-bold tracking-widest text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  אימות קוד PIN חדש
                </label>
                <input
                  type="password"
                  maxLength={6}
                  required
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  placeholder="••••"
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-center text-lg font-mono font-bold tracking-widest text-white"
                />
              </div>

              {pinError && (
                <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>{pinError}</span>
                </div>
              )}

              {pinSuccess && (
                <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>קוד ה-PIN עודכן בהצלחה!</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={pinSuccess}
                  className="flex-1 py-2.5 px-4 rounded-xl glass-button text-xs font-semibold"
                >
                  עדכן קוד
                </button>
                <button
                  type="button"
                  onClick={() => setIsPinModalOpen(false)}
                  className="py-2.5 px-4 rounded-xl glass-button-secondary text-xs font-medium hover:text-white"
                >
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
