'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Wallet, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Calendar, 
  Clock, 
  Tag, 
  Store, 
  FileText,
  Loader2,
  Check
} from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import CategoryPicker from '@/components/common/CategoryPicker';

function getLocalDateTimeString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function AddWalletTransactionModal({ isOpen, onClose, onSuccess }) {
  const { lang, t } = useApp();
  const [type, setType] = useState('expense'); // 'expense' | 'income'
  const [amount, setAmount] = useState('');
  const [dateTime, setDateTime] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setType('expense');
      setAmount('');
      setDateTime(getLocalDateTimeString());
      setMerchantName('');
      setCategory('שונות');
      setDescription('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('נא להזין סכום חיובי תקין');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = {
        amount: type === 'expense' ? -numAmount : numAmount,
        date: dateTime ? new Date(dateTime).toISOString() : new Date().toISOString(),
        merchantName: merchantName.trim() || 'ארנק מזומנים',
        category: category || (type === 'expense' ? 'שונות' : 'הכנסות שונות'),
        description: description.trim() || (type === 'expense' ? 'הוצאת מזומן' : 'הפקדה לארנק'),
        userDescription: description.trim() || undefined,
        type,
      };

      const res = await api.createTransaction(payload);
      if (res.error) {
        setError(res.error || 'שגיאה בשמירת התנועה');
      } else {
        window.dispatchEvent(new CustomEvent('fintrack_tx_updated'));
        window.dispatchEvent(new CustomEvent('fintrack_settings_updated'));
        onSuccess?.(res.data);
        onClose?.();
      }
    } catch (err) {
      setError(err?.message || 'שגיאה בלתי צפויה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-md rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 px-5 border-b border-dark-border/60 light:border-light-border/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-500">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-dark-text light:text-light-text">
                הוספת תנועת ארנק
              </h2>
              <p className="text-[11px] text-dark-text-muted light:text-light-text-muted">
                מעקב מדויק אחר מזומנים – מתעדכן אוטומטית ביתרת הארנק
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-500 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Type Toggle: Expense vs Deposit */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-dark-surface-elevated light:bg-light-surface-elevated border border-dark-border/40 light:border-light-border/40">
            <button
              type="button"
              onClick={() => { setType('expense'); if (category === 'הכנסות שונות') setCategory('שונות'); }}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                type === 'expense'
                  ? 'bg-rose-500 text-white shadow-xs'
                  : 'text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
              }`}
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>הוצאה במזומן</span>
            </button>

            <button
              type="button"
              onClick={() => { setType('income'); if (category === 'שונות') setCategory('הכנסות שונות'); }}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                type === 'income'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>הפקדה לארנק</span>
            </button>
          </div>

          {/* Amount Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
              סכום (₪) *
            </label>
            <div className="relative">
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-dark-text-muted">
                ₪
              </span>
              <input
                type="number"
                step="any"
                min="0.01"
                required
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full py-2.5 pr-8 pl-3 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-lg font-bold font-mono focus:outline-none focus:border-brand-primary"
              />
            </div>
          </div>

          {/* Date & Time Picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>תאריך ושעה</span>
            </label>
            <input
              type="datetime-local"
              required
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs font-medium focus:outline-none focus:border-brand-primary"
            />
          </div>

          {/* Place / Merchant Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted flex items-center gap-1">
              <Store className="w-3.5 h-3.5" />
              <span>בית עסק / מקור</span>
            </label>
            <input
              type="text"
              value={merchantName}
              onChange={(e) => setMerchantName(e.target.value)}
              placeholder={type === 'expense' ? 'לדוגמה: ירקן השכונה, פיצוציה, מונית' : 'לדוגמה: משיכה מכספומט, החזר מזומן מחבר'}
              className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs focus:outline-none focus:border-brand-primary"
            />
          </div>

          {/* Category Picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted flex items-center gap-1">
              <Tag className="w-3.5 h-3.5" />
              <span>קטגוריה</span>
            </label>
            <CategoryPicker
              value={category}
              onChange={(newCat) => setCategory(newCat)}
              type={type}
            />
          </div>

          {/* Note / Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" />
              <span>תיאור / הערה אישית</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="הערה לתנועה זו (אופציונלי)..."
              className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs focus:outline-none focus:border-brand-primary"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated text-xs font-semibold text-dark-text light:text-light-text transition-colors cursor-pointer"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>שומר תנועה...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>הוסף תנועה לארנק</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
