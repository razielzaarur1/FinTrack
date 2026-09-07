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
  ArrowDownRight
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
import { formatILS } from '@/lib/formatters';
import { useApp } from '@/lib/app-context';

export default function AnalyticsPage() {
  const { lang, t } = useApp();
  const [breakdownType, setBreakdownType] = useState('expense');
  const [breakdown, setBreakdown] = useState({ total: 0, data: [] });
  const [merchants, setMerchants] = useState([]);
  const [daily, setDaily] = useState([]);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAnalytics() {
      setLoading(true);
      try {
        const [catRes, merchRes, dailyRes, trendRes] = await Promise.all([
          api.getCategoryBreakdown(undefined, undefined, breakdownType),
          api.getTopMerchants(undefined, undefined, 8),
          api.getDailySpending(),
          api.getMonthlyTrend(12),
        ]);

        if (catRes.data) setBreakdown(catRes.data);
        if (merchRes.data) setMerchants(merchRes.data.data || []);
        if (dailyRes.data) setDaily(dailyRes.data.data || []);
        if (trendRes.data) setTrend(trendRes.data.data || []);
      } catch (err) {
        console.error('Error fetching analytics:', err);
      } finally {
        setLoading(false);
      }
    }

    loadAnalytics();
  }, [breakdownType]);

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#8b5cf6', '#14b8a6'];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">
          {t('analytics')}
        </h1>
        <p className="text-xs text-dark-text-muted light:text-light-text-muted">
          {lang === 'he' ? 'ניתוח סטטיסטי מעמיק, מגמות חודשיות ומוכרים מובילים' : 'Deep statistics, monthly trajectories, and merchant breakdowns'}
        </p>
      </div>

      {/* 12-Month Grouped Bar Chart: Income vs Expenses */}
      <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-brand-primary" />
            <span>{lang === 'he' ? 'הכנסות והוצאות שנתיות (12 חודשים)' : 'Annual Income & Expenses (12 Months)'}</span>
          </h3>
        </div>

        {trend.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-xs text-dark-text-muted">
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
                    backgroundColor: '#111726',
                    borderColor: '#1e293b',
                    borderRadius: '0.75rem',
                    fontSize: '12px',
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
        <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-base flex items-center gap-2">
              <PieIcon className="w-5 h-5 text-brand-cyan" />
              <span>{t('categoryBreakdown')}</span>
            </h3>

            <div className="flex rounded-lg border border-dark-border light:border-light-border p-0.5 text-xs">
              <button
                onClick={() => setBreakdownType('expense')}
                className={`px-2.5 py-1 rounded-md font-medium ${
                  breakdownType === 'expense' ? 'bg-brand-expense text-white' : 'text-dark-text-muted'
                }`}
              >
                {t('expense')}
              </button>
              <button
                onClick={() => setBreakdownType('income')}
                className={`px-2.5 py-1 rounded-md font-medium ${
                  breakdownType === 'income' ? 'bg-brand-income text-white' : 'text-dark-text-muted'
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
                    >
                      {breakdown.data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val) => formatILS(val)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="flex-1 space-y-2 w-full text-xs">
                {breakdown.data.slice(0, 6).map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color || COLORS[idx % COLORS.length] }} />
                      <span className="font-medium">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-dark-text-muted">{item.percentage}%</span>
                      <span className="font-semibold">{formatILS(item.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Top Merchants Leaderboard */}
        <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4">
          <h3 className="font-semibold text-base flex items-center gap-2">
            <Store className="w-5 h-5 text-brand-amber" />
            <span>{lang === 'he' ? 'בתי עסק מובילים' : 'Top Merchants'}</span>
          </h3>

          {merchants.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-dark-text-muted">
              {t('noData')}
            </div>
          ) : (
            <div className="space-y-3">
              {merchants.map((m, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl border border-dark-border/40 light:border-light-border/40 bg-dark-surface-elevated/40 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-lg bg-brand-primary/10 text-brand-primary font-bold flex items-center justify-center text-[10px]">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{m.merchant}</div>
                      <div className="text-dark-text-muted">{m.count} {lang === 'he' ? 'עסקאות' : 'transactions'} • {m.category || 'כללי'}</div>
                    </div>
                  </div>
                  <div className="font-bold text-sm text-brand-expense">
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
