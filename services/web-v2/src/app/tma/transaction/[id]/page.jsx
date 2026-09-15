'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { 
  Check, 
  Tag, 
  X, 
  AlertCircle, 
  CreditCard, 
  Calendar, 
  FileText, 
  ShieldAlert, 
  Sparkles,
  ArrowRight,
  ExternalLink
} from 'lucide-react';
import { api } from '@/lib/api';

export default function TmaTransactionPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const id = params?.id;
  const token = searchParams?.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tx, setTx] = useState(null);
  const [categories, setCategories] = useState([]);

  // Form edit state
  const [merchantName, setMerchantName] = useState('');
  const [category, setCategory] = useState('');
  const [userDescription, setUserDescription] = useState('');
  const [isIgnored, setIsIgnored] = useState(false);
  const [applyToSimilar, setApplyToSimilar] = useState(true);

  // Save feedback
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Telegram WebApp initialization
  useEffect(() => {
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      try {
        const tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();
        if (tg.setHeaderColor) {
          tg.setHeaderColor('#0f172a');
        }
      } catch (e) {
        console.warn('Telegram WebApp init warning:', e);
      }
    }
  }, []);

  // Fetch transaction and categories using scoped zero-trust token
  useEffect(() => {
    if (!id) return;

    let isMounted = true;
    async function loadData() {
      setLoading(true);
      setError('');

      try {
        // 1. Fetch transaction
        const txRes = await api.getTmaTransaction(id, token);
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

        // 2. Fetch categories for picker
        const catRes = await api.getTmaCategories(token);
        if (isMounted && catRes.data?.data) {
          setCategories(catRes.data.data);
        }
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
  }, [id, token]);

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

      const res = await api.updateTmaTransaction(id, payload, token);
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

  const selectedCatObj = categories.find((c) => c.name === category);

  // Common quick categories
  const quickCategories = ['מכולת', 'מסעדות', 'קניות', 'תחבורה', 'בידור', 'חשבונות', 'בריאות'];

  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />

      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 pb-12 rtl flex flex-col items-center justify-start">
        <div className="w-full max-w-md space-y-4">
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
              <h1 className="text-sm font-semibold text-slate-200">FinTrack • עריכת תנועה</h1>
            </div>
            <button
              onClick={handleClose}
              className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              סגור
            </button>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="p-8 text-center space-y-3">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-400">טוען את פרטי התנועה...</p>
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="w-4 h-4" />
                <span>שגיאה בגישה לתנועה</span>
              </div>
              <p className="text-slate-300">{error}</p>
              <p className="text-[11px] text-slate-400">
                ודא שפתחת את הקישור מתוך הודעת הבוט בטלגרם ושלא חלפו יותר מ-7 ימים מעת קבלתה.
              </p>
            </div>
          )}

          {/* Main Form */}
          {!loading && tx && (
            <form onSubmit={handleSave} className="space-y-4">
              {/* Transaction Summary Card */}
              <div className="p-4 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-900/90 border border-slate-800 shadow-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                    {tx.date}
                  </span>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 flex items-center gap-1">
                    <CreditCard className="w-3 h-3 text-slate-400" />
                    {tx.accountDisplayName} {tx.cardLast4 ? `(••${tx.cardLast4})` : ''}
                  </span>
                </div>

                <div className="text-center py-2">
                  <div
                    className={`text-3xl font-extrabold tracking-tight ${
                      tx.amount > 0 ? 'text-emerald-400' : 'text-slate-100'
                    }`}
                  >
                    {tx.amount > 0 ? '+' : ''}₪{Math.abs(tx.amount).toLocaleString('he-IL', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-slate-400 mt-1 truncate px-2" title={tx.description}>
                    {tx.description || tx.merchantName}
                  </div>
                </div>
              </div>

              {/* Merchant Name Input */}
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-400">שם בית העסק</label>
                <input
                  type="text"
                  value={merchantName}
                  onChange={(e) => setMerchantName(e.target.value)}
                  placeholder="הזן שם בית עסק..."
                  className="w-full bg-slate-950 border border-slate-700/70 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Category Picker */}
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-indigo-400" />
                    קטגוריה
                  </label>
                  {selectedCatObj && (
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: `${selectedCatObj.color || '#6366f1'}20`,
                        color: selectedCatObj.color || '#818cf8',
                      }}
                    >
                      {selectedCatObj.name}
                    </span>
                  )}
                </div>

                {/* Quick selection chips */}
                <div className="flex flex-wrap gap-1.5">
                  {quickCategories.map((catName) => {
                    const isSelected = category === catName;
                    return (
                      <button
                        key={catName}
                        type="button"
                        onClick={() => setCategory(catName)}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                          isSelected
                            ? 'bg-indigo-600 border-indigo-500 text-white font-semibold shadow-sm'
                            : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        {catName}
                      </button>
                    );
                  })}
                </div>

                {/* Full Category Dropdown */}
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700/70 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">-- בחר קטגוריה --</option>
                  <optgroup label="הוצאות">
                    {categories
                      .filter((c) => c.type === 'expense' || c.type === 'both')
                      .map((c) => (
                        <option key={c.id || c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="הכנסות">
                    {categories
                      .filter((c) => c.type === 'income')
                      .map((c) => (
                        <option key={c.id || c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                  </optgroup>
                </select>
              </div>

              {/* Personal Note (userDescription) */}
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-indigo-400" />
                  הערה / תיאור אישי
                </label>
                <textarea
                  value={userDescription}
                  onChange={(e) => setUserDescription(e.target.value)}
                  placeholder="הוסף הערה חופשית לתנועה זו (לדוגמה: מתנה לחתונה, קניות לשבת)..."
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-700/70 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              {/* Toggles */}
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                {/* Ignore Toggle */}
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isIgnored}
                    onChange={(e) => setIsIgnored(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-xs font-medium text-slate-300 block">התעלם מתנועה זו</span>
                    <span className="text-[11px] text-slate-500 block">
                      אל תכלול תנועה זו בחישובי סך ההוצאות, התקציבים והדוחות
                    </span>
                  </div>
                </label>

                {/* Apply to similar */}
                <label className="flex items-start gap-2.5 cursor-pointer pt-2 border-t border-slate-800/80">
                  <input
                    type="checkbox"
                    checked={applyToSimilar}
                    onChange={(e) => setApplyToSimilar(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-xs font-medium text-indigo-300 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-indigo-400" />
                      החל סיווג זה על תנועות דומות בעתיד
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      שמור חוק חכם שיסווג אוטומטית עסקאות מבית עסק זה
                    </span>
                  </div>
                </label>
              </div>

              {/* Save Feedback Alerts */}
              {saveSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>התנועה עודכנה בהצלחה!</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="text-[11px] underline hover:text-emerald-300"
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

              {/* Submit Button */}
              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold text-sm shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>שומר שינויים...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>שמור שינויים</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Security Notice */}
          <div className="text-center pt-2">
            <p className="text-[10px] text-slate-600 flex items-center justify-center gap-1">
              <ShieldAlert className="w-3 h-3 text-slate-600" />
              חיבור מוצפן ומאובטח • FinTrack Zero-Trust TMA
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
