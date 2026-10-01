'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Store, 
  Calendar, 
  Receipt, 
  Search, 
  TrendingUp, 
  CreditCard,
  ChevronLeft
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';
import { api } from '@/lib/api';
import { formatILS, formatDate } from '@/lib/formatters';
import { useApp } from '@/lib/app-context';
import CategoryBadge from '@/components/common/CategoryBadge';
import TransactionDrawer from '@/components/transactions/TransactionDrawer';

export default function MerchantDrillDownModal({ merchantItem, onClose, onTransactionUpdated }) {
  const { lang, theme } = useApp();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTx, setSelectedTx] = useState(null);

  const merchantName = merchantItem?.merchant || merchantItem?.name || 'בית עסק';

  useEffect(() => {
    const loadMerchantTxs = async () => {
      setLoading(true);
      try {
        const res = await api.getTransactions({
          search: merchantName,
          limit: 100,
        });
        if (res.data?.data) {
          setTransactions(res.data.data);
        }
      } catch (err) {
        console.error('Failed to load merchant transactions:', err);
      } finally {
        setLoading(false);
      }
    };

    if (merchantName) {
      loadMerchantTxs();
    }
  }, [merchantName]);

  const filtered = transactions.filter((tx) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    const desc = (tx.userDescription || tx.merchantName || tx.description || '').toLowerCase();
    return desc.includes(q);
  });

  const totalSpent = transactions.reduce((acc, tx) => acc + (Math.abs(parseFloat(tx.amount)) || 0), 0);
  const avgAmount = transactions.length > 0 ? totalSpent / transactions.length : 0;

  // Monthly trend grouping
  const monthlyData = React.useMemo(() => {
    const monthMap = {};
    for (const tx of transactions) {
      const monthKey = tx.date?.slice(0, 7) || 'אחר';
      monthMap[monthKey] = (monthMap[monthKey] || 0) + Math.abs(parseFloat(tx.amount) || 0);
    }
    return Object.entries(monthMap)
      .map(([m, amt]) => ({ month: m, amount: Math.round(amt * 100) / 100 }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);
  }, [transactions]);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in duration-200">
        <div className="w-full max-w-4xl max-h-[92vh] bg-dark-surface light:bg-light-surface border border-dark-border light:border-light-border rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
          
          {/* Header */}
          <div className="p-5 sm:p-6 border-b border-dark-border light:border-light-border flex items-center justify-between bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 shrink-0">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                <Store className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-bold text-dark-text light:text-light-text truncate">
                    {merchantName}
                  </h2>
                  {merchantItem?.category && (
                    <CategoryBadge category={merchantItem.category} size={18} />
                  )}
                </div>
                <p className="text-xs text-dark-text-muted light:text-light-text-muted mt-0.5">
                  היסטוריית תשלומים, ממוצע לעסקה ומגמת הוצאות בבית העסק
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated text-dark-text-muted light:text-light-text-muted hover:text-dark-text transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-6">
            
            {/* Top 3 KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-4 rounded-2xl border border-dark-border/70 light:border-light-border/70 bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 space-y-1">
                <div className="text-dark-text-muted light:text-light-text-muted font-medium">סך כל ההוצאות בעסק</div>
                <div className="text-xl font-bold text-rose-500 font-mono" dir="ltr">
                  {formatILS(totalSpent)}
                </div>
                <div className="text-[10px] text-dark-text-muted">מתוך כלל התנועות שנמצאו</div>
              </div>

              <div className="p-4 rounded-2xl border border-dark-border/70 light:border-light-border/70 bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 space-y-1">
                <div className="text-dark-text-muted light:text-light-text-muted font-medium">כמות עסקאות</div>
                <div className="text-xl font-bold text-dark-text light:text-light-text font-mono">
                  {transactions.length}
                </div>
                <div className="text-[10px] text-dark-text-muted">תשלומים שנרשמו</div>
              </div>

              <div className="p-4 rounded-2xl border border-dark-border/70 light:border-light-border/70 bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 space-y-1">
                <div className="text-dark-text-muted light:text-light-text-muted font-medium">ממוצע לעסקה בודדת</div>
                <div className="text-xl font-bold text-brand-primary font-mono" dir="ltr">
                  {formatILS(avgAmount)}
                </div>
                <div className="text-[10px] text-dark-text-muted">לכל ביקור / הזמנה</div>
              </div>
            </div>

            {/* Monthly Trend Chart for Merchant */}
            {monthlyData.length > 1 && (
              <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface-elevated/30 light:bg-light-surface-elevated/30 space-y-3">
                <h3 className="text-sm font-bold text-dark-text light:text-light-text flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-brand-primary" />
                  <span>הוצאות חודשיות ב-{merchantName}</span>
                </h3>
                <div className="h-52 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme === 'light' ? '#e2e8f0' : '#1e293b'} vertical={false} />
                      <XAxis dataKey="month" stroke="#64748b" fontSize={11} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(v) => `₪${v}`} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: theme === 'light' ? '#ffffff' : '#0f172a',
                          borderColor: theme === 'light' ? '#e2e8f0' : '#1e293b',
                          borderRadius: '0.75rem',
                          fontSize: '12px',
                        }}
                        formatter={(val) => formatILS(val)}
                      />
                      <Bar dataKey="amount" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Transaction List */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <h3 className="text-sm font-bold text-dark-text light:text-light-text flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-brand-primary" />
                  <span>רשימת עסקאות ({filtered.length})</span>
                </h3>

                <div className="relative w-full sm:w-60">
                  <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-dark-text-muted pointer-events-none" />
                  <input
                    type="text"
                    placeholder="חיפוש לפי תיאור..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pr-8 pl-3 py-1.5 text-xs rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>

              {loading ? (
                <div className="p-8 text-center text-xs text-dark-text-muted">
                  טוען עסקאות...
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-xs text-dark-text-muted rounded-2xl border border-dark-border/60 bg-dark-surface-elevated/20">
                  לא נמצאו עסקאות תואמות
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                  {filtered.map((tx) => (
                    <div
                      key={tx.id}
                      onClick={() => setSelectedTx(tx)}
                      className="p-3 rounded-2xl border border-dark-border/60 light:border-light-border/60 bg-dark-surface light:bg-light-surface hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated transition-all flex items-center justify-between gap-3 cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <CategoryBadge category={tx.category} size={16} />
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm font-semibold text-dark-text light:text-light-text truncate">
                            {tx.userDescription || tx.merchantName || tx.description || 'עסקה'}
                          </div>
                          <div className="text-[11px] text-dark-text-muted light:text-light-text-muted flex items-center gap-2 mt-0.5">
                            <span>{formatDate(tx.date, lang)}</span>
                            {tx.accountDisplayName && (
                              <>
                                <span>•</span>
                                <span>{tx.accountDisplayName}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-xs sm:text-sm font-bold font-mono text-rose-500" dir="ltr">
                          {formatILS(tx.amount)}
                        </div>
                        <ChevronLeft className="w-4 h-4 text-dark-text-muted group-hover:text-brand-primary transition-all rtl:rotate-0" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
