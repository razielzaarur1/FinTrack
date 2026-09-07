'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  Calendar, 
  ArrowLeftRight, 
  Split, 
  MessageSquare, 
  Link2,
  RefreshCw,
  X
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatILS, formatDate } from '@/lib/formatters';
import { useApp } from '@/lib/app-context';
import TransactionDrawer from '@/components/transactions/TransactionDrawer';

export default function TransactionsPage() {
  const { t, lang } = useApp();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [nextCursorId, setNextCursorId] = useState(null);
  const [hasNextPage, setHasNextPage] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [selectedTx, setSelectedTx] = useState(null);

  const observer = useRef();

  const loadTransactions = async (cursor = null, cursorId = null, reset = false) => {
    setLoading(true);
    try {
      const res = await api.getTransactionsV2({
        limit: 30,
        cursor,
        cursorId,
        search: search.trim() || undefined,
        type: type !== 'all' ? type : undefined,
      });

      if (res.data) {
        setTransactions((prev) => (reset ? res.data.data : [...prev, ...res.data.data]));
        setNextCursor(res.data.nextCursor);
        setNextCursorId(res.data.nextCursorId);
        setHasNextPage(res.data.hasNextPage);
      }
    } catch (err) {
      console.error('Failed to load transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions(null, null, true);
  }, [type]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadTransactions(null, null, true);
  };

  // Infinite Scroll Trigger
  const lastTxRef = useCallback(
    (node) => {
      if (loading) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextPage && nextCursor && nextCursorId) {
          loadTransactions(nextCursor, nextCursorId, false);
        }
      });
      if (node) observer.current.observe(node);
    },
    [loading, hasNextPage, nextCursor, nextCursorId]
  );

  const handleTxUpdated = (updated) => {
    setTransactions((prev) =>
      prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t))
    );
    if (selectedTx?.id === updated.id) {
      setSelectedTx({ ...selectedTx, ...updated });
    }
  };

  const handleExportCSV = () => {
    if (transactions.length === 0) return;
    const headers = ['Date,Description,Category,Amount,Currency,Bank\n'];
    const rows = transactions.map((t) =>
      `"${t.date}","${(t.userDescription || t.description || '').replace(/"/g, '""')}","${t.category || ''}",${t.amount},${t.currency},${t.bankCompany}`
    );
    const blob = new Blob([headers.join('') + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fintrack-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">
            {t('transactions')}
          </h1>
          <p className="text-xs text-dark-text-muted light:text-light-text-muted">
            {lang === 'he' ? 'גלילה אינסופית, פיצול תנועות וקישור חיוב/זיכוי' : 'Infinite stream, splits, and credit/refund linkage'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface hover:border-brand-primary text-xs font-semibold"
          >
            <Download className="w-4 h-4" />
            <span>{t('export')}</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-dark-text-muted light:text-light-text-muted absolute right-3 rtl:right-3 ltr:left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search')}
            className="w-full py-2.5 rtl:pr-9 rtl:pl-3 ltr:pl-9 ltr:pr-3 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-sm focus:outline-none focus:border-brand-primary"
          />
        </form>

        {/* Type Toggle Buttons */}
        <div className="flex rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface p-1 text-xs shrink-0">
          <button
            onClick={() => setType('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              type === 'all' ? 'bg-brand-primary text-white' : 'text-dark-text-muted hover:text-dark-text'
            }`}
          >
            {lang === 'he' ? 'הכל' : 'All'}
          </button>
          <button
            onClick={() => setType('expense')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              type === 'expense' ? 'bg-brand-expense text-white' : 'text-dark-text-muted hover:text-dark-text'
            }`}
          >
            {t('expense')}
          </button>
          <button
            onClick={() => setType('income')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              type === 'income' ? 'bg-brand-income text-white' : 'text-dark-text-muted hover:text-dark-text'
            }`}
          >
            {t('income')}
          </button>
        </div>
      </div>

      {/* Infinite Transaction List */}
      <div className="rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface overflow-hidden shadow-sm">
        {transactions.length === 0 && !loading ? (
          <div className="py-16 text-center text-dark-text-muted light:text-light-text-muted text-sm space-y-2">
            <ArrowLeftRight className="w-10 h-10 mx-auto opacity-40" />
            <div>{t('noTransactions')}</div>
          </div>
        ) : (
          <div className="divide-y divide-dark-border/60 light:divide-light-border/60">
            {transactions.map((tx, idx) => {
              const isLast = idx === transactions.length - 1;
              const isPositive = parseFloat(tx.amount) > 0;
              return (
                <div
                  key={tx.id}
                  ref={isLast ? lastTxRef : null}
                  onClick={() => setSelectedTx(tx)}
                  className="p-4 flex items-center justify-between hover:bg-dark-surface-elevated/60 light:hover:bg-light-surface-elevated/60 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-dark-surface-elevated light:bg-light-surface-elevated border border-dark-border light:border-light-border flex items-center justify-center font-bold text-xs uppercase shrink-0">
                      {tx.bankCompany?.substring(0, 3) || 'TX'}
                    </div>

                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate flex items-center gap-2">
                        <span>{tx.userDescription || tx.merchantName || tx.description}</span>
                        {tx.isSplit && (
                          <span className="p-1 rounded bg-brand-primary/20 text-brand-primary text-[10px]" title="מפוצלת">
                            <Split className="w-3 h-3" />
                          </span>
                        )}
                        {tx.hasLinks && (
                          <span className="p-1 rounded bg-brand-cyan/20 text-brand-cyan text-[10px]" title="מקושרת">
                            <Link2 className="w-3 h-3" />
                          </span>
                        )}
                        {tx.hasNotes && (
                          <span className="p-1 rounded bg-brand-amber/20 text-brand-amber text-[10px]" title="הערות">
                            <MessageSquare className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-dark-text-muted light:text-light-text-muted flex items-center gap-2 mt-0.5">
                        <span>{formatDate(tx.date, lang)}</span>
                        <span>•</span>
                        <span className="px-2 py-0.5 rounded-md bg-dark-surface-elevated light:bg-light-surface-elevated border border-dark-border light:border-light-border text-[11px]">
                          {tx.category || (lang === 'he' ? 'אחר' : 'Other')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right rtl:text-left shrink-0 pl-2">
                    <div className={`font-bold text-sm sm:text-base ${isPositive ? 'text-brand-income' : 'text-dark-text light:text-light-text'}`}>
                      {formatILS(tx.amount, { showSign: true })}
                    </div>
                    <div className="text-[11px] text-dark-text-muted light:text-light-text-muted">
                      {tx.currency}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Loading / End Indicators */}
        {loading && (
          <div className="p-4 text-center text-xs text-dark-text-muted flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-brand-primary" />
            <span>{lang === 'he' ? 'טוען תנועות נוספות...' : 'Loading more transactions...'}</span>
          </div>
        )}
        {!hasNextPage && transactions.length > 0 && (
          <div className="p-4 text-center text-xs text-dark-text-muted border-t border-dark-border light:border-light-border">
            {lang === 'he' ? 'הגעת לתחילת ההיסטוריה' : 'You have reached the beginning of history'}
          </div>
        )}
      </div>

      {/* Transaction Slide-Over Drawer */}
      {selectedTx && (
        <TransactionDrawer
          tx={selectedTx}
          onClose={() => setSelectedTx(null)}
          onUpdate={handleTxUpdated}
        />
      )}
    </div>
  );
}
