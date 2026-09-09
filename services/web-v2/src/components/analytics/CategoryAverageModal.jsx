'use client';

import React, { useState, useMemo } from 'react';
import { 
  X, 
  TrendingUp, 
  Receipt, 
  Search, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight,
  ExternalLink,
  ChevronLeft
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ReferenceLine,
  CartesianGrid 
} from 'recharts';
import { formatILS, formatDate } from '@/lib/formatters';
import { useApp } from '@/lib/app-context';
import CategoryBadge from '@/components/common/CategoryBadge';
import TransactionDrawer from '@/components/transactions/TransactionDrawer';

export default function CategoryAverageModal({ categoryItem, onClose, onTransactionUpdated }) {
  const { lang, theme } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTx, setSelectedTx] = useState(null);

  if (!categoryItem) return null;

  const distribution = categoryItem.distribution || [];
  const transactions = categoryItem.transactions || [];
  const monthlyAvg = categoryItem.monthlyAverage || categoryItem.amount || 0;
  const totalSpend = categoryItem.totalHistorical || 0;
  const currentMonthSpend = categoryItem.currentMonth || 0;

  // Filter transactions by search term
  const filteredTransactions = useMemo(() => {
    if (!searchTerm.trim()) return transactions;
    const q = searchTerm.trim().toLowerCase();
    return transactions.filter((tx) => {
      const title = (tx.userDescription || tx.merchantName || tx.description || '').toLowerCase();
      const cat = (tx.category || '').toLowerCase();
      return title.includes(q) || cat.includes(q);
    });
  }, [transactions, searchTerm]);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in duration-200">
        <div className="w-full max-w-4xl max-h-[92vh] bg-dark-surface light:bg-light-surface border border-dark-border light:border-light-border rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
          
          {/* Modal Header */}
          <div className="p-5 sm:p-6 border-b border-dark-border light:border-light-border flex items-center justify-between bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 shrink-0">
            <div className="flex items-center gap-3.5 min-w-0">
              <CategoryBadge category={categoryItem.category || categoryItem.name} size={24} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-bold text-dark-text light:text-light-text truncate">
                    {categoryItem.category || categoryItem.name}
                  </h2>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-brand-primary/15 text-brand-primary font-semibold">
                    ממוצע 12 חודשים
                  </span>
                </div>
                <p className="text-xs text-dark-text-muted light:text-light-text-muted mt-0.5">
                  התפלגות הוצאות חודשית רציפה ומפורטת לאורך כל השנה
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Scrollable Body */}
          <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-6">
            
            {/* Top 4 KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Monthly Average (12M Fixed Divisor) */}
              <div className="p-3.5 rounded-2xl border border-dark-border/70 light:border-light-border/70 bg-dark-surface-elevated/50 light:bg-light-surface-elevated/50 space-y-1">
                <div className="text-[11px] font-medium text-dark-text-muted light:text-light-text-muted">
                  ממוצע חודשי (12 חודשים)
                </div>
                <div className="text-base sm:text-xl font-bold text-brand-primary font-mono" dir="ltr">
                  {formatILS(monthlyAvg)}
                </div>
                <div className="text-[10px] text-dark-text-muted light:text-light-text-muted">
                  מחולק ב-12 חודשים בדיוק
                </div>
              </div>

              {/* Total 12M Spend */}
              <div className="p-3.5 rounded-2xl border border-dark-border/70 light:border-light-border/70 bg-dark-surface-elevated/50 light:bg-light-surface-elevated/50 space-y-1">
                <div className="text-[11px] font-medium text-dark-text-muted light:text-light-text-muted">
                  סה״כ ב-12 חודשים
                </div>
                <div className="text-base sm:text-xl font-bold text-rose-500 font-mono" dir="ltr">
                  {formatILS(totalSpend)}
                </div>
                <div className="text-[10px] text-dark-text-muted light:text-light-text-muted">
                  כלל ההוצאות בשנה
                </div>
              </div>

              {/* Current Month Spend */}
              <div className="p-3.5 rounded-2xl border border-dark-border/70 light:border-light-border/70 bg-dark-surface-elevated/50 light:bg-light-surface-elevated/50 space-y-1">
                <div className="text-[11px] font-medium text-dark-text-muted light:text-light-text-muted">
                  הוצאה החודש
                </div>
                <div className="text-base sm:text-xl font-bold text-dark-text light:text-light-text font-mono" dir="ltr">
                  {formatILS(currentMonthSpend)}
                </div>
                <div className="text-[10px] text-dark-text-muted light:text-light-text-muted">
                  {categoryItem.diffPercent !== 0 ? (
                    <span className={categoryItem.diffPercent > 0 ? 'text-rose-400 font-semibold' : 'text-emerald-400 font-semibold'}>
                      {categoryItem.diffPercent > 0 ? `+${categoryItem.diffPercent}% מהממוצע` : `${categoryItem.diffPercent}% מהממוצע`}
                    </span>
                  ) : 'תואם לממוצע'}
                </div>
              </div>

              {/* Total Transactions */}
              <div className="p-3.5 rounded-2xl border border-dark-border/70 light:border-light-border/70 bg-dark-surface-elevated/50 light:bg-light-surface-elevated/50 space-y-1">
                <div className="text-[11px] font-medium text-dark-text-muted light:text-light-text-muted">
                  כמות עסקאות
                </div>
                <div className="text-base sm:text-xl font-bold text-dark-text light:text-light-text font-mono">
                  {transactions.length}
                </div>
                <div className="text-[10px] text-dark-text-muted light:text-light-text-muted">
                  ב-12 החודשים האחרונים
                </div>
              </div>
            </div>

            {/* Continuous Smooth Functional Curve Distribution Chart */}
            <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface-elevated/30 light:bg-light-surface-elevated/30 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-brand-primary" />
                  <h3 className="text-sm font-bold text-dark-text light:text-light-text">
                    גרף התפלגות חודשי רציף (12 חודשים)
                  </h3>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5 text-dark-text-muted light:text-light-text-muted">
                    <span className="w-3 h-0.5 bg-brand-primary rounded-full inline-block" />
                    <span>הוצאה חודשית בפועל</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-500 font-medium">
                    <span className="w-3 h-0.5 border-b border-dashed border-emerald-500 inline-block" />
                    <span>קו ממוצע ({formatILS(monthlyAvg)})</span>
                  </div>
                </div>
              </div>

              <div className="h-64 sm:h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={distribution} margin={{ top: 15, right: 10, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorAvgCurve" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme === 'light' ? '#e2e8f0' : '#1e293b'} vertical={false} />
                    <XAxis 
                      dataKey="label" 
                      stroke="#64748b" 
                      fontSize={11} 
                      tickLine={false} 
                      axisLine={{ stroke: theme === 'light' ? '#cbd5e1' : '#334155' }}
                    />
                    <YAxis 
                      stroke="#64748b" 
                      fontSize={11} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(val) => `₪${val}`} 
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: theme === 'light' ? '#ffffff' : '#0f172a',
                        borderColor: theme === 'light' ? '#e2e8f0' : '#1e293b',
                        borderRadius: '1rem',
                        fontSize: '12px',
                        color: theme === 'light' ? '#0f172a' : '#f8fafc',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)',
                        padding: '10px 14px',
                      }}
                      formatter={(val, name, item) => [
                        <span key="val" className="font-bold text-brand-primary font-mono">{formatILS(val)} ({item.payload.txCount} עסקאות)</span>,
                        'הוצאה בחודש'
                      ]}
                      labelFormatter={(label) => `חודש: ${label}`}
                    />
                    {/* Continuous Smooth Bezier / Monotone Function Curve */}
                    <Area
                      type="monotone"
                      dataKey="amount"
                      name="הוצאה"
                      stroke="#6366f1"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorAvgCurve)"
                      activeDot={{ r: 6, stroke: '#6366f1', strokeWidth: 2, fill: '#ffffff' }}
                      dot={{ r: 3.5, stroke: '#6366f1', strokeWidth: 2, fill: theme === 'light' ? '#ffffff' : '#0f172a' }}
                    />
                    {/* Fixed 12-Month Average Reference Line */}
                    {monthlyAvg > 0 && (
                      <ReferenceLine
                        y={monthlyAvg}
                        stroke="#10b981"
                        strokeDasharray="4 4"
                        strokeWidth={2}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Transactions Section */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-brand-primary" />
                  <h3 className="text-sm font-bold text-dark-text light:text-light-text">
                    כל התנועות שנכללות בממוצע ({filteredTransactions.length})
                  </h3>
                </div>

                {/* In-modal search */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-dark-text-muted pointer-events-none" />
                  <input
                    type="text"
                    placeholder="חיפוש לפי עסק או תיאור..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pr-8 pl-3 py-1.5 text-xs rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>

              {filteredTransactions.length === 0 ? (
                <div className="p-8 text-center rounded-2xl border border-dark-border/60 light:border-light-border/60 bg-dark-surface-elevated/20 light:bg-light-surface-elevated/20 text-xs text-dark-text-muted light:text-light-text-muted">
                  {transactions.length === 0 ? 'אין תנועות בקטגוריה זו ב-12 החודשים האחרונים' : 'לא נמצאו תנועות התואמות לחיפוש'}
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-0.5">
                  {filteredTransactions.map((tx) => {
                    const isPositive = parseFloat(tx.amount) > 0;
                    const merchantTitle = tx.userDescription || tx.merchantName || tx.description || 'ללא שם';
                    const subDescription = tx.description && tx.description !== merchantTitle ? tx.description : null;

                    return (
                      <div
                        key={tx.id}
                        onClick={() => setSelectedTx(tx)}
                        className="p-3 rounded-2xl border border-dark-border/60 light:border-light-border/60 bg-dark-surface light:bg-light-surface hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated hover:border-brand-primary/40 transition-all flex items-center justify-between gap-3 cursor-pointer group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <CategoryBadge category={tx.category || categoryItem.name} size={16} />
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-semibold text-dark-text light:text-light-text truncate flex items-center gap-1.5">
                              <span>{merchantTitle}</span>
                              {tx.accountDisplayName && (
                                <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-dark-surface-elevated light:bg-light-surface-elevated border border-dark-border/40 light:border-light-border/40 text-dark-text-muted light:text-light-text-muted">
                                  {tx.accountDisplayName}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-dark-text-muted light:text-light-text-muted flex items-center gap-2 mt-0.5">
                              <span>{formatDate(tx.date, lang)}</span>
                              {subDescription && (
                                <>
                                  <span>•</span>
                                  <span className="truncate max-w-[160px] opacity-80">{subDescription}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className={`text-xs sm:text-sm font-bold font-mono ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`} dir="ltr">
                            {formatILS(tx.amount, { showSign: true })}
                          </div>
                          <ChevronLeft className="w-4 h-4 text-dark-text-muted group-hover:text-brand-primary group-hover:-translate-x-0.5 transition-all rtl:rotate-0" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* Modal Footer */}
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

      {/* Transaction Drawer if a transaction inside the list is clicked */}
      {selectedTx && (
        <TransactionDrawer
          tx={selectedTx}
          onClose={() => setSelectedTx(null)}
          onUpdate={(updatedTx) => {
            setSelectedTx(null);
            onTransactionUpdated?.(updatedTx);
          }}
        />
      )}
    </>
  );
}
