'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { 
  PieChart as PieIcon, 
  TrendingUp, 
  TrendingDown,
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
  RefreshCw,
  Scale,
  Settings as SettingsIcon,
  Flame,
  Award,
  ChevronLeft,
  Filter,
  Eye,
  SlidersHorizontal,
  ChevronDown
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
  Cell,
  CartesianGrid,
  ReferenceLine 
} from 'recharts';
import { api } from '@/lib/api';
import { formatILS, formatDate } from '@/lib/formatters';
import { useApp } from '@/lib/app-context';
import { getFinancialMonthRange } from '@/lib/date-utils';
import CategoryBadge from '@/components/common/CategoryBadge';
import CategoryAverageModal from '@/components/analytics/CategoryAverageModal';
import MonthlyBalanceModal from '@/components/analytics/MonthlyBalanceModal';
import MerchantDrillDownModal from '@/components/analytics/MerchantDrillDownModal';
import ConfigureAveragesModal from '@/components/analytics/ConfigureAveragesModal';
import DeepStatsCards from '@/components/analytics/DeepStatsCards';
import AiWidgetStudio from '@/components/analytics/AiWidgetStudio';
import TransactionDrawer from '@/components/transactions/TransactionDrawer';

const PERIOD_PRESETS = [
  { id: 'current_month', label: 'חודש נוכחי' },
  { id: 'last_month', label: 'חודש שעבר' },
  { id: '3_months', label: '3 חודשים' },
  { id: 'year', label: 'שנה אחרונה' },
];

const TREND_RANGE_OPTIONS = [
  { id: 3, label: '3 חודשים' },
  { id: 6, label: '6 חודשים' },
  { id: 12, label: 'שנה (12 ח׳)' },
  { id: 24, label: 'שנתיים (24 ח׳)' },
  { id: 36, label: '3 שנים' },
  { id: 60, label: 'כל הזמן' },
];

