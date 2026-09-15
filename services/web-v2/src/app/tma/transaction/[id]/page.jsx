'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { 
  Check, 
  X, 
  AlertCircle, 
  CreditCard, 
  Calendar, 
  FileText, 
  ShieldAlert, 
  Sparkles,
  Save,
  Layers,
  Info,
  Tag
} from 'lucide-react';
import { api } from '@/lib/api';
import CategoryBadge from '@/components/common/CategoryBadge';
import CategoryPicker from '@/components/common/CategoryPicker';
import { formatILS, formatDate, cleanSpacedHebrew, getTransactionTitle } from '@/lib/formatters';

export default function TmaTransactionPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const id = params?.id;
  const token = searchParams?.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tx, setTx] = useState(null);

  // Form edit state (identical to TransactionDrawer)
  const [merchantName, setMerchantName] = useState('');
  const [category, setCategory] = useState('');
  const [userDescription, setUserDescription] = useState('');
  const [isIgnored, setIsIgnored] = useState(false);
  const [applyToSimilar, setApplyToSimilar] = useState(false);

  // Active tab state (details)
  const [activeTab, setActiveTab] = useState('details');

  // Save feedback
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Telegram WebApp state
  const [initData, setInitData] = useState('');
  const [isTelegramEnv, setIsTelegramEnv] = useState(null); // null: detecting, true: in telegram, false: blocked browser

  // Telegram WebApp initialization & detection
  useEffect(() => {
    let checkInterval = null;
    let attempts = 0;

    const checkTg = () => {
      attempts++;
      if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        const tg = window.Telegram.WebApp;
        try {
          tg.ready();
          tg.expand();
          if (tg.setHeaderColor) tg.setHeaderColor('#0f172a');
        } catch (e) {
          console.warn('Telegram WebApp init error:', e);
        }

        if (tg.initData) {
          setInitData(tg.initData);
          setIsTelegramEnv(true);
          if (checkInterval) clearInterval(checkInterval);
          return true;
        }
      }

      if (attempts >= 10) {
        // After ~1s, if no initData is present, detect if we're in a browser
        const tgData = (typeof window !== 'undefined' && window.Telegram?.WebApp?.initData) || '';
        setInitData(tgData);
        setIsTelegramEnv(Boolean(tgData));
        if (checkInterval) clearInterval(checkInterval);
      }
      return false;
    };

    if (!checkTg()) {
      checkInterval = setInterval(checkTg, 100);
    }

    return () => {
      if (checkInterval) clearInterval(checkInterval);
    };
  }, []);

  // Fetch transaction using scoped zero-trust token and initData
  useEffect(() => {
    if (!id || isTelegramEnv === null) return;
    if (isTelegramEnv === false) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    async function loadData() {
      setLoading(true);
      setError('');

      try {
        const txRes = await api.getTmaTransaction(id, token, initData);
        if (!isMounted) return;

        if (txRes.error || !txRes.data?.data) {
          setError(txRes.error || 'לא ניתן לטעון את פרטי התנועה או שהקישור פג תוקף.');
          setLoading(false);
          return;
        }

        const data = txRes.data.data;
        setTx(data);
        setMerchantName(data.merchantName || '');
        setCategory(data.category || '');
        setUserDescription(data.userDescription || '');
        setIsIgnored(Boolean(data.isIgnored));
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'שגיאת רשת בטעינת הנתונים');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [id, token, isTelegramEnv, initData]);

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);

    try {
      const payload = {
        merchantName: merchantName.trim() || undefined,
        category: category.trim() || undefined,
        userDescription: userDescription.trim() || null,
        isIgnored,
        applyToSimilar,
      };

      const res = await api.updateTmaTransaction(id, payload, token, initData);
      if (res.error) {
        setSaveError(res.error || 'שגיאה בשמירת השינויים');
        if (typeof window !== 'undefined' && window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
        }
      } else {
        setSaveSuccess(true);
        if (typeof window !== 'undefined' && window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
      }
    } catch (err) {
      setSaveError(err.message || 'שגיאה בלתי צפויה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (typeof window !== 'undefined' && window.Telegram?.WebApp?.close) {
      window.Telegram.WebApp.close();
    }
  };

  const currentAmountNum = parseFloat(tx?.amount) || 0;

  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />

      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans rtl flex flex-col justify-between overflow-x-hidden">
        {/* Blocked Browser View */}
        {isTelegramEnv === false && (
          <div className="p-6 m-4 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-4 shadow-2xl my-auto">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mx-auto">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-100">גישה חסומה (403 Forbidden)</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                ממשק עריכה זה מוגן ונגיש אך ורק מתוך אפליקציית טלגרם בחשבונך המורשה.
              </p>
            </div>
            <p className="text-[11px] text-slate-500 bg-slate-950 p-3 rounded-xl border border-slate-800/80">
              🔒 נחסמה גישה מדפדפן חיצוני או ממשתמש שאינו מורשה בהגדרות המערכת.
            </p>
          </div>
        )}

        {/* Loading State */}
        {loading && isTelegramEnv !== false && (
          <div className="p-12 text-center space-y-3 my-auto">
            <div className="w-9 h-9 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-400">טוען את פרטי התנועה...</p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && isTelegramEnv !== false && (
          <div className="p-6 m-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs space-y-2 my-auto">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>שגיאה בגישה לתנועה</span>
            </div>
            <p className="text-slate-300 leading-relaxed">{error}</p>
            <p className="text-[11px] text-slate-400 pt-2 border-t border-rose-500/20">
              ודא שפתחת את הקישור מתוך הודעת הבוט בטלגרם ושלא חלפו יותר מ-7 ימים מעת קבלתה.
            </p>
          </div>
        )}

        {/* Main Content (Matching TransactionDrawer UI) */}
        {!loading && tx && isTelegramEnv !== false && (
          <div className="w-full max-w-lg mx-auto min-h-screen flex flex-col justify-between bg-slate-950 border-x border-slate-800/80 shadow-2xl">
            {/* Header (Exact TransactionDrawer layout) */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60 sticky top-0 backdrop-blur-md z-10">
              <div className="flex items-center gap-3 min-w-0">
                <CategoryBadge category={category || tx.category} size={22} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-400">
                      {tx.accountDisplayName || tx.bankCompany?.toUpperCase()} {tx.cardLast4 ? `(••${tx.cardLast4})` : ''}
                    </span>
                  </div>
                  <div className="text-base sm:text-lg font-bold mt-0.5 truncate text-slate-100 max-w-[220px] sm:max-w-xs">
                    {userDescription || cleanSpacedHebrew(getTransactionTitle(tx))}
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    {formatDate(tx.date, 'he')} • {formatILS(tx.amount, { showSign: true })}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                title="סגור"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab Selector Bar */}
            <div className="flex border-b border-slate-800 px-4 gap-2 text-xs font-medium bg-slate-900/30">
              <button
                type="button"
                onClick={() => setActiveTab('details')}
                className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
                  activeTab === 'details'
                    ? 'border-indigo-500 text-indigo-400 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>פרטים</span>
              </button>
            </div>

            {/* Main Form Body */}
            <form onSubmit={handleSave} className="flex-1 p-4 sm:p-5 space-y-4 overflow-y-auto">
              {/* Custom Name / Nickname */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400">
                  כינוי מותאם אישית (יוצג ככותרת)
                </label>
                <input
                  type="text"
                  value={userDescription}
                  onChange={(e) => setUserDescription(e.target.value)}
                  placeholder={cleanSpacedHebrew(getTransactionTitle(tx))}
                  className="w-full p-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-100 text-sm font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              {/* Read-Only Bank Merchant Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400">
                  שם בית העסק (מקור הבנק / כרטיס)
                </label>
                <div className="w-full p-2.5 rounded-xl border border-slate-800/80 bg-slate-900/60 text-slate-200 font-medium text-sm flex items-center justify-between">
                  <span className="truncate">{cleanSpacedHebrew(merchantName || tx.merchantName || 'לא צוין בית עסק')}</span>
                </div>
              </div>

              {/* Read-Only Financial Metadata Chips Grid */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-xl border border-slate-800/80 bg-slate-900/50 space-y-1">
                  <div className="text-[10px] font-medium text-slate-400">סכום חיוב</div>
                  <div className={`text-xs sm:text-sm font-bold font-mono ${currentAmountNum > 0 ? 'text-emerald-400' : 'text-slate-100'}`}>
                    {formatILS(tx.amount, { showSign: true })}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl border border-slate-800/80 bg-slate-900/50 space-y-1">
                  <div className="text-[10px] font-medium text-slate-400">תאריך עסקה</div>
                  <div className="text-xs font-semibold text-slate-200 font-mono mt-0.5">
                    {formatDate(tx.date, 'he')}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl border border-slate-800/80 bg-slate-900/50 space-y-1">
                  <div className="text-[10px] font-medium text-slate-400">חשבון / כרטיס</div>
                  <div className="text-xs font-semibold text-slate-200 truncate mt-0.5" title={tx.accountDisplayName || tx.bankCompany}>
                    {tx.accountDisplayName || tx.bankCompany?.toUpperCase() || 'ראשי'}
                  </div>
                </div>
              </div>

              {/* Category Picker with Badges & Subcategories */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400">
                  קטגוריה
                </label>
                <CategoryPicker
                  value={category}
                  onChange={setCategory}
                  placeholder="בחר קטגוריה או תת-קטגוריה..."
                />
              </div>

              {/* Compact Checkboxes: Ignore & ApplyToSimilar */}
              <div className="space-y-2 pt-1 border-t border-slate-800/60">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isIgnored}
                    onChange={(e) => setIsIgnored(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                  />
                  <span>התעלם מתנועה זו (לא תיכלל בחישובים וגרפים)</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={applyToSimilar}
                    onChange={(e) => setApplyToSimilar(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                  />
                  <span>החל סיווג זה על כל התנועות הדומות בעתיד</span>
                </label>
              </div>

              {/* Feedback Alerts */}
              {saveSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>התנועה עודכנה בהצלחה!</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="text-[11px] underline hover:text-emerald-300 font-semibold"
                  >
                    סגור חלון
                  </button>
                </div>
              )}

              {saveError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}

              {/* Submit Button (Identical to TransactionDrawer style) */}
              <button
                type="submit"
                disabled={saving}
                className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all cursor-pointer shadow-lg shadow-indigo-600/20 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'שומר שינויים...' : 'שמור שינויים'}</span>
              </button>
            </form>

            {/* Footer Notice */}
            <div className="p-3 text-center border-t border-slate-900 bg-slate-950">
              <p className="text-[10px] text-slate-600 flex items-center justify-center gap-1">
                <ShieldAlert className="w-3 h-3 text-slate-600" />
                FinTrack Zero-Trust TMA • ממשק מאובטח ומבודד
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
