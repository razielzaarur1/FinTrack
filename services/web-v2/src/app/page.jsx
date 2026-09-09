'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownRight, 
  Landmark, 
  Calendar,
  AlertCircle,
  PlusCircle,
  ChevronRight
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { useApp } from '@/lib/app-context';
import { api } from '@/lib/api';
import { formatILS, formatDate } from '@/lib/formatters';
import { getInstitutionById } from '@/lib/institutions';
import InstitutionLogo from '@/components/common/InstitutionLogo';
import CategoryBadge from '@/components/common/CategoryBadge';

export default function DashboardPage() {
  const { t, lang, theme } = useApp();
  const [overview, setOverview] = useState(null);
  const [trend, setTrend] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [recentTx, setRecentTx] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);
        const [overviewRes, trendRes, accountsRes, txRes] = await Promise.all([
          api.getAnalyticsOverview(),
          api.getMonthlyTrend(6),
          api.getAccounts(),
          api.getTransactionsV2({ limit: 5 }),
        ]);

        if (overviewRes.data) setOverview(overviewRes.data);
        if (trendRes.data) setTrend(trendRes.data.data || []);
        if (accountsRes.data) setAccounts(accountsRes.data || []);
        if (txRes.data) setRecentTx(txRes.data.data || []);
      } catch (err) {
        console.error('Error loading dashboard:', err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  return (
    <div className="space-y-8 relative">
      {/* Ambient background glows for depth and vibrant atmosphere */}
      <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="fixed bottom-0 left-0 w-[450px] h-[450px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none -z-10" />
      {/* Top Welcome & KPI Cards */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
          {t('dashboard')}
        </h1>
        <p className="text-sm text-dark-text-muted light:text-light-text-muted">
          {lang === 'he' ? 'סקירה פיננסית בזמן אמת של כל החשבונות שלך' : 'Real-time overview of all your financial accounts'}
        </p>
      </div>

      {/* 4 Main KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Net Worth */}
        <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface shadow-sm space-y-3">
          <div className="flex items-center justify-between text-dark-text-muted light:text-light-text-muted text-sm font-medium">
            <span>{t('netWorth')}</span>
            <Wallet className="w-5 h-5 text-brand-primary" />
          </div>
          <div className="text-2xl md:text-3xl font-bold tracking-tight">
            {overview ? formatILS(overview.netWorth) : '₪0.00'}
          </div>
          <div className="text-xs text-dark-text-muted light:text-light-text-muted">
            {accounts.length} {lang === 'he' ? 'חשבונות מחוברים' : 'connected accounts'}
          </div>
        </div>

        {/* Monthly Income */}
        <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface shadow-sm space-y-3">
          <div className="flex items-center justify-between text-dark-text-muted light:text-light-text-muted text-sm font-medium">
            <span>{t('monthlyIncome')}</span>
            <ArrowUpRight className="w-5 h-5 text-brand-income" />
          </div>
          <div className="text-2xl md:text-3xl font-bold tracking-tight text-brand-income">
            {overview ? formatILS(overview.totalIncome) : '₪0.00'}
          </div>
          <div className="text-xs text-dark-text-muted light:text-light-text-muted">
            {lang === 'he' ? 'החודש הנוכחי' : 'Current month'}
          </div>
        </div>

        {/* Monthly Expenses */}
        <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface shadow-sm space-y-3">
          <div className="flex items-center justify-between text-dark-text-muted light:text-light-text-muted text-sm font-medium">
            <span>{t('monthlyExpenses')}</span>
            <ArrowDownRight className="w-5 h-5 text-brand-expense" />
          </div>
          <div className="text-2xl md:text-3xl font-bold tracking-tight text-brand-expense">
            {overview ? formatILS(overview.totalExpense) : '₪0.00'}
          </div>
          <div className="text-xs text-dark-text-muted light:text-light-text-muted">
            {lang === 'he' ? 'החודש הנוכחי' : 'Current month'}
          </div>
        </div>

        {/* Savings Rate */}
        <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface shadow-sm space-y-3">
          <div className="flex items-center justify-between text-dark-text-muted light:text-light-text-muted text-sm font-medium">
            <span>{t('savingsRate')}</span>
            <TrendingUp className="w-5 h-5 text-brand-cyan" />
          </div>
          <div className="text-2xl md:text-3xl font-bold tracking-tight text-brand-cyan">
            {overview ? `${overview.savingsRate}%` : '0%'}
          </div>
          <div className="text-xs text-dark-text-muted light:text-light-text-muted">
            {overview && overview.netSavings >= 0 ? `+${formatILS(overview.netSavings)}` : formatILS(overview?.netSavings || 0)}
          </div>
        </div>
      </div>

      {/* Account Quick Carousel / Strip */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Landmark className="w-5 h-5 text-brand-primary" />
            <span>{t('accounts')}</span>
          </h2>
          <Link href="/accounts" className="text-xs text-brand-primary hover:underline flex items-center gap-1 font-medium">
            <span>{t('viewAll')}</span>
            <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
          </Link>
        </div>

        {accounts.length === 0 ? (
          <div className="p-8 rounded-2xl border border-dashed border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface flex flex-col items-center justify-center text-center space-y-3">
            <Landmark className="w-10 h-10 text-dark-text-muted light:text-light-text-muted opacity-50" />
            <div className="text-sm font-medium">{t('noData')}</div>
            <p className="text-xs text-dark-text-muted light:text-light-text-muted max-w-sm">
              {t('connectFirstAccount')}
            </p>
            <Link
              href="/accounts"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-primary text-white text-xs font-semibold shadow-md shadow-brand-primary/20 hover:bg-brand-primary-hover transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{t('addAccount')}</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {accounts.map((acc) => {
              const inst = getInstitutionById(acc.bankCompany);
              const isCredit = acc.accountType === 'credit' || inst.type === 'credit';
              const isRefund = isCredit && (acc.balance || 0) < 0;

              return (
                <div
                  key={acc.id}
                  className="p-4 rounded-2xl border border-dark-border/80 light:border-light-border/80 bg-dark-surface light:bg-light-surface space-y-2 hover:border-brand-primary/50 transition-all shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <InstitutionLogo bankCompany={acc.bankCompany} size={28} />
                      <span className="text-xs font-bold" style={{ color: inst.color }}>
                        {inst.name}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-dark-text-muted light:text-light-text-muted">
                      ••••{acc.accountNumber || '0000'}
                    </span>
                  </div>

                  <div className="font-bold text-sm truncate text-dark-text light:text-light-text">
                    {acc.displayName || inst.name}
                  </div>

                  <div className="flex items-baseline justify-between pt-1">
                    <span className="text-[11px] text-dark-text-muted">
                      {isCredit ? (isRefund ? 'זיכוי צפוי:' : 'חיוב צפוי:') : 'יתרה:'}
                    </span>
                    <span 
                      className={`text-base font-bold ${
                        isRefund 
                          ? 'text-emerald-500' 
                          : isCredit 
                          ? 'text-brand-amber' 
                          : (acc.balance < 0 ? 'text-rose-500' : 'text-emerald-500')
                      }`} 
                      dir="ltr"
                    >
                      {formatILS(acc.balance, { showSign: isRefund || (!isCredit && acc.balance < 0) })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Trend & Recent Transactions Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Trend Area Chart */}
        <div className="lg:col-span-2 p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-base">{t('incomeVsExpenses')}</h3>
            <span className="text-xs text-dark-text-muted light:text-light-text-muted">6 {lang === 'he' ? 'חודשים אחרונים' : 'months'}</span>
          </div>

          {trend.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center text-xs text-dark-text-muted light:text-light-text-muted space-y-2">
              <Calendar className="w-8 h-8 opacity-40" />
              <span>{t('noData')}</span>
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorInc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(val) => `₪${val}`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: theme === 'light' ? '#ffffff' : '#111726',
                      borderColor: theme === 'light' ? '#e2e8f0' : '#1e293b',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                      color: theme === 'light' ? '#0f172a' : '#f1f5f9',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    }}
                    itemStyle={{
                      color: theme === 'light' ? '#0f172a' : '#f1f5f9',
                    }}
                    formatter={(val) => formatILS(val)}
                  />
                  <Area type="monotone" dataKey="income" name={t('income')} stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorInc)" />
                  <Area type="monotone" dataKey="expenses" name={t('expense')} stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorExp)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Recent Transactions List */}
        <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-base">{t('recentTransactions')}</h3>
              <Link href="/transactions" className="text-xs text-brand-primary hover:underline">
                {t('viewAll')}
              </Link>
            </div>

            {recentTx.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center text-xs text-dark-text-muted light:text-light-text-muted space-y-2">
                <AlertCircle className="w-8 h-8 opacity-40" />
                <span>{t('noTransactions')}</span>
              </div>
            ) : (
              <div className="space-y-3">
                {recentTx.map((tx) => {
                  const isPositive = parseFloat(tx.amount) > 0;
                  const merchantTitle = tx.userDescription || tx.merchantName || tx.description;
                  const subDescription = tx.description && tx.description !== merchantTitle ? tx.description : null;

                  return (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-3 rounded-2xl border border-dark-border/50 light:border-light-border/50 bg-dark-surface-elevated/50 light:bg-light-surface-elevated/50 text-sm hover:bg-dark-surface-elevated transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-1">
                        <CategoryBadge category={tx.category} size={18} />
                        <div className="min-w-0">
                          <div className="font-bold truncate text-xs sm:text-sm text-dark-text light:text-light-text">
                            {merchantTitle}
                          </div>
                          <div className="text-[11px] text-dark-text-muted light:text-light-text-muted flex items-center gap-2 mt-0.5">
                            {subDescription && (
                              <>
                                <span className="truncate max-w-[140px] opacity-80">{subDescription}</span>
                                <span>•</span>
                              </>
                            )}
                            <span>{formatDate(tx.date, lang)}</span>
                            <span>•</span>
                            <span>{tx.category || (lang === 'he' ? 'ללא קטגוריה' : 'Uncategorized')}</span>
                          </div>
                        </div>
                      </div>
                      <div className={`font-bold shrink-0 text-sm sm:text-base ${isPositive ? 'text-emerald-500 dark:text-emerald-400' : 'text-dark-text light:text-light-text'}`} dir="ltr">
                        {formatILS(tx.amount, { showSign: true })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Link
            href="/transactions"
            className="w-full text-center py-2.5 rounded-xl border border-dark-border light:border-light-border hover:border-brand-primary text-xs font-semibold transition-all"
          >
            {lang === 'he' ? 'כל התנועות עם חיפוש ופיצולים ←' : 'Browse All Transactions & Splits →'}
          </Link>
        </div>
      </div>
    </div>
  );
}
