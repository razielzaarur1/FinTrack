'use client';

import React, { useEffect, useState } from 'react';
import { 
  PieChart as PieIcon, 
  TrendingUp, 
  BarChart3, 
  Store, 
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  Sparkles,
  ShoppingBag,
  Fuel,
  Utensils,
  Shirt,
  Home,
  RefreshCw
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { api } from '@/lib/api';
import { formatILS, formatDate } from '@/lib/formatters';
import { useApp } from '@/lib/app-context';
import CategoryBadge from '@/components/common/CategoryBadge';

const PERIOD_PRESETS = [
  { id: 'current_month', label: 'חודש נוכחי' },
  { id: 'last_month', label: 'חודש שעבר' },
  { id: '3_months', label: '3 חודשים' },
  { id: 'year', label: 'שנה אחרונה' },
];

export default function AnalyticsPage() {
  const { lang, t, theme } = useApp();
  const now = new Date();

  const [period, setPeriod] = useState('current_month');
  const [breakdownType, setBreakdownType] = useState('expense');
  
  // Data States
  const [loading, setLoading] = useState(true);
  const [breakdown, setBreakdown] = useState({ total: 0, data: [] });
  const [merchants, setMerchants] = useState([]);
  const [trend, setTrend] = useState([]);
  const [averages, setAverages] = useState(null);
  const [topExpenses, setTopExpenses] = useState([]);

  // Compute Year/Month parameters for endpoints based on period preset
  const getParamsForPeriod = () => {
    if (period === 'current_month') {
      return { year: now.getFullYear(), month: now.getMonth() + 1, trendMonths: 6 };
    }
    if (period === 'last_month') {
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { year: lastMonthDate.getFullYear(), month: lastMonthDate.getMonth() + 1, trendMonths: 6 };
    }
    if (period === '3_months') {
      return { year: undefined, month: undefined, trendMonths: 3 };
    }
    return { year: undefined, month: undefined, trendMonths: 12 };
  };

  const loadData = async () => {
    setLoading(true);
    const { year, month, trendMonths } = getParamsForPeriod();

    try {
      const [catRes, merchRes, trendRes, avgRes, topExpRes] = await Promise.all([
        api.getCategoryBreakdown({ year, month, type: breakdownType }),
        api.getTopMerchants(year, month, 8),
        api.getMonthlyTrend(trendMonths),
        api.getCategoryAverages(),
        api.getTopExpenses(year, month, 5),
      ]);

      if (catRes.data) setBreakdown(catRes.data);
      if (merchRes.data) setMerchants(merchRes.data.data || []);
      if (trendRes.data) setTrend(trendRes.data.data || []);
      if (avgRes.data) setAverages(avgRes.data.data || null);
      if (topExpRes.data) setTopExpenses(topExpRes.data.data || []);
    } catch (err) {
      console.error('Error fetching analytics data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleFocus = () => loadData();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') loadData();
    };
    const handleTxUpdate = () => loadData();

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('fintrack_tx_updated', handleTxUpdate);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('fintrack_tx_updated', handleTxUpdate);
    };
  }, [period, breakdownType]);

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#8b5cf6', '#14b8a6'];

  const categoryAverageCards = [
    {
      title: 'סופר ומכולת',
      amount: averages?.groceries || 0,
      icon: ShoppingBag,
      color: 'text-pink-500',
      bg: 'bg-pink-500/10',
    },
    {
      title: 'דלק ותחבורה',
      amount: averages?.fuel || 0,
      icon: Fuel,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
    },
    {
      title: 'אוכלים בחוץ',
      amount: averages?.dining || 0,
      icon: Utensils,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
    },
    {
      title: 'בגדים והנעלה',
      amount: averages?.clothes || 0,
      icon: Shirt,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
    },
    {
      title: 'משק בית וחשבונות',
      amount: averages?.household || 0,
      icon: Home,
      color: 'text-indigo-500',
      bg: 'bg-indigo-500/10',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Page Title & Period Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">
            סטטיסטיקות ותובנות
          </h1>
          <p className="text-xs text-dark-text-muted light:text-light-text-muted">
            ממוצעים חודשיים, מגמות תקציב, ניתוח הוצאות ומובילי תשלומים
          </p>
        </div>

        {/* Practical Period Preset Pills */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface p-1 text-xs shadow-sm">
            {PERIOD_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-1.5 rounded-xl font-semibold transition-all ${
                  period === p.id
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text shadow-sm transition-colors"
            title="רענן"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-brand-primary' : ''}`} />
          </button>
        </div>
      </div>

      {/* Monthly Category Averages Cards */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <h2 className="text-sm font-bold flex items-center gap-2 text-dark-text light:text-light-text">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>ממוצעים חודשיים (על פי נתוני 12 החודשים האחרונים)</span>
          </h2>
          <span className="text-[11px] text-dark-text-muted light:text-light-text-muted">מחושב מתוך נתוני ההוצאות בפועל בחשבונותיך</span>
        </div>

        {(() => {
          const avgList = Array.isArray(averages) ? averages : (averages?.data && Array.isArray(averages.data) ? averages.data : []);
          if (avgList.length === 0) {
            return (
              <div className="p-8 text-center rounded-2xl border border-dark-border/60 light:border-light-border/60 bg-dark-surface light:bg-light-surface text-xs text-dark-text-muted light:text-light-text-muted">
                טרם נצברו מספיק עסקאות לחישוב ממוצעים חודשיים. הממוצעים יחושבו אוטומטית ככל שיצטברו תנועות.
              </div>
            );
          }

          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {avgList.slice(0, 5).map((item, idx) => {
                const catName = item.category || item.name || item.title || item.label || 'הוצאה';
                const diff = item.diffPercent || 0;
                const isHigher = diff > 0;
                const hasDiff = (item.currentMonth > 0 || diff !== 0) && item.monthlyAverage > 0;

                return (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface shadow-xs space-y-2 hover:border-brand-primary/40 transition-colors flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <CategoryBadge category={catName} size={22} />
                      {hasDiff && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                          isHigher 
                            ? 'bg-rose-500/15 text-rose-400' 
                            : 'bg-emerald-500/15 text-emerald-400'
                        }`}>
                          {isHigher ? `+${diff}%` : `${diff}%`}
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-dark-text light:text-light-text truncate">
                        {catName}
                      </div>
                      <div className="text-base sm:text-lg font-bold text-dark-text light:text-light-text font-mono mt-0.5" dir="ltr">
                        {formatILS(item.monthlyAverage || item.amount || 0)}
                      </div>
                      <div className="text-[10px] text-dark-text-muted light:text-light-text-muted mt-0.5">
                        החודש: <span className="font-mono font-semibold text-dark-text light:text-light-text">{formatILS(item.currentMonth || 0)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* 5 Largest Single Expenses in Selected Period */}
      <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base flex items-center gap-2 text-dark-text light:text-light-text">
            <Receipt className="w-5 h-5 text-rose-500" />
            <span>5 ההוצאות הגדולות ביותר בתקופה</span>
          </h3>
          <span className="text-xs text-dark-text-muted light:text-light-text-muted font-medium">עסקאות בודדות בולטות</span>
        </div>

        {topExpenses.length === 0 ? (
          <div className="py-6 text-center text-xs text-dark-text-muted light:text-light-text-muted">
            לא נמצאו עסקאות בתקופה זו
          </div>
        ) : (
          <div className="divide-y divide-dark-border/40 light:divide-light-border/40">
            {topExpenses.map((exp, idx) => (
              <div key={exp.id || idx} className="py-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-6 h-6 rounded-lg bg-rose-500/10 text-rose-500 font-bold flex items-center justify-center text-[10px] shrink-0">
                    {idx + 1}
                  </div>
                  <CategoryBadge category={exp.category} size={20} />
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-dark-text light:text-light-text truncate">
                      {exp.userDescription || exp.merchantName || exp.description || 'ללא שם'}
                    </div>
                    <div className="text-[11px] text-dark-text-muted light:text-light-text-muted flex items-center gap-1.5 mt-0.5">
                      <span>{formatDate(exp.date, lang)}</span>
                      <span>•</span>
                      <span className="font-mono">{exp.accountDisplayName || exp.bankCompany}</span>
                      <span>•</span>
                      <span className="px-1.5 py-0.2 rounded bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text-muted light:text-light-text-muted text-[10px]">{exp.category || 'ללא סיווג'}</span>
                    </div>
                  </div>
                </div>

                <div className="font-bold text-sm sm:text-base text-rose-500 font-mono shrink-0 pr-3" dir="ltr">
                  {formatILS(exp.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Multi-Month Trend Chart */}
      <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base flex items-center gap-2 text-dark-text light:text-light-text">
            <BarChart3 className="w-5 h-5 text-brand-primary" />
            <span>הכנסות מול הוצאות לאורך זמן</span>
          </h3>
        </div>

        {trend.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-xs text-dark-text-muted light:text-light-text-muted">
            {t('noData')}
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar dataKey="income" name={t('income')} fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name={t('expense')} fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Categories Breakdown & Top Merchants */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown Donut */}
        <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-base flex items-center gap-2 text-dark-text light:text-light-text">
              <PieIcon className="w-5 h-5 text-brand-cyan" />
              <span>{t('categoryBreakdown')}</span>
            </h3>

            <div className="flex rounded-lg border border-dark-border light:border-light-border p-0.5 text-xs bg-dark-surface-elevated light:bg-light-surface-elevated">
              <button
                onClick={() => setBreakdownType('expense')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  breakdownType === 'expense' ? 'bg-brand-expense text-white' : 'text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
                }`}
              >
                {t('expense')}
              </button>
              <button
                onClick={() => setBreakdownType('income')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  breakdownType === 'income' ? 'bg-brand-income text-white' : 'text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
                }`}
              >
                {t('income')}
              </button>
            </div>
          </div>

          {breakdown.data.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-dark-text-muted light:text-light-text-muted">
              {t('noData')}
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="h-56 w-56 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={breakdown.data}
                      dataKey="amount"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {breakdown.data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
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
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="flex-1 space-y-2 w-full text-xs">
                {breakdown.data.slice(0, 6).map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color || COLORS[idx % COLORS.length] }} />
                      <span className="font-medium text-dark-text light:text-light-text">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-dark-text-muted light:text-light-text-muted">{item.percentage}%</span>
                      <span className="font-semibold text-dark-text light:text-light-text font-mono">{formatILS(item.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Top Merchants Leaderboard */}
        <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4 shadow-sm">
          <h3 className="font-semibold text-base flex items-center gap-2 text-dark-text light:text-light-text">
            <Store className="w-5 h-5 text-brand-amber" />
            <span>בתי עסק מובילים</span>
          </h3>

          {merchants.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-dark-text-muted light:text-light-text-muted">
              {t('noData')}
            </div>
          ) : (
            <div className="space-y-3">
              {merchants.map((m, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl border border-dark-border/40 light:border-light-border/40 bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-lg bg-brand-primary/10 text-brand-primary font-bold flex items-center justify-center text-[10px]">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-dark-text light:text-light-text">{m.merchant}</div>
                      <div className="text-dark-text-muted light:text-light-text-muted">{m.count} עסקאות • {m.category || 'כללי'}</div>
                    </div>
                  </div>
                  <div className="font-bold text-sm text-brand-expense font-mono" dir="ltr">
                    {formatILS(m.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
