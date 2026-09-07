'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  Wallet,
  CreditCard,
  PiggyBank,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldCheck,
  RefreshCw,
  BellRing,
  ChevronLeft,
  Lock,
  ArrowLeftRight,
  KeyRound,
  ExternalLink,
  Plus,
  AlertTriangle,
  Sparkles,
  Zap,
  Tag,
  CheckCircle2,
} from 'lucide-react';
import {
  getDashboardKPIs,
  getAccounts,
  getBudgets,
  updateTransactionCategory,
  triggerScrape,
  formatILS,
  formatDate,
  formatPercent,
} from '../lib/api';
import { useOtp } from '../lib/otp-context';
import { ISRAELI_INSTITUTIONS, CATEGORIES } from '../lib/types';
import CategoryDonutChart from '../components/dashboard/CategoryDonutChart';
import MonthlyTrendChart from '../components/dashboard/MonthlyTrendChart';
import BudgetProgressBar from '../components/dashboard/BudgetProgressBar';
import AccountQuickCard from '../components/dashboard/AccountQuickCard';
import QuickActionModal from '../components/dashboard/QuickActionModal';

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncingAccountId, setSyncingAccountId] = useState(null);
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);
  const [activeEditingTxId, setActiveEditingTxId] = useState(null);

  const { activeOtpRequest, triggerDemoOtp } = useOtp();

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const [kpis, accs, bdgs] = await Promise.all([
          getDashboardKPIs(),
          getAccounts(),
          getBudgets(),
        ]);
        setData(kpis);
        setAccounts(accs);
        setBudgets(bdgs);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDashboardData();
  }, []);

  const handleSyncAccount = async (accId) => {
    setSyncingAccountId(accId);
    try {
      await triggerScrape(accId);
      // simulate quick update
      setTimeout(() => {
        setSyncingAccountId(null);
      }, 1500);
    } catch (e) {
      setSyncingAccountId(null);
    }
  };

  const handleCategoryChange = async (txId, newCategory) => {
    try {
      await updateTransactionCategory(txId, newCategory);
      if (data?.recentTransactions) {
        setData((prev) => ({
          ...prev,
          recentTransactions: prev.recentTransactions.map((tx) =>
            tx.id === txId ? { ...tx, category: newCategory } : tx
          ),
        }));
      }
      setActiveEditingTxId(null);
    } catch (e) {
      console.error('Failed to update category:', e);
    }
  };

  const handleManualTxAdded = (newTx) => {
    setData((prev) => {
      if (!prev) return prev;
      const updatedExpenses =
        newTx.amount < 0
          ? prev.monthlyExpenses + Math.abs(newTx.amount)
          : prev.monthlyExpenses;
      const updatedIncome =
        newTx.amount > 0 ? prev.monthlyIncome + newTx.amount : prev.monthlyIncome;

      return {
        ...prev,
        monthlyExpenses: updatedExpenses,
        monthlyIncome: updatedIncome,
        recentTransactions: [newTx, ...(prev.recentTransactions || [])].slice(0, 6),
      };
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-12 h-12 border-3 border-brand-cyan border-t-transparent rounded-full animate-spin shadow-glow-cyan" />
        <p className="text-sm text-slate-400 font-medium">טוען נתונים פיננסיים מאובטחים...</p>
      </div>
    );
  }

  const netCashflow = (data?.monthlyIncome || 0) - (data?.monthlyExpenses || 0);
  const highRiskBudgets = budgets.filter((b) => (b.currentSpent / b.monthlyLimit) >= 0.85);

  return (
    <div className="space-y-6 animate-fade-in relative pb-10">
      {/* ── 1. ALERT BANNERS ──────────────────────────────────────────────── */}
      {/* Pending OTP Alert Banner */}
      {activeOtpRequest && (
        <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-glow-amber animate-pulse">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20">
              <BellRing className="w-5 h-5 text-amber-400 animate-bounce" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">
                דרוש קוד אימות חד-פעמי (OTP) &bull; {activeOtpRequest.bank}
              </h4>
              <p className="text-xs text-amber-200/90">
                סריקת החשבון ממתינה לקוד ה-SMS שנשלח לטלפון שלך
              </p>
            </div>
          </div>
          <button
            onClick={() => {}}
            className="px-4 py-1.5 rounded-xl bg-amber-500 text-navy-950 text-xs font-bold hover:bg-amber-400 transition-colors self-end sm:self-auto"
          >
            הזן קוד עכשיו
          </button>
        </div>
      )}

      {/* High Budget Usage Alert */}
      {highRiskBudgets.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>
              שים לב: קטגוריית <strong>{highRiskBudgets[0].category}</strong> נוצלה ב-
              <strong>
                {Math.round(
                  (highRiskBudgets[0].currentSpent / highRiskBudgets[0].monthlyLimit) * 100
                )}
                %
              </strong>{' '}
              מהמגבלה החודשית.
            </span>
          </div>
          <Link
            href="/budgets"
            className="text-rose-400 hover:text-rose-200 font-semibold underline underline-offset-4 whitespace-nowrap"
          >
            לניהול תקציב
          </Link>
        </div>
      )}

      {/* ── 2. TOP BANNER & ACTIONS ───────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-card p-5 sm:p-6 rounded-3xl border border-white/10">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              סקירה כללית
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>מסונכרן ומאובטח</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            מעקב אחר {accounts.length} חשבונות וכרטיסים בישראל &bull; עודכן לאחרונה{' '}
            {formatDate(data?.lastScrapedAt, { format: 'relative' })}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => triggerDemoOtp('בנק לאומי')}
            className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
          >
            <BellRing className="w-3.5 h-3.5" />
            <span>דיאלוג OTP לדוגמה</span>
          </button>

          <button
            onClick={() => setIsQuickActionOpen(true)}
            className="px-4 py-2 rounded-xl glass-button text-xs font-semibold flex items-center gap-1.5 shadow-glow-blue"
          >
            <Zap className="w-3.5 h-3.5 text-brand-cyan" />
            <span>פעולה מהירה</span>
          </button>
        </div>
      </div>

      {/* ── 3. 5 KPI CARDS ROW ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* KPI 1: Net Worth */}
        <div className="glass-card p-4 sm:p-5 rounded-2xl border border-white/10 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">שווי נקי כולל</span>
            <div className="p-2 rounded-xl bg-brand-blue/20 text-brand-blue-light">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-white tracking-tight num-he">
            {formatILS(data?.netWorth)}
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-emerald-400">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>+4.2% מחודש קודם</span>
          </div>
        </div>

        {/* KPI 2: Monthly Inflow */}
        <div className="glass-card p-4 sm:p-5 rounded-2xl border border-white/10 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">הכנסות החודש</span>
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-400 tracking-tight num-he">
            {formatILS(data?.monthlyIncome, { showSign: true })}
          </div>
          <div className="mt-2 text-[11px] text-slate-400 truncate">
            משכורת חודשית והעברות
          </div>
        </div>

        {/* KPI 3: Monthly Outflow */}
        <div className="glass-card p-4 sm:p-5 rounded-2xl border border-white/10 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">הוצאות החודש</span>
            <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-white tracking-tight num-he">
            {formatILS(data?.monthlyExpenses)}
          </div>
          <div className="mt-2 text-[11px] text-slate-400 truncate">
            אשראי, הוראות קבע ומזומן
          </div>
        </div>

        {/* KPI 4: Net Cashflow */}
        <div className="glass-card p-4 sm:p-5 rounded-2xl border border-white/10 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">תזרים נטו חודשי</span>
            <div
              className={`p-2 rounded-xl ${
                netCashflow >= 0 ? 'bg-cyan-500/20 text-brand-cyan' : 'bg-rose-500/20 text-rose-400'
              }`}
            >
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div
            className={`text-xl sm:text-2xl font-bold tracking-tight num-he ${
              netCashflow >= 0 ? 'text-brand-cyan' : 'text-rose-400'
            }`}
          >
            {formatILS(netCashflow, { showSign: true })}
          </div>
          <div className="mt-2 text-[11px] text-slate-400 truncate">
            {netCashflow >= 0 ? 'עודף חיובי נצבר' : 'גירעון בתזרים'}
          </div>
        </div>

        {/* KPI 5: Savings Rate */}
        <div className="glass-card p-4 sm:p-5 rounded-2xl border border-white/10 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">שיעור חיסכון</span>
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
              <PiggyBank className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-amber-300 tracking-tight num-he">
            {formatPercent(data?.savingsRate)}
          </div>
          <div className="mt-2 text-[11px] text-emerald-400 truncate">
            יעד חיסכון: 35% (הושג!)
          </div>
        </div>
      </div>

      {/* ── 4. ISRAELI BANK ACCOUNTS QUICK STRIP ──────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              חשבונות וכרטיסים מקושרים
            </h2>
            <span className="text-xs text-slate-400">({accounts.length})</span>
          </div>
          <Link
            href="/accounts"
            className="text-xs text-brand-cyan hover:text-brand-blue-light font-medium flex items-center gap-1 transition-colors"
          >
            <span>ניהול כל החשבונות</span>
            <ChevronLeft className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {accounts.map((acc) => (
            <AccountQuickCard
              key={acc.id}
              account={acc}
              onSync={handleSyncAccount}
              isSyncing={syncingAccountId === acc.id}
            />
          ))}

          {/* Add Account Card Button */}
          <Link
            href="/accounts?action=add"
            className="group rounded-2xl border-2 border-dashed border-white/15 hover:border-brand-blue/60 p-4 flex flex-col items-center justify-center text-center transition-all duration-200 hover:bg-white/5 min-h-[140px]"
          >
            <div className="p-3 rounded-full bg-white/5 group-hover:bg-brand-blue/20 text-slate-400 group-hover:text-brand-cyan mb-2 transition-colors">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-slate-300 group-hover:text-white">
              חבר חשבון נוסף
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5">בנק, אשראי או כרטיס נטען</span>
          </Link>
        </div>
      </div>

      {/* ── 5. CHARTS ROW: Trend + Donut ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Area Chart (2 Cols) */}
        <div className="lg:col-span-2 glass-card p-5 sm:p-6 rounded-3xl border border-white/10 flex flex-col justify-between">
          <MonthlyTrendChart data={data?.monthlyTrend} />
        </div>

        {/* Expense Category Donut Chart (1 Col) */}
        <div className="glass-card p-5 sm:p-6 rounded-3xl border border-white/10 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-bold text-white">פילוח הוצאות החודש</h3>
                <p className="text-xs text-slate-400">התפלגות לפי קטגוריות</p>
              </div>
              <Link
                href="/budgets"
                className="text-xs text-brand-cyan hover:text-brand-blue-light font-medium"
              >
                תקציבים
              </Link>
            </div>
            <CategoryDonutChart
              data={data?.categoryBreakdown}
              totalAmount={data?.monthlyExpenses}
            />
          </div>
        </div>
      </div>

      {/* ── 6. RECENT TRANSACTIONS + BUDGET PROGRESS BARS ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Transactions List (2 Cols) */}
        <div className="lg:col-span-2 glass-card p-5 sm:p-6 rounded-3xl border border-white/10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">תנועות אחרונות</h2>
              <p className="text-xs text-slate-400">הוצאות והכנסות שסונכרנו לאחרונה</p>
            </div>
            <Link
              href="/transactions"
              className="text-xs text-brand-cyan hover:text-brand-blue-light font-medium flex items-center gap-1 transition-colors"
            >
              <span>לכל התנועות ({data?.recentTransactions?.length || 0})</span>
              <ChevronLeft className="w-4 h-4" />
            </Link>
          </div>

          <div className="divide-y divide-white/5">
            {data?.recentTransactions?.map((tx) => {
              const isIncome = tx.amount > 0;
              const isEditing = activeEditingTxId === tx.id;

              return (
                <div
                  key={tx.id}
                  className="py-3 flex items-center justify-between gap-3 hover:bg-white/5 rounded-xl px-2 transition-colors relative"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                        isIncome
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-navy-800 text-slate-300 border border-white/10'
                      }`}
                    >
                      {isIncome ? '₪+' : '₪-'}
                    </div>

                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        {tx.description}
                      </div>

                      <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                        {/* Interactive Category Tag */}
                        <div className="relative">
                          <button
                            onClick={() => setActiveEditingTxId(isEditing ? null : tx.id)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/15 border border-white/10 text-slate-300 text-[11px] transition-colors"
                            title="לחץ לעריכת קטגוריה"
                          >
                            <Tag className="w-2.5 h-2.5 text-brand-cyan" />
                            <span>{tx.category}</span>
                          </button>

                          {/* Quick Category Popover */}
                          {isEditing && (
                            <div className="absolute top-full right-0 mt-1 z-30 w-48 rounded-xl bg-navy-900 border border-white/20 shadow-2xl p-2 space-y-1 text-right animate-fade-in">
                              <div className="text-[10px] font-bold text-slate-400 px-2 py-1">
                                בחר קטגוריה חדשה:
                              </div>
                              <div className="max-h-40 overflow-y-auto space-y-0.5">
                                {CATEGORIES.map((cat) => (
                                  <button
                                    key={cat.id}
                                    onClick={() => handleCategoryChange(tx.id, cat.name)}
                                    className={`w-full text-right px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between ${
                                      tx.category === cat.name
                                        ? 'bg-brand-blue/30 text-white font-bold'
                                        : 'hover:bg-white/10 text-slate-300'
                                    }`}
                                  >
                                    <span>{cat.name}</span>
                                    {tx.category === cat.name && (
                                      <CheckCircle2 className="w-3.5 h-3.5 text-brand-cyan" />
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <span>&bull;</span>
                        <span>{formatDate(tx.date)}</span>
                      </div>
                    </div>
                  </div>

                  <div
                    className={`text-sm font-bold text-left num-he flex-shrink-0 ${
                      isIncome ? 'text-emerald-400' : 'text-slate-100'
                    }`}
                  >
                    {formatILS(tx.amount, { showSign: true })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Budgets Quick Track (1 Col) */}
        <div className="glass-card p-5 sm:p-6 rounded-3xl border border-white/10 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-white">סטטוס תקציבים</h3>
                <p className="text-xs text-slate-400">מעקב חודשי לפי קטגוריות</p>
              </div>
              <Link
                href="/budgets"
                className="text-xs text-brand-cyan hover:text-brand-blue-light font-medium"
              >
                לכל התקציבים
              </Link>
            </div>

            <div className="space-y-4">
              {budgets.slice(0, 4).map((b) => (
                <BudgetProgressBar
                  key={b.id}
                  category={b.category}
                  spent={b.currentSpent}
                  limit={b.monthlyLimit}
                  warningThreshold={b.alertThreshold || 80}
                  height="h-2"
                />
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/10">
            <Link
              href="/budgets"
              className="w-full py-2 px-3 rounded-xl glass-button-secondary text-xs font-semibold flex items-center justify-center gap-1.5 hover:text-white"
            >
              <span>ערוך תקציבים ויעדים</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── 7. SECURITY NOTICE FOOTER BANNER ──────────────────────────────── */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-navy-900 via-navy-850 to-navy-900 border border-brand-blue/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-brand-blue/20 text-brand-cyan border border-brand-blue/30 flex-shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">
              מערכת מאובטחת מקומית &bull; מנוע HashiCorp Vault Transit
            </h3>
            <p className="text-xs text-slate-400">
              כל פרטי ההזדהות מוצפנים במפתח AES-256 מקומי. כל הסריקות מבוצעות דרך שרת מקומי ללא ענן.
            </p>
          </div>
        </div>

        <Link
          href="/settings"
          className="text-xs font-semibold px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 flex items-center gap-1.5 whitespace-nowrap transition-colors"
        >
          <span>הגדרות ואבטחה</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* ── 8. FLOATING QUICK ACTION MODAL ────────────────────────────────── */}
      <QuickActionModal
        isOpen={isQuickActionOpen}
        onClose={() => setIsQuickActionOpen(false)}
        onTransactionAdded={handleManualTxAdded}
      />
    </div>
  );
}
