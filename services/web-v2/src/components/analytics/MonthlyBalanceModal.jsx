'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  ArrowDownRight, 
  Calendar, 
  Scale, 
  Award, 
  AlertCircle,
  BarChart3,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ReferenceLine,
  Cell,
  CartesianGrid,
  Legend
} from 'recharts';
import { api } from '@/lib/api';
import { formatILS } from '@/lib/formatters';
import { useApp } from '@/lib/app-context';

export default function MonthlyBalanceModal({ initialLookbackMonths = 12, onClose }) {
  const { lang, theme, monthStartDay } = useApp();
  const [lookbackMonths, setLookbackMonths] = useState(initialLookbackMonths);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [activeChartTab, setActiveChartTab] = useState('balance'); // 'balance' | 'comparison'

  const fetchSummary = async (months) => {
    setLoading(true);
    try {
      const res = await api.getHistoricalBalanceSummary({ months, startDay: monthStartDay });
      if (res.data) {
        setData(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch historical balance summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary(lookbackMonths);
  }, [lookbackMonths, monthStartDay]);

  const summary = data?.summary || {};
  const months = data?.months || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="w-full max-w-5xl max-h-[92vh] bg-dark-surface light:bg-light-surface border border-dark-border light:border-light-border rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-dark-border light:border-light-border flex items-center justify-between bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0">
              <Scale className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-dark-text light:text-light-text truncate">
                  ניתוח מאזן וממוצע הכנסות מול הוצאות
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-primary/15 text-brand-primary font-bold">
                  {lookbackMonths} חודשים
                </span>
              </div>
              <p className="text-xs text-dark-text-muted light:text-light-text-muted mt-0.5">
                בדיקת חודשי עודף מול גירעון, שיעורי חיסכון ומגמות תזרים מצטבר
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Range Presets Selector */}
            <div className="hidden sm:flex rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface p-1 text-xs">
              {[
                { id: 6, label: '6 חודשים' },
                { id: 12, label: 'שנה' },
                { id: 24, label: 'שנתיים' },
                { id: 36, label: '3 שנים' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setLookbackMonths(p.id)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    lookbackMonths === p.id
                      ? 'bg-brand-primary text-white shadow-xs'
                      : 'text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-6">
          
          {/* Mobile Range Selector */}
          <div className="flex sm:hidden rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface p-1 text-xs justify-between">
            {[
              { id: 6, label: '6 חודשים' },
              { id: 12, label: 'שנה' },
              { id: 24, label: 'שנתיים' },
              { id: 36, label: '3 שנים' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setLookbackMonths(p.id)}
                className={`px-2.5 py-1 rounded-lg font-semibold flex-1 transition-all text-center ${
                  lookbackMonths === p.id
                    ? 'bg-brand-primary text-white shadow-xs'
                    : 'text-dark-text-muted light:text-light-text-muted'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* 4 Summary KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Monthly Avg Income */}
            <div className="p-4 rounded-2xl border border-dark-border/80 light:border-light-border/80 bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
                <span>ממוצע הכנסות לחודש</span>
                <ArrowDownRight className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-lg sm:text-2xl font-bold text-emerald-500 font-mono" dir="ltr">
                {formatILS(summary.monthlyAverageIncome || 0)}
              </div>
              <div className="text-[11px] text-dark-text-muted light:text-light-text-muted">
                סה״כ {formatILS(summary.totalIncome || 0)} בתקופה
              </div>
            </div>

            {/* Monthly Avg Expense */}
            <div className="p-4 rounded-2xl border border-dark-border/80 light:border-light-border/80 bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
                <span>ממוצע הוצאות לחודש</span>
                <ArrowUpRight className="w-4 h-4 text-rose-500" />
              </div>
              <div className="text-lg sm:text-2xl font-bold text-rose-500 font-mono" dir="ltr">
                {formatILS(summary.monthlyAverageExpenses || 0)}
              </div>
              <div className="text-[11px] text-dark-text-muted light:text-light-text-muted">
                סה״כ {formatILS(summary.totalExpenses || 0)} בתקופה
              </div>
            </div>

            {/* Monthly Avg Balance */}
            <div className="p-4 rounded-2xl border border-dark-border/80 light:border-light-border/80 bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
                <span>מאזן חודשי ממוצע</span>
                {(summary.monthlyAverageBalance || 0) >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-rose-400" />
                )}
              </div>
              <div className={`text-lg sm:text-2xl font-bold font-mono ${(summary.monthlyAverageBalance || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`} dir="ltr">
                {formatILS(summary.monthlyAverageBalance || 0, { showSign: true })}
              </div>
              <div className="text-[11px] text-dark-text-muted light:text-light-text-muted">
                שיעור חיסכון כולל: <span className="font-bold text-dark-text light:text-light-text">{summary.overallSavingsRate || 0}%</span>
              </div>
            </div>

            {/* Total Net Cumulative Savings */}
            <div className="p-4 rounded-2xl border border-dark-border/80 light:border-light-border/80 bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
                <span>מאזן כולל מצטבר</span>
                <Scale className="w-4 h-4 text-brand-primary" />
              </div>
              <div className={`text-lg sm:text-2xl font-bold font-mono ${(summary.totalBalance || 0) >= 0 ? 'text-brand-primary' : 'text-rose-400'}`} dir="ltr">
                {formatILS(summary.totalBalance || 0, { showSign: true })}
              </div>
              <div className="text-[11px] text-dark-text-muted light:text-light-text-muted">
                תזרים נטו לאורך כל {lookbackMonths} החודשים
              </div>
            </div>
          </div>

          {/* Best / Worst Highlights Banner */}
          {(summary.bestMonth || summary.worstMonth || summary.highestExpenseMonth) && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              {summary.bestMonth && (
                <div className="p-3.5 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-emerald-400">חודש החיסכון והעודף הטוב ביותר</div>
                    <div className="text-dark-text light:text-light-text font-bold mt-0.5">
                      {summary.bestMonth.label} • <span className="font-mono text-emerald-400" dir="ltr">+{formatILS(summary.bestMonth.balance)}</span> ({summary.bestMonth.savingsRate}% חיסכון)
                    </div>
                  </div>
                </div>
              )}

              {summary.worstMonth && (
                <div className="p-3.5 rounded-2xl border border-rose-500/25 bg-rose-500/5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-500 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-rose-400">החודש עם הגירעון / המאזן הנמוך ביותר</div>
                    <div className="text-dark-text light:text-light-text font-bold mt-0.5">
                      {summary.worstMonth.label} • <span className="font-mono text-rose-400" dir="ltr">{formatILS(summary.worstMonth.balance, { showSign: true })}</span>
                    </div>
                  </div>
                </div>
              )}

              {summary.highestExpenseMonth && (
                <div className="p-3.5 rounded-2xl border border-amber-500/25 bg-amber-500/5 flex items-center gap-3 md:col-span-2 lg:col-span-1">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
                    <TrendingDown className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-amber-400">החודש עם ההוצאות הכבדות ביותר</div>
                    <div className="text-dark-text light:text-light-text font-bold mt-0.5">
                      {summary.highestExpenseMonth.label} • <span className="font-mono text-amber-400" dir="ltr">{formatILS(summary.highestExpenseMonth.expenses)} הוצאות</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Interactive Chart Section */}
          <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface-elevated/30 light:bg-light-surface-elevated/30 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-dark-text light:text-light-text flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-brand-primary" />
                  <span>
                    {activeChartTab === 'balance' ? 'גרף מאזן חודשי נטו (ירוק = עודף, אדום = גירעון)' : 'השוואת הכנסות מול הוצאות חודשיות'}
                  </span>
                </h3>
                <p className="text-[11px] text-dark-text-muted light:text-light-text-muted mt-0.5">
                  מציג את התוצאה הפיננסית בכל מחזור חודשי לאורך {lookbackMonths} חודשים
                </p>
              </div>

              {/* Chart Mode Toggle */}
              <div className="flex rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface p-1 text-xs shrink-0">
                <button
                  onClick={() => setActiveChartTab('balance')}
                  className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                    activeChartTab === 'balance'
                      ? 'bg-brand-primary text-white shadow-xs'
                      : 'text-dark-text-muted light:text-light-text-muted hover:text-dark-text'
                  }`}
                >
                  מאזן נטו (+/-)
                </button>
                <button
                  onClick={() => setActiveChartTab('comparison')}
                  className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                    activeChartTab === 'comparison'
                      ? 'bg-brand-primary text-white shadow-xs'
                      : 'text-dark-text-muted light:text-light-text-muted hover:text-dark-text'
                  }`}
                >
                  הכנסות מול הוצאות
                </button>
              </div>
            </div>

            {loading ? (
              <div className="h-64 flex items-center justify-center text-xs text-dark-text-muted">
                <RefreshCw className="w-5 h-5 animate-spin text-brand-primary mr-2" />
                <span>טוען נתוני מאזן היסטוריים...</span>
              </div>
            ) : months.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-xs text-dark-text-muted">
                אין נתונים זמינים לתקופה זו
              </div>
            ) : (
              <div className="h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  {activeChartTab === 'balance' ? (
                    <BarChart data={months} margin={{ top: 15, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme === 'light' ? '#e2e8f0' : '#1e293b'} vertical={false} />
                      <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(val) => `₪${val}`} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: theme === 'light' ? '#ffffff' : '#0f172a',
                          borderColor: theme === 'light' ? '#e2e8f0' : '#1e293b',
                          borderRadius: '1rem',
                          fontSize: '12px',
                          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)',
                          padding: '10px 14px',
                        }}
                        formatter={(val, name, item) => [
                          <div key="val" className="space-y-1">
                            <div className="font-bold font-mono" style={{ color: val >= 0 ? '#10b981' : '#ef4444' }} dir="ltr">
                              {formatILS(val, { showSign: true })}
                            </div>
                            <div className="text-[11px] text-dark-text-muted light:text-light-text-muted">
                              הכנסות: {formatILS(item.payload.income)} • הוצאות: {formatILS(item.payload.expenses)}
                            </div>
                            <div className="text-[11px] font-semibold text-brand-primary">
                              שיעור חיסכון: {item.payload.savingsRate}%
                            </div>
                          </div>,
                          'מאזן חודשי'
                        ]}
                        labelFormatter={(label) => `מחזור: ${label}`}
                      />
                      <ReferenceLine y={0} stroke="#64748b" strokeWidth={1.5} />
                      {summary.monthlyAverageBalance !== undefined && (
                        <ReferenceLine 
                          y={summary.monthlyAverageBalance} 
                          stroke="#6366f1" 
                          strokeDasharray="4 4" 
                          strokeWidth={2}
                          label={{ value: `ממוצע: ₪${Math.round(summary.monthlyAverageBalance)}`, position: 'insideTopRight', fill: '#6366f1', fontSize: 10 }}
                        />
                      )}
                      <Bar dataKey="balance" radius={[6, 6, 6, 6]}>
                        {months.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.balance >= 0 ? '#10b981' : '#ef4444'} 
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  ) : (
                    <BarChart data={months} margin={{ top: 15, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme === 'light' ? '#e2e8f0' : '#1e293b'} vertical={false} />
                      <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(val) => `₪${val}`} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: theme === 'light' ? '#ffffff' : '#0f172a',
                          borderColor: theme === 'light' ? '#e2e8f0' : '#1e293b',
                          borderRadius: '1rem',
                          fontSize: '12px',
                          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)',
                          padding: '10px 14px',
                        }}
                        formatter={(val) => formatILS(val)}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                      <Bar dataKey="income" name="הכנסות" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expenses" name="הוצאות" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Month-by-Month Detailed Cards / Table */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-dark-text light:text-light-text flex items-center justify-between">
              <span>פירוט חודש בחודשו ({months.length} חודשים)</span>
              <span className="text-[11px] text-dark-text-muted light:text-light-text-muted font-normal">
                מסודר מהחודש האחרון לאחור
              </span>
            </h3>

            <div className="space-y-2">
              {[...months].reverse().map((m, idx) => {
                const isSurplus = m.balance >= 0;
                return (
                  <div
                    key={m.monthKey || idx}
                    className="p-3.5 rounded-2xl border border-dark-border/60 light:border-light-border/60 bg-dark-surface light:bg-light-surface hover:bg-dark-surface-elevated/40 light:hover:bg-light-surface-elevated/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-xl font-bold flex items-center justify-center text-xs shrink-0 ${
                        isSurplus ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                      }`}>
                        {isSurplus ? '+' : '-'}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-dark-text light:text-light-text">
                          {m.label}
                        </div>
                        <div className="text-[11px] text-dark-text-muted light:text-light-text-muted flex items-center gap-2">
                          <span>{m.startDate} עד {m.endDate}</span>
                          <span>•</span>
                          <span>{m.txCount} עסקאות</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-5 text-xs">
                      <div>
                        <div className="text-[10px] text-dark-text-muted light:text-light-text-muted">הכנסות</div>
                        <div className="font-bold text-emerald-400 font-mono" dir="ltr">
                          {formatILS(m.income)}
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] text-dark-text-muted light:text-light-text-muted">הוצאות</div>
                        <div className="font-bold text-rose-400 font-mono" dir="ltr">
                          {formatILS(m.expenses)}
                        </div>
                      </div>

                      <div className="text-left">
                        <div className="text-[10px] text-dark-text-muted light:text-light-text-muted">מאזן נטו</div>
                        <div className={`font-bold font-mono text-sm ${isSurplus ? 'text-emerald-400' : 'text-rose-400'}`} dir="ltr">
                          {formatILS(m.balance, { showSign: true })}
                        </div>
                      </div>

                      <div className={`px-2.5 py-1 rounded-lg font-bold text-xs shrink-0 ${
                        isSurplus ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                      }`}>
                        {m.savingsRate > 0 ? `+${m.savingsRate}%` : `${m.savingsRate}%`} חיסכון
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-dark-border light:border-light-border flex justify-end bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-brand-primary text-white text-xs font-semibold hover:bg-brand-primary-hover transition-colors shadow-sm"
          >
            סגור
          </button>
        </div>

      </div>
    </div>
  );
}
