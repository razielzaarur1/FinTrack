'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  PlusCircle,
  RefreshCw,
  Landmark,
  PiggyBank,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { triggerScrape, formatILS } from '../../lib/api';
import { CATEGORIES } from '../../lib/types';

export default function QuickActionModal({ isOpen, onClose, onTransactionAdded }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('menu'); // 'menu' | 'manual_tx'
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);

  // Manual Transaction Form State
  const [txDescription, setTxDescription] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txCategory, setTxCategory] = useState(CATEGORIES[0]?.name || 'סופרמרקט ומזון');
  const [txType, setTxType] = useState('expense'); // 'expense' | 'income'
  const [txSuccess, setTxSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSyncAll = async () => {
    setIsSyncing(true);
    setSyncStatus('מפעיל סנכרון מאובטח...');
    try {
      await triggerScrape();
      setSyncStatus('סנכרון הופעל בהצלחה ברקע');
      setTimeout(() => {
        setIsSyncing(false);
        setSyncStatus(null);
        onClose();
      }, 1500);
    } catch (e) {
      setSyncStatus('שגיאה בהפעלת הסנכרון');
      setIsSyncing(false);
    }
  };

  const handleSaveManualTx = (e) => {
    e.preventDefault();
    if (!txDescription || !txAmount) return;

    const parsedAmount = parseFloat(txAmount);
    const finalAmount = txType === 'expense' ? -Math.abs(parsedAmount) : Math.abs(parsedAmount);

    const newTx = {
      id: `tx-manual-${Date.now()}`,
      description: txDescription,
      merchantName: txDescription,
      amount: finalAmount,
      currency: 'ILS',
      category: txCategory,
      date: new Date().toISOString().split('T')[0],
      status: 'completed',
      accountId: 'manual-cash',
    };

    if (onTransactionAdded) {
      onTransactionAdded(newTx);
    }

    setTxSuccess(true);
    setTimeout(() => {
      setTxSuccess(false);
      setTxDescription('');
      setTxAmount('');
      setActiveTab('menu');
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 backdrop-blur-md p-4 animate-fade-in">
      <div className="relative w-full max-w-lg rounded-3xl bg-navy-900 border border-white/15 shadow-2xl p-6 overflow-hidden text-right">
        {/* Glow Header */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-brand-blue via-brand-cyan to-brand-emerald" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          title="סגור חלון"
          aria-label="סגור"
        >
          <X className="w-5 h-5" />
        </button>

        {activeTab === 'menu' ? (
          <div>
            <div className="mb-5">
              <h3 className="text-xl font-bold text-white tracking-tight">פעולות מהירות</h3>
              <p className="text-xs text-slate-400 mt-1">בחר פעולה פיננסית לביצוע מיידי</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {/* Option 1: Add Manual Transaction */}
              <button
                onClick={() => setActiveTab('manual_tx')}
                className="p-4 rounded-2xl bg-navy-800/80 hover:bg-navy-700/80 border border-white/10 hover:border-brand-blue/50 text-right transition-all group flex flex-col justify-between"
              >
                <div className="p-2.5 rounded-xl bg-brand-blue/20 text-brand-blue-light w-fit mb-3 group-hover:scale-105 transition-transform">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">הוסף תנועה ידנית</h4>
                  <p className="text-xs text-slate-400">הזנת הוצאת מזומן או תשלום לא מקוון</p>
                </div>
              </button>

              {/* Option 2: Full Scrape */}
              <button
                onClick={handleSyncAll}
                disabled={isSyncing}
                className="p-4 rounded-2xl bg-navy-800/80 hover:bg-navy-700/80 border border-white/10 hover:border-brand-cyan/50 text-right transition-all group flex flex-col justify-between"
              >
                <div className="p-2.5 rounded-xl bg-cyan-500/20 text-brand-cyan w-fit mb-3 group-hover:scale-105 transition-transform">
                  <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">סנכרן את כל החשבונות</h4>
                  <p className="text-xs text-slate-400">
                    {syncStatus || 'הפעלת סריקה מכל הבנקים וכרטיסי האשראי'}
                  </p>
                </div>
              </button>

              {/* Option 3: Connect Account */}
              <button
                onClick={() => {
                  onClose();
                  router.push('/accounts?action=add');
                }}
                className="p-4 rounded-2xl bg-navy-800/80 hover:bg-navy-700/80 border border-white/10 hover:border-emerald-500/50 text-right transition-all group flex flex-col justify-between"
              >
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 w-fit mb-3 group-hover:scale-105 transition-transform">
                  <Landmark className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">חבר חשבון חדש</h4>
                  <p className="text-xs text-slate-400">הוספת בנק או כרטיס עם הצפנת Vault</p>
                </div>
              </button>

              {/* Option 4: New Savings Goal */}
              <button
                onClick={() => {
                  onClose();
                  router.push('/budgets?tab=goals');
                }}
                className="p-4 rounded-2xl bg-navy-800/80 hover:bg-navy-700/80 border border-white/10 hover:border-amber-500/50 text-right transition-all group flex flex-col justify-between"
              >
                <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 w-fit mb-3 group-hover:scale-105 transition-transform">
                  <PiggyBank className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">הגדר יעד חיסכון</h4>
                  <p className="text-xs text-slate-400">מעקב חודשי אחר חופשה, רכב או קרן חירום</p>
                </div>
              </button>
            </div>
          </div>
        ) : (
          /* Manual Transaction Sub-form */
          <div>
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setActiveTab('menu')}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                title="חזרה לתפריט"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
              <div>
                <h3 className="text-lg font-bold text-white">הוספת תנועה ידנית</h3>
                <p className="text-xs text-slate-400">עסקה במזומן או הוצאה מחוץ לחשבונות המקושרים</p>
              </div>
            </div>

            <form onSubmit={handleSaveManualTx} className="space-y-4">
              {/* Type Switcher */}
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-navy-950/60 border border-white/10">
                <button
                  type="button"
                  onClick={() => setTxType('expense')}
                  className={`py-2 rounded-lg text-xs font-bold transition-all ${
                    txType === 'expense'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  הוצאה (-₪)
                </button>
                <button
                  type="button"
                  onClick={() => setTxType('income')}
                  className={`py-2 rounded-lg text-xs font-bold transition-all ${
                    txType === 'income'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  הכנסה (+₪)
                </button>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  תיאור העסקה / שם בית עסק
                </label>
                <input
                  type="text"
                  required
                  placeholder="לדוגמה: ירקות בשוק, טיפ במסעדה"
                  value={txDescription}
                  onChange={(e) => setTxDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm text-white placeholder-slate-500"
                />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  סכום (₪)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm text-white placeholder-slate-500 num-he font-bold"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">קטגוריה</label>
                <select
                  value={txCategory}
                  onChange={(e) => setTxCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm text-white bg-navy-900"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.name} className="bg-navy-900 text-white">
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {txSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>התנועה נוספה בהצלחה!</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={txSuccess}
                  className="flex-1 py-2.5 px-4 rounded-xl glass-button text-sm font-semibold flex items-center justify-center gap-2"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>שמור תנועה</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('menu')}
                  className="py-2.5 px-4 rounded-xl glass-button-secondary text-sm font-medium hover:text-white"
                >
                  ביטול
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