export default function AnalyticsPage() {
  const { lang, t, theme, monthStartDay, currentFinancialMonth, previousFinancialMonth } = useApp();

  const [period, setPeriod] = useState('current_month');
  const [breakdownType, setBreakdownType] = useState('expense');
  
  // Data States
  const [loading, setLoading] = useState(true);
  const [breakdown, setBreakdown] = useState({ total: 0, data: [] });
  const [merchants, setMerchants] = useState([]);
  const [trend, setTrend] = useState([]);
  const [averages, setAverages] = useState(null);
  const [topExpenses, setTopExpenses] = useState([]);
  const [balanceSummary, setBalanceSummary] = useState(null);
  const [deepStats, setDeepStats] = useState(null);

  // Settings states
  const [trendRangeMonths, setTrendRangeMonths] = useState(12);
  const [averagesLookbackMonths, setAveragesLookbackMonths] = useState(12);
  const [widgetOrder, setWidgetOrder] = useState([
    'kpi_balance',
    'trend_chart',
    'category_averages',
    'deep_stats',
    'category_breakdown',
    'top_merchants',
    'top_expenses',
    'ai_studio'
  ]);
  const [widgetVisibility, setWidgetVisibility] = useState({
    kpi_balance: true,
    trend_chart: true,
    category_averages: true,
    deep_stats: true,
    category_breakdown: true,
    top_merchants: true,
    top_expenses: true,
    ai_studio: true,
  });
  const [customAiWidgets, setCustomAiWidgets] = useState([]);

  // Modals & Drawers
  const [selectedAvgCat, setSelectedAvgCat] = useState(null);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [selectedMerchant, setSelectedMerchant] = useState(null);
  const [showConfigureAvgModal, setShowConfigureAvgModal] = useState(false);
  const [selectedExpenseTx, setSelectedExpenseTx] = useState(null);

  // Compute exact Date parameters for endpoints based on period preset & financial billing cycle
  const activePeriodRange = useMemo(() => {
    if (period === 'current_month' && currentFinancialMonth) {
      return {
        startDate: currentFinancialMonth.startDate,
        endDate: currentFinancialMonth.endDate,
        label: currentFinancialMonth.label,
        displayRange: currentFinancialMonth.displayRange,
      };
    }
    if (period === 'last_month' && previousFinancialMonth) {
      return {
        startDate: previousFinancialMonth.startDate,
        endDate: previousFinancialMonth.endDate,
        label: previousFinancialMonth.label,
        displayRange: previousFinancialMonth.displayRange,
      };
    }
    if (period === '3_months' && currentFinancialMonth) {
      let m = currentFinancialMonth.month - 2;
      let y = currentFinancialMonth.year;
      if (m < 1) {
        m += 12;
        y -= 1;
      }
      const range3m = getFinancialMonthRange(y, m, monthStartDay);
      return {
        startDate: range3m.startDate,
        endDate: currentFinancialMonth.endDate,
        label: `3 מחזורים אחרונים`,
        displayRange: `${range3m.startDate.slice(5).replace('-', '/')} – ${currentFinancialMonth.endDate.slice(5).replace('-', '/')}`,
      };
    }
    // Default: 12 months (year)
    if (currentFinancialMonth) {
      let m = currentFinancialMonth.month - 11;
      let y = currentFinancialMonth.year;
      if (m < 1) {
        m += 12;
        y -= 1;
      }
      const range12m = getFinancialMonthRange(y, m, monthStartDay);
      return {
        startDate: range12m.startDate,
        endDate: currentFinancialMonth.endDate,
        label: `שנה אחרונה`,
        displayRange: `${range12m.startDate.slice(5).replace('-', '/')} – ${currentFinancialMonth.endDate.slice(5).replace('-', '/')}`,
      };
    }
    return {};
  }, [period, currentFinancialMonth, previousFinancialMonth, monthStartDay]);

  // Load Settings
  const loadSettings = async () => {
    try {
      const res = await api.getSystemSettings();
      if (res.data?.settings) {
        const s = res.data.settings;
        if (s.analyticsTrendRangeMonths) {
          setTrendRangeMonths(parseInt(s.analyticsTrendRangeMonths, 10));
        }
        if (s.analyticsAveragesLookbackMonths) {
          setAveragesLookbackMonths(parseInt(s.analyticsAveragesLookbackMonths, 10));
        }
        if (Array.isArray(s.analyticsWidgetOrder) && s.analyticsWidgetOrder.length > 0) {
          setWidgetOrder(s.analyticsWidgetOrder);
        }
        if (s.analyticsWidgetVisibility) {
          setWidgetVisibility(prev => ({ ...prev, ...s.analyticsWidgetVisibility }));
        }
        if (Array.isArray(s.customAiWidgets)) {
          setCustomAiWidgets(s.customAiWidgets);
        }
      }
    } catch (e) {
      console.warn('Failed to load analytics user settings:', e);
    }
  };

  const loadData = async () => {
    setLoading(true);
    const { startDate, endDate } = activePeriodRange;

    try {
      const [catRes, merchRes, trendRes, avgRes, topExpRes, balRes, deepRes] = await Promise.all([
        api.getCategoryBreakdown({ startDate, endDate, type: breakdownType, startDay: monthStartDay }),
        api.getTopMerchants({ startDate, endDate, limit: 8, startDay: monthStartDay }),
        api.getMonthlyTrend(trendRangeMonths, undefined, monthStartDay),
        api.getCategoryAverages({ startDay: monthStartDay, months: averagesLookbackMonths }),
        api.getTopExpenses({ startDate, endDate, limit: 5, startDay: monthStartDay }),
        api.getHistoricalBalanceSummary({ months: averagesLookbackMonths, startDay: monthStartDay }),
        api.getDeepStats({ startDate, endDate, startDay: monthStartDay }),
      ]);

      if (catRes.data) setBreakdown(catRes.data);
      if (merchRes.data) setMerchants(merchRes.data.data || []);
      if (trendRes.data) setTrend(trendRes.data.data || []);
      if (avgRes.data) setAverages(avgRes.data.data || null);
      if (topExpRes.data) setTopExpenses(topExpRes.data.data || []);
      if (balRes.data) setBalanceSummary(balRes.data);
      if (deepRes.data) setDeepStats(deepRes.data);
    } catch (err) {
      console.error('Error fetching analytics data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    loadData();

    const handleFocus = () => loadData();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') loadData();
    };
    const handleTxUpdate = () => loadData();
    const handleSettingsUpdate = () => {
      loadSettings();
      loadData();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('fintrack_tx_updated', handleTxUpdate);
    window.addEventListener('fintrack_settings_updated', handleSettingsUpdate);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('fintrack_tx_updated', handleTxUpdate);
      window.removeEventListener('fintrack_settings_updated', handleSettingsUpdate);
    };
  }, [
    period, 
    breakdownType, 
    monthStartDay, 
    trendRangeMonths, 
    averagesLookbackMonths, 
    activePeriodRange.startDate, 
    activePeriodRange.endDate
  ]);

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#8b5cf6', '#14b8a6'];

  // Widget Renderers
  const renderKpiBalanceCard = () => {
    const summary = balanceSummary?.summary || {};
    const hasBalance = summary.totalIncome !== undefined || summary.totalExpenses !== undefined;
    const isSurplus = (summary.monthlyAverageBalance || 0) >= 0;

    return (
      <div
        onClick={() => setShowBalanceModal(true)}
        className="p-5 sm:p-6 rounded-3xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface shadow-xs hover:border-brand-primary hover:shadow-lg transition-all cursor-pointer group space-y-4"
        title="לחץ לפתיחת ניתוח מאזן חודשי מלא עם גרפים ודירוג חודשים"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-dark-border/40 light:border-light-border/40 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-dark-text light:text-light-text group-hover:text-brand-primary transition-colors">
                  ממוצעים חודשיים ומאזן תקציבי
                </h2>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-brand-primary/15 text-brand-primary font-bold">
                  {averagesLookbackMonths} חודשים
                </span>
              </div>
              <p className="text-xs text-dark-text-muted light:text-light-text-muted mt-0.5">
                ממוצע הכנסות מול הוצאות לחודש, מאזן כולל מצטבר ושיעור חיסכון
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-brand-primary group-hover:translate-x-[-4px] transition-transform self-end sm:self-auto">
            <span>צפה בגרף חודשי עודף מול גירעון</span>
            <span>←</span>
          </div>
        </div>

        {/* 4 Large KPI Figures */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Monthly Avg Income */}
          <div className="p-3.5 rounded-2xl border border-dark-border/60 bg-dark-surface-elevated/40 space-y-1">
            <div className="flex items-center justify-between text-dark-text-muted">
              <span>ממוצע הכנסות חודשי</span>
              <ArrowDownRight className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-lg sm:text-2xl font-bold text-emerald-500 font-mono" dir="ltr">
              {formatILS(summary.monthlyAverageIncome || 0)}
            </div>
            <div className="text-[10px] text-dark-text-muted">
              סה״כ הכנסות: {formatILS(summary.totalIncome || 0)}
            </div>
          </div>

          {/* Monthly Avg Expenses */}
          <div className="p-3.5 rounded-2xl border border-dark-border/60 bg-dark-surface-elevated/40 space-y-1">
            <div className="flex items-center justify-between text-dark-text-muted">
              <span>ממוצע הוצאות חודשי</span>
              <ArrowUpRight className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-lg sm:text-2xl font-bold text-rose-500 font-mono" dir="ltr">
              {formatILS(summary.monthlyAverageExpenses || 0)}
            </div>
            <div className="text-[10px] text-dark-text-muted">
              סה״כ הוצאות: {formatILS(summary.totalExpenses || 0)}
            </div>
          </div>

          {/* Monthly Avg Balance */}
          <div className="p-3.5 rounded-2xl border border-dark-border/60 bg-dark-surface-elevated/40 space-y-1">
            <div className="flex items-center justify-between text-dark-text-muted">
              <span>מאזן חודשי ממוצע</span>
              {isSurplus ? (
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              ) : (
                <TrendingDown className="w-4 h-4 text-rose-400" />
              )}
            </div>
            <div className={`text-lg sm:text-2xl font-bold font-mono ${isSurplus ? 'text-emerald-400' : 'text-rose-400'}`} dir="ltr">
              {formatILS(summary.monthlyAverageBalance || 0, { showSign: true })}
            </div>
            <div className="text-[10px] text-dark-text-muted">
              שיעור חיסכון: <span className="font-bold text-dark-text">{summary.overallSavingsRate || 0}%</span>
            </div>
          </div>

          {/* Total Cumulative Balance */}
          <div className="p-3.5 rounded-2xl border border-dark-border/60 bg-dark-surface-elevated/40 space-y-1">
            <div className="flex items-center justify-between text-dark-text-muted">
              <span>מאזן כולל מצטבר</span>
              <Scale className="w-4 h-4 text-brand-primary" />
            </div>
            <div className={`text-lg sm:text-2xl font-bold font-mono ${(summary.totalBalance || 0) >= 0 ? 'text-brand-primary' : 'text-rose-400'}`} dir="ltr">
              {formatILS(summary.totalBalance || 0, { showSign: true })}
            </div>
            <div className="text-[10px] text-dark-text-muted">
              תזרים נקי ב-{averagesLookbackMonths} החודשים
            </div>
          </div>
        </div>

        {/* Highlights banner */}
        {summary.bestMonth && (
          <div className="flex items-center justify-between flex-wrap gap-2 px-3.5 py-2 rounded-xl bg-dark-surface-elevated/60 text-[11px] text-dark-text-muted">
            <div className="flex items-center gap-2">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span>החודש החסכוני ביותר:</span>
              <span className="font-bold text-emerald-400">{summary.bestMonth.label} (+{formatILS(summary.bestMonth.balance)})</span>
            </div>
            {summary.highestExpenseMonth && (
              <div className="flex items-center gap-2">
                <span>חודש ההוצאות הגבוהות ביותר:</span>
                <span className="font-bold text-rose-400">{summary.highestExpenseMonth.label} ({formatILS(summary.highestExpenseMonth.expenses)})</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderTrendChart = () => (
    <div className="p-5 sm:p-6 rounded-3xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-base sm:text-lg flex items-center gap-2 text-dark-text light:text-light-text">
            <BarChart3 className="w-5 h-5 text-brand-primary" />
            <span>הכנסות מול הוצאות לאורך זמן</span>
          </h3>
          <p className="text-xs text-dark-text-muted light:text-light-text-muted mt-0.5">
            השוואת מחזורי הכנסה מול הוצאה בעמודות חודשיות
          </p>
        </div>

        {/* Range Selector Pills directly on the Chart Header */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface p-1 text-xs shadow-2xs overflow-x-auto no-scrollbar">
            {TREND_RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTrendRangeMonths(opt.id)}
                className={`px-2.5 py-1 rounded-xl font-semibold whitespace-nowrap transition-all ${
                  trendRangeMonths === opt.id
                    ? 'bg-brand-primary text-white shadow-xs'
                    : 'text-dark-text-muted light:text-light-text-muted hover:text-dark-text'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <Link
            href="/settings?tab=analytics"
            className="p-2 rounded-xl border border-dark-border light:border-light-border text-dark-text-muted hover:text-brand-primary transition-colors"
            title="שנה ברירת מחדל בהגדרות"
          >
            <SettingsIcon className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {trend.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-xs text-dark-text-muted light:text-light-text-muted">
          {t('noData')}
        </div>
      ) : (
        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme === 'light' ? '#e2e8f0' : '#1e293b'} vertical={false} />
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
  );

  const renderCategoryAverages = () => {
    const DEFAULT_FALLBACK_AVERAGES = [
      { key: 'dining', category: 'אוכל בחוץ', name: 'אוכל בחוץ', monthlyAverage: 0, currentMonth: 0, totalHistorical: 0, transactions: [], distribution: [] },
      { key: 'groceries', category: 'סופר ומכולת', name: 'סופר ומכולת', monthlyAverage: 0, currentMonth: 0, totalHistorical: 0, transactions: [], distribution: [] },
      { key: 'fuel', category: 'דלק ותחבורה', name: 'דלק ותחבורה', monthlyAverage: 0, currentMonth: 0, totalHistorical: 0, transactions: [], distribution: [] },
      { key: 'shopping', category: 'קניות וביגוד', name: 'קניות וביגוד', monthlyAverage: 0, currentMonth: 0, totalHistorical: 0, transactions: [], distribution: [] },
      { key: 'bills', category: 'משק בית וחשבונות', name: 'משק בית וחשבונות', monthlyAverage: 0, currentMonth: 0, totalHistorical: 0, transactions: [], distribution: [] },
      { key: 'pharmacy', category: 'בריאות ופארם', name: 'בריאות ופארם', monthlyAverage: 0, currentMonth: 0, totalHistorical: 0, transactions: [], distribution: [] },
      { key: 'leisure', category: 'פנאי ובילויים', name: 'פנאי ובילויים', monthlyAverage: 0, currentMonth: 0, totalHistorical: 0, transactions: [], distribution: [] },
    ];

    const avgList = (Array.isArray(averages) && averages.length > 0)
      ? averages
      : (averages?.data && Array.isArray(averages.data) && averages.data.length > 0)
      ? averages.data
      : DEFAULT_FALLBACK_AVERAGES;

    return (
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold flex items-center gap-2 text-dark-text light:text-light-text">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>ממוצעים חודשיים (על פי נתוני {averagesLookbackMonths} החודשים האחרונים)</span>
            </h2>

            <button
              type="button"
              onClick={() => setShowConfigureAvgModal(true)}
              className="text-xs text-brand-primary hover:underline flex items-center gap-1 font-semibold mr-2"
              title="בחר אילו קטגוריות להציג בממוצעים"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>הגדר ממוצעים</span>
            </button>
          </div>

          <span className="text-[11px] text-dark-text-muted light:text-light-text-muted">
            לחץ על כרטיס לצפייה בעקומת ההתפלגות ורשימת העסקאות המלאה
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {avgList.map((item, idx) => {
            const catName = item.category || item.name || item.title || item.label || 'הוצאה';
            const diff = item.diffPercent || 0;
            const isHigher = diff > 0;
            const hasDiff = (item.currentMonth > 0 || diff !== 0) && item.monthlyAverage > 0;

            return (
              <div
                key={idx}
                onClick={() => setSelectedAvgCat(item)}
                className="p-3.5 sm:p-4 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface shadow-xs space-y-2 hover:border-brand-primary hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col justify-between cursor-pointer group"
                title="לחץ לצפייה בגרף התפלגות ורשימת תנועות"
              >
                <div className="flex items-center justify-between">
                  <CategoryBadge category={catName} size={20} />
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
                  <div className="text-xs font-bold text-dark-text light:text-light-text truncate group-hover:text-brand-primary transition-colors">
                    {catName}
                  </div>
                  <div className="text-base sm:text-lg font-bold text-dark-text light:text-light-text font-mono mt-0.5" dir="ltr">
                    {formatILS(item.monthlyAverage || item.amount || 0)}
                  </div>
                  <div className="text-[10px] text-dark-text-muted light:text-light-text-muted mt-0.5 flex items-center justify-between">
                    <span>החודש: <span className="font-mono font-semibold text-dark-text light:text-light-text">{formatILS(item.currentMonth || 0)}</span></span>
                    <span className="text-brand-primary opacity-0 group-hover:opacity-100 transition-opacity font-bold">←</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderTopExpenses = () => (
    <div className="p-5 sm:p-6 rounded-3xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4 shadow-xs">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base flex items-center gap-2 text-dark-text light:text-light-text">
          <Receipt className="w-5 h-5 text-rose-500" />
          <span>5 ההוצאות הגדולות ביותר בתקופה</span>
        </h3>
        <span className="text-xs text-dark-text-muted light:text-light-text-muted font-medium">עסקאות בודדות בולטות (לחץ לעריכה)</span>
      </div>

      {topExpenses.length === 0 ? (
        <div className="py-6 text-center text-xs text-dark-text-muted light:text-light-text-muted">
          לא נמצאו עסקאות בתקופה זו
        </div>
      ) : (
        <div className="divide-y divide-dark-border/40 light:divide-light-border/40">
          {topExpenses.map((exp, idx) => (
            <div 
              key={exp.id || idx} 
              onClick={() => setSelectedExpenseTx(exp)}
              className="py-3 flex items-center justify-between text-xs hover:bg-dark-surface-elevated/40 light:hover:bg-light-surface-elevated/40 px-2 rounded-xl cursor-pointer transition-all group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-6 h-6 rounded-lg bg-rose-500/10 text-rose-500 font-bold flex items-center justify-center text-[10px] shrink-0">
                  {idx + 1}
                </div>
                <CategoryBadge category={exp.category} size={20} />
                <div className="min-w-0">
                  <div className="font-bold text-sm text-dark-text light:text-light-text truncate group-hover:text-brand-primary transition-colors">
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

              <div className="flex items-center gap-2">
                <div className="font-bold text-sm sm:text-base text-rose-500 font-mono shrink-0 pr-3" dir="ltr">
                  {formatILS(exp.amount)}
                </div>
                <ChevronLeft className="w-4 h-4 text-dark-text-muted group-hover:text-brand-primary transition-all rtl:rotate-0" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderCategoryBreakdown = () => (
    <div className="p-5 sm:p-6 rounded-3xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4 shadow-xs">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base flex items-center gap-2 text-dark-text light:text-light-text">
          <PieIcon className="w-5 h-5 text-brand-cyan" />
          <span>{t('categoryBreakdown')}</span>
        </h3>

        <div className="flex rounded-lg border border-dark-border light:border-light-border p-0.5 text-xs bg-dark-surface-elevated light:bg-light-surface-elevated">
          <button
            onClick={() => setBreakdownType('expense')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              breakdownType === 'expense' ? 'bg-brand-expense text-white' : 'text-dark-text-muted hover:text-dark-text'
            }`}
          >
            {t('expense')}
          </button>
          <button
            onClick={() => setBreakdownType('income')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              breakdownType === 'income' ? 'bg-brand-income text-white' : 'text-dark-text-muted hover:text-dark-text'
            }`}
          >
            {t('income')}
          </button>
        </div>
      </div>

      {breakdown.data.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-xs text-dark-text-muted">
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
                  onClick={(data) => {
                    if (data?.name) {
                      setSelectedAvgCat({ name: data.name, category: data.name });
                    }
                  }}
                  className="cursor-pointer"
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
                  }}
                  formatter={(val) => formatILS(val)}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="flex-1 space-y-2 w-full text-xs">
            {breakdown.data.slice(0, 6).map((item, idx) => (
              <div 
                key={idx} 
                onClick={() => setSelectedAvgCat({ name: item.name, category: item.name })}
                className="flex items-center justify-between p-1.5 rounded-lg hover:bg-dark-surface-elevated/40 cursor-pointer transition-colors"
                title="לחץ לצפייה בעסקאות קטגוריה זו"
              >
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
  );

  const renderTopMerchants = () => (
    <div className="p-5 sm:p-6 rounded-3xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4 shadow-xs">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base flex items-center gap-2 text-dark-text light:text-light-text">
          <Store className="w-5 h-5 text-brand-amber" />
          <span>בתי עסק מובילים</span>
        </h3>
        <span className="text-[11px] text-dark-text-muted">לחץ לניתוח מעמיק בבית העסק</span>
      </div>

      {merchants.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-xs text-dark-text-muted">
          {t('noData')}
        </div>
      ) : (
        <div className="space-y-2.5">
          {merchants.map((m, idx) => (
            <div 
              key={idx} 
              onClick={() => setSelectedMerchant(m)}
              className="flex items-center justify-between p-2.5 rounded-2xl border border-dark-border/40 light:border-light-border/40 bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 hover:border-brand-primary hover:bg-dark-surface-elevated transition-all cursor-pointer group text-xs"
              title="לחץ לצפייה בכל העסקאות והמגמה של בית עסק זה"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-lg bg-brand-primary/10 text-brand-primary font-bold flex items-center justify-center text-[10px]">
                  {idx + 1}
                </div>
                <div>
                  <div className="font-semibold text-sm text-dark-text light:text-light-text group-hover:text-brand-primary transition-colors">
                    {m.merchant}
                  </div>
                  <div className="text-dark-text-muted light:text-light-text-muted">
                    {m.count} עסקאות • {m.category || 'כללי'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="font-bold text-sm text-brand-expense font-mono" dir="ltr">
                  {formatILS(m.amount)}
                </div>
                <ChevronLeft className="w-4 h-4 text-dark-text-muted group-hover:text-brand-primary transition-all rtl:rotate-0" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      
      {/* Top Header & Range Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">
            סטטיסטיקות ותובנות
          </h1>
          <p className="text-xs text-dark-text-muted light:text-light-text-muted">
            ממוצעים חודשיים, מאזן תקציבי, ניתוח הוצאות מעמיק ומחולל AI אינטראקטיבי
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Preset Period Pills */}
          <div className="flex rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface p-1 text-xs shadow-sm">
            {PERIOD_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-1.5 rounded-xl font-semibold transition-all ${
                  period === p.id
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'text-dark-text-muted hover:text-dark-text'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <Link
            href="/settings?tab=analytics"
            className="p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text-muted hover:text-brand-primary shadow-sm transition-colors flex items-center gap-1.5 text-xs font-semibold"
            title="הגדרות סטטיסטיקה"
          >
            <SettingsIcon className="w-4 h-4" />
            <span className="hidden sm:inline">הגדרות</span>
          </Link>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text-muted hover:text-dark-text shadow-sm transition-colors"
            title="רענן"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-brand-primary' : ''}`} />
          </button>
        </div>
      </div>

      {/* Active Financial Cycle Info Banner */}
      {activePeriodRange?.startDate && activePeriodRange?.endDate && (
        <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-2.5 rounded-2xl bg-brand-primary/5 border border-brand-primary/15 text-xs">
          <div className="flex items-center gap-2 text-dark-text light:text-light-text">
            <Calendar className="w-4 h-4 text-brand-primary" />
            <span className="font-semibold text-brand-primary">טווח חישוב נבחר:</span>
            <span className="font-bold">{activePeriodRange.label || activePeriodRange.displayRange}</span>
            <span className="text-dark-text-muted text-[11px]">
              ({activePeriodRange.startDate} עד {activePeriodRange.endDate})
            </span>
          </div>
          <div className="text-[11px] text-dark-text-muted">
            מחזור חודשי מוגדר מה-{monthStartDay} לחודש
          </div>
        </div>
      )}

      {/* Dynamic Widget Sections Rendered in User-Configured Order */}
      <div className="space-y-8">
        {widgetOrder.map((widgetId) => {
          if (widgetVisibility[widgetId] === false) return null;

          switch (widgetId) {
            case 'kpi_balance':
              return <React.Fragment key={widgetId}>{renderKpiBalanceCard()}</React.Fragment>;

            case 'trend_chart':
              return <React.Fragment key={widgetId}>{renderTrendChart()}</React.Fragment>;

            case 'category_averages':
              return <React.Fragment key={widgetId}>{renderCategoryAverages()}</React.Fragment>;

            case 'deep_stats':
              return (
                <React.Fragment key={widgetId}>
                  <DeepStatsCards 
                    deepStats={deepStats}
                    onCategoryClick={(cat) => setSelectedAvgCat({ name: cat, category: cat })}
                  />
                </React.Fragment>
              );

            case 'category_breakdown':
              // Render as 2-column with Top Merchants if both visible, or single
              if (widgetVisibility.top_merchants === false) {
                return <React.Fragment key={widgetId}>{renderCategoryBreakdown()}</React.Fragment>;
              }
              return (
                <div key={widgetId} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {renderCategoryBreakdown()}
                  {renderTopMerchants()}
                </div>
              );

            case 'top_merchants':
              // If already rendered inside the 2-column grid above, skip
              if (widgetOrder.includes('category_breakdown') && widgetVisibility.category_breakdown !== false) {
                return null;
              }
              return <React.Fragment key={widgetId}>{renderTopMerchants()}</React.Fragment>;

            case 'top_expenses':
              return <React.Fragment key={widgetId}>{renderTopExpenses()}</React.Fragment>;

            case 'ai_studio':
              return (
                <React.Fragment key={widgetId}>
                  <AiWidgetStudio 
                    pinnedWidgets={customAiWidgets}
                    onPinnedWidgetsUpdated={(updated) => setCustomAiWidgets(updated)}
                  />
                </React.Fragment>
              );

            default:
              return null;
          }
        })}
      </div>

      {/* Modals & Drawers */}

      {/* 1. Category Average & Distribution Drill-down Modal */}
      {selectedAvgCat && (
        <CategoryAverageModal
          categoryItem={selectedAvgCat}
          onClose={() => setSelectedAvgCat(null)}
          onTransactionUpdated={loadData}
        />
      )}

      {/* 2. Executive Monthly Balance Modal */}
      {showBalanceModal && (
        <MonthlyBalanceModal
          initialLookbackMonths={averagesLookbackMonths}
          onClose={() => setShowBalanceModal(false)}
        />
      )}

      {/* 3. Merchant Drill-Down Modal */}
      {selectedMerchant && (
        <MerchantDrillDownModal
          merchantItem={selectedMerchant}
          onClose={() => setSelectedMerchant(null)}
          onTransactionUpdated={loadData}
        />
      )}

      {/* 4. Configure Averages Modal */}
      {showConfigureAvgModal && (
        <ConfigureAveragesModal
          currentLookbackMonths={averagesLookbackMonths}
          onClose={() => setShowConfigureAvgModal(false)}
          onSaved={() => {
            loadSettings();
            loadData();
          }}
        />
      )}

      {/* 5. Transaction Drawer */}
      {selectedExpenseTx && (
        <TransactionDrawer
          tx={selectedExpenseTx}
          onClose={() => setSelectedExpenseTx(null)}
          onUpdate={() => {
            setSelectedExpenseTx(null);
            loadData();
          }}
        />
      )}

    </div>
  );
}
