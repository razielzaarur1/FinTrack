'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
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
  X, 
  SlidersHorizontal, 
  CreditCard, 
  Tag, 
  RotateCcw,
  Clock,
  ChevronDown,
  CheckSquare,
  Square
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatILS, formatDate } from '@/lib/formatters';
import { useApp } from '@/lib/app-context';
import CategoryBadge from '@/components/common/CategoryBadge';
import CategoryPicker from '@/components/common/CategoryPicker';
import InstitutionLogo from '@/components/common/InstitutionLogo';
import TransactionDrawer from '@/components/transactions/TransactionDrawer';
import { CATEGORIES_DATA } from '@/lib/categories';

function TransactionsContent() {
  const { t, lang } = useApp();
  const searchParams = useSearchParams();
  const initialAccountId = searchParams?.get('accountId') || 'all';

  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [nextCursorId, setNextCursorId] = useState(null);
  const [hasNextPage, setHasNextPage] = useState(true);

  // Filters State
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all'); // all, expense, income
  const [selectedAccountId, setSelectedAccountId] = useState(initialAccountId);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [datePreset, setDatePreset] = useState('all'); // all, current_month, last_month, last_90, custom
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // UI State
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);

  // Multi-selection state & banner
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkCategoryModalOpen, setBulkCategoryModalOpen] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('');
  const [savingBulk, setSavingBulk] = useState(false);

  const toggleSelect = (id, e) => {
    e?.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === transactions.length && transactions.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map((t) => t.id)));
    }
  };

  const selectedTxs = useMemo(() => {
    return transactions.filter((t) => selectedIds.has(t.id));
  }, [transactions, selectedIds]);

  const selectedCount = selectedIds.size;

  const totalSelectedSum = useMemo(() => {
    return selectedTxs.reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);
  }, [selectedTxs]);

  const totalSelectedExpenses = useMemo(() => {
    return selectedTxs
      .filter((t) => parseFloat(t.amount) < 0)
      .reduce((acc, t) => acc + Math.abs(parseFloat(t.amount) || 0), 0);
  }, [selectedTxs]);

  const totalSelectedIncomes = useMemo(() => {
    return selectedTxs
      .filter((t) => parseFloat(t.amount) > 0)
      .reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);
  }, [selectedTxs]);

  const handleApplyBulkCategory = async () => {
    if (!bulkCategory || selectedIds.size === 0) return;
    setSavingBulk(true);
    try {
      const ids = Array.from(selectedIds);
      const res = await api.bulkUpdateTransactions({
        transactionIds: ids,
        category: bulkCategory,
      });
      if (res.data) {
        setTransactions((prev) =>
          prev.map((t) => (selectedIds.has(t.id) ? { ...t, category: bulkCategory } : t))
        );
        setBulkCategoryModalOpen(false);
        setSelectedIds(new Set());
      }
    } finally {
      setSavingBulk(false);
    }
  };

  const observer = useRef();

  // Load user accounts for filter dropdown
  useEffect(() => {
    api.getAccounts().then((res) => {
      if (res.data) setAccounts(res.data);
    });
  }, []);

  // Update account filter if URL param changes
  useEffect(() => {
    const accParam = searchParams?.get('accountId');
    if (accParam) {
      setSelectedAccountId(accParam);
      setShowFilters(true);
    }
  }, [searchParams]);

  // Compute active filters count
  const activeFiltersCount = [
    search.trim() ? 1 : 0,
    type !== 'all' ? 1 : 0,
    selectedAccountId !== 'all' ? 1 : 0,
    selectedCategory !== 'all' ? 1 : 0,
    minAmount ? 1 : 0,
    maxAmount ? 1 : 0,
    datePreset !== 'all' || startDate || endDate ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  // Helper to compute date ranges
  const getDateRangeForPreset = (preset) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    if (preset === 'current_month') {
      const s = new Date(y, m, 1);
      const e = new Date(y, m + 1, 0);
      return { start: s.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10) };
    }
    if (preset === 'last_month') {
      const s = new Date(y, m - 1, 1);
      const e = new Date(y, m, 0);
      return { start: s.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10) };
    }
    if (preset === 'last_90') {
      const s = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      return { start: s.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    }
    return { start: startDate || undefined, end: endDate || undefined };
  };

  const loadTransactions = async (cursor = null, cursorId = null, reset = false) => {
    setLoading(true);
    try {
      const range = getDateRangeForPreset(datePreset);

      const res = await api.getTransactionsV2({
        limit: 30,
        cursor,
        cursorId,
        search: search.trim() || undefined,
        type: type !== 'all' ? type : undefined,
        accountId: selectedAccountId !== 'all' ? selectedAccountId : undefined,
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
        minAmount: minAmount ? parseFloat(minAmount) : undefined,
        maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
        startDate: range.start,
        endDate: range.end,
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

  // Reload transactions on filter change
  useEffect(() => {
    loadTransactions(null, null, true);
  }, [type, selectedAccountId, selectedCategory, datePreset, startDate, endDate]);

  const handleSearchSubmit = (e) => {
    e?.preventDefault();
    loadTransactions(null, null, true);
  };

  const handleResetFilters = () => {
    setSearch('');
    setType('all');
    setSelectedAccountId('all');
    setSelectedCategory('all');
    setMinAmount('');
    setMaxAmount('');
    setDatePreset('all');
    setStartDate('');
    setEndDate('');
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
    const headers = ['Date,Merchant,Description,Category,Amount,Currency,Account\n'];
    const rows = transactions.map((t) =>
      `"${t.date}","${(t.userDescription || t.merchantName || '').replace(/"/g, '""')}","${(t.description || '').replace(/"/g, '""')}","${t.category || ''}",${t.amount},${t.currency},"${t.accountDisplayName || t.bankCompany}"`
    );
    const blob = new Blob([headers.join('') + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fintrack-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const selectedAccountObj = accounts.find((a) => a.id === selectedAccountId);

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">
            {t('transactions')}
          </h1>
          <p className="text-xs text-dark-text-muted light:text-light-text-muted">
            {lang === 'he' ? 'מנוע חיפוש וסינון מתקדם לכל ההוצאות וההכנסות שלך' : 'Advanced search and filtering for all expenses and incomes'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadTransactions(null, null, true)}
            disabled={loading}
            className="p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text-muted hover:text-dark-text shadow-sm"
            title="רענן"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-brand-primary' : ''}`} />
          </button>
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface hover:bg-dark-surface-elevated text-xs font-semibold shadow-sm transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t('exportCSV')}</span>
          </button>
        </div>
      </div>

      {/* Primary Search & Filter Bar */}
      <div className="p-3 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-center gap-2.5">
          {/* Free-text Search Input */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-dark-text-muted light:text-light-text-muted absolute right-3 rtl:right-3 ltr:left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חפש לפי שם בית עסק, תיאור, הערות או סכום..."
              className="w-full py-2.5 rtl:pr-9 rtl:pl-9 ltr:pl-9 ltr:pr-9 rounded-xl border border-dark-border/80 light:border-light-border/80 bg-dark-surface-elevated/70 light:bg-light-surface-elevated/70 text-sm focus:outline-none focus:border-brand-primary"
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); loadTransactions(null, null, true); }}
                className="absolute left-3 rtl:left-3 ltr:right-3 top-1/2 -translate-y-1/2 text-dark-text-muted hover:text-dark-text"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </form>

          {/* Type Toggle Buttons */}
          <div className="flex rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated p-1 text-xs shrink-0 w-full sm:w-auto justify-center">
            <button
              onClick={() => setType('all')}
              className={`px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
                type === 'all' ? 'bg-brand-primary text-white shadow-sm' : 'text-dark-text-muted hover:text-dark-text'
              }`}
            >
              הכל
            </button>
            <button
              onClick={() => setType('expense')}
              className={`px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
                type === 'expense' ? 'bg-rose-500 text-white shadow-sm' : 'text-dark-text-muted hover:text-dark-text'
              }`}
            >
              הוצאות
            </button>
            <button
              onClick={() => setType('income')}
              className={`px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
                type === 'income' ? 'bg-emerald-600 text-white shadow-sm' : 'text-dark-text-muted hover:text-dark-text'
              }`}
            >
              הכנסות
            </button>
          </div>

          {/* Toggle Advanced Filters Button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition-all shrink-0 w-full sm:w-auto justify-center ${
              showFilters || activeFiltersCount > 0
                ? 'bg-brand-primary/10 border-brand-primary text-brand-primary'
                : 'border-dark-border light:border-light-border bg-dark-surface-elevated text-dark-text-muted hover:text-dark-text'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>מסננים</span>
            {activeFiltersCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-brand-primary text-white text-[10px] flex items-center justify-center font-bold">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>

        {/* Expandable Advanced Filter Options */}
        {showFilters && (
          <div className="pt-3 border-t border-dark-border/60 light:border-light-border/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-in fade-in duration-200">
            {/* 1. Account / Card Filter */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-dark-text-muted flex items-center gap-1">
                <CreditCard className="w-3 h-3 text-indigo-400" />
                <span>חשבון / כרטיס אשראי</span>
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full p-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-xs font-medium focus:outline-none focus:border-brand-primary cursor-pointer"
              >
                <option value="all">כל החשבונות והכרטיסים</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.displayName || acc.bankCompany} {acc.accountNumber ? `(•••• ${acc.accountNumber})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Category Filter */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-dark-text-muted flex items-center gap-1">
                <Tag className="w-3 h-3 text-pink-400" />
                <span>קטגוריה</span>
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full p-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-xs font-medium focus:outline-none focus:border-brand-primary cursor-pointer"
              >
                <option value="all">כל הקטגוריות</option>
                <optgroup label="הוצאות">
                  {CATEGORIES_DATA.expenses.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="הכנסות">
                  {CATEGORIES_DATA.incomes.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* 3. Amount Range (Min - Max) */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-dark-text-muted">
                סכום (₪) מינימום - מקסימום
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  placeholder="מ-"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  onBlur={() => loadTransactions(null, null, true)}
                  className="w-1/2 p-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated text-xs"
                />
                <span className="text-dark-text-muted text-xs">-</span>
                <input
                  type="number"
                  placeholder="עד"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  onBlur={() => loadTransactions(null, null, true)}
                  className="w-1/2 p-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated text-xs"
                />
              </div>
            </div>

            {/* 4. Date Presets */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-dark-text-muted flex items-center gap-1">
                <Calendar className="w-3 h-3 text-amber-400" />
                <span>מועד / טווח תאריכים</span>
              </label>
              <select
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value)}
                className="w-full p-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-xs font-medium focus:outline-none focus:border-brand-primary cursor-pointer"
              >
                <option value="all">כל התקופות</option>
                <option value="current_month">חודש נוכחי</option>
                <option value="last_month">חודש קודם</option>
                <option value="last_90">90 ימים אחרונים</option>
                <option value="custom">טווח תאריכים מותאם אישית...</option>
              </select>
            </div>

            {/* Custom Date Pickers if 'custom' is selected */}
            {datePreset === 'custom' && (
              <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-3 pt-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-dark-text-muted">מתאריך:</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="p-1.5 rounded-lg border border-dark-border bg-dark-surface-elevated text-xs"
                  />
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-dark-text-muted">עד תאריך:</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="p-1.5 rounded-lg border border-dark-border bg-dark-surface-elevated text-xs"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Active Filters Chips Bar */}
        {activeFiltersCount > 0 && (
          <div className="pt-2.5 border-t border-dark-border/40 light:border-light-border/40 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[11px] text-dark-text-muted pl-1">סינונים פעילים:</span>

            {search.trim() && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-primary/15 text-brand-primary font-medium text-[11px]">
                <span>חיפוש: &quot;{search}&quot;</span>
                <button onClick={() => { setSearch(''); loadTransactions(null, null, true); }}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {selectedAccountId !== 'all' && selectedAccountObj && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-400 font-medium text-[11px]">
                <span>כרטיס: {selectedAccountObj.displayName || selectedAccountObj.bankCompany}</span>
                <button onClick={() => setSelectedAccountId('all')}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {selectedCategory !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-pink-500/15 text-pink-400 font-medium text-[11px]">
                <span>קטגוריה: {selectedCategory}</span>
                <button onClick={() => setSelectedCategory('all')}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {(minAmount || maxAmount) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-400 font-medium text-[11px]">
                <span>סכום: {minAmount || '0'} ₪ עד {maxAmount || '∞'} ₪</span>
                <button onClick={() => { setMinAmount(''); setMaxAmount(''); loadTransactions(null, null, true); }}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {datePreset !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-400 font-medium text-[11px]">
                <span>תקופה: {datePreset}</span>
                <button onClick={() => setDatePreset('all')}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            <button
              onClick={handleResetFilters}
              className="text-[11px] text-brand-expense hover:underline pr-2 font-medium flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>נקה הכל</span>
            </button>
          </div>
        )}
      </div>

      {/* Infinite Transaction List */}
      <div className="rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface overflow-hidden shadow-sm">
        {/* Select All & Multi-select Header Bar */}
        {transactions.length > 0 && (
          <div className="px-4 py-2.5 bg-dark-surface-elevated/50 light:bg-light-surface-elevated/50 border-b border-dark-border/60 light:border-light-border/60 flex items-center justify-between text-xs text-dark-text-muted light:text-light-text-muted">
            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={selectedIds.size === transactions.length && transactions.length > 0}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded text-brand-primary focus:ring-brand-primary cursor-pointer"
                title="סמן את כל התנועות"
              />
              <span className="font-medium">
                {selectedCount > 0 ? `נבחרו ${selectedCount} מתוך ${transactions.length}` : `סמן הכל (${transactions.length})`}
              </span>
            </div>
            {selectedCount > 0 && (
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-[11px] text-brand-primary hover:underline font-medium"
              >
                נקה בחירה
              </button>
            )}
          </div>
        )}

        {transactions.length === 0 && !loading ? (
          <div className="py-16 text-center text-dark-text-muted light:text-light-text-muted text-sm space-y-2">
            <ArrowLeftRight className="w-10 h-10 mx-auto opacity-40" />
            <div className="font-semibold">{t('noTransactions')}</div>
            <p className="text-xs max-w-xs mx-auto opacity-75">לא נמצאו עסקאות התואמות את החיפוש והמסננים שהוגדרו</p>
          </div>
        ) : (
          <div className="divide-y divide-dark-border/60 light:divide-light-border/60">
            {transactions.map((tx, idx) => {
              const isLast = idx === transactions.length - 1;
              const isIncome = parseFloat(tx.amount) > 0;
              const isSelected = selectedIds.has(tx.id);
              const merchantTitle = tx.userDescription || tx.merchantName || tx.description;
              const subDescription = tx.description && tx.description !== merchantTitle ? tx.description : null;
              const isAtm = Boolean(tx.isCashWithdrawal || (tx.merchantName && tx.merchantName.includes('משיכת מזומן')));

              return (
                <div
                  key={tx.id}
                  ref={isLast ? lastTxRef : null}
                  onClick={() => setSelectedTx(tx)}
                  className={`p-4 flex items-center justify-between hover:bg-dark-surface-elevated/70 light:hover:bg-light-surface-elevated/70 transition-colors cursor-pointer group ${
                    isSelected ? 'bg-brand-primary/5 dark:bg-brand-primary/10' : ''
                  }`}
                >
                  {/* Right side (in RTL): Checkbox + Category Icon + Merchant Name + Details */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => toggleSelect(tx.id, e)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 rounded text-brand-primary focus:ring-brand-primary cursor-pointer shrink-0"
                    />

                    <CategoryBadge category={tx.category} size={20} />

                    <div className="min-w-0">
                      {/* Merchant Store Name (Headline) */}
                      <div className="font-bold text-sm text-dark-text light:text-light-text truncate flex items-center gap-2">
                        <span>{merchantTitle}</span>

                        {isAtm && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 dark:text-amber-400 text-[10px] font-bold inline-flex items-center gap-1" title="משיכת מזומן - לא נספר כבית עסק">
                            <span>💵</span>
                            <span>מזומן</span>
                          </span>
                        )}

                        {tx.isSplit && (
                          <span className="px-1.5 py-0.5 rounded bg-brand-primary/20 text-brand-primary text-[10px] font-medium" title="מפוצלת">
                            מפוצלת
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
                        {tx.status === 'pending' && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[10px] font-medium">
                            <Clock className="w-2.5 h-2.5" />
                            <span>ממתין</span>
                          </span>
                        )}
                      </div>

                      {/* Subtitle: Detailed transaction memo/type + Date + Card */}
                      <div className="text-xs text-dark-text-muted light:text-light-text-muted flex flex-wrap items-center gap-2 mt-0.5">
                        {subDescription && (
                          <>
                            <span className="text-dark-text/80 light:text-light-text/80 truncate max-w-[200px] sm:max-w-xs">
                              {subDescription}
                            </span>
                            <span>•</span>
                          </>
                        )}
                        <span>{formatDate(tx.date, lang)}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1 font-mono text-[11px]">
                          <span>{tx.accountDisplayName || tx.bankCompany}</span>
                          {tx.accountNumber && <span>(•••• {tx.accountNumber})</span>}
                        </span>
                        <span>•</span>
                        <span className="px-1.5 py-0.2 rounded bg-dark-surface-elevated light:bg-light-surface-elevated border border-dark-border/60 light:border-light-border/60 text-[11px]">
                          {tx.category || 'ללא סיווג'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Left side (in RTL): Transaction Amount */}
                  <div className="shrink-0 text-left ltr:text-right pr-3">
                    <div 
                      className={`text-base sm:text-lg font-bold tracking-tight ${
                        isIncome ? 'text-emerald-500 dark:text-emerald-400' : 'text-dark-text light:text-light-text'
                      }`}
                      dir="ltr"
                    >
                      {formatILS(tx.amount, { showSign: true })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Loading Spinner at Bottom */}
        {loading && (
          <div className="p-4 flex items-center justify-center gap-2 text-xs text-dark-text-muted">
            <RefreshCw className="w-4 h-4 animate-spin text-brand-primary" />
            <span>{lang === 'he' ? 'טוען עסקאות נוספות...' : 'Loading transactions...'}</span>
          </div>
        )}
      </div>

      {/* Sticky Floating Multi-select Action Bar */}
      {selectedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-2xl w-[92%] bg-dark-surface light:bg-light-surface border border-brand-primary/40 rounded-2xl shadow-2xl p-4 flex flex-wrap items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-brand-primary/15 text-brand-primary font-bold flex items-center justify-center text-sm shadow-xs">
              {selectedCount}
            </span>
            <div>
              <div className="text-xs text-dark-text-muted light:text-light-text-muted">
                {selectedCount} תנועות נבחרו • סך הכל:
              </div>
              <div className="text-lg font-bold text-brand-primary flex items-center gap-2">
                <span>{formatILS(totalSelectedSum)}</span>
                <span className="text-[11px] font-normal text-dark-text-muted light:text-light-text-muted">
                  (הוצאות: {formatILS(totalSelectedExpenses)}- | הכנסות: {formatILS(totalSelectedIncomes)}+)
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setBulkCategoryModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-primary-hover transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Tag className="w-3.5 h-3.5" />
              <span>שנה קטגוריה במרוכז</span>
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3.5 py-2 rounded-xl border border-dark-border light:border-light-border hover:bg-dark-surface-elevated text-xs font-medium transition-colors text-dark-text-muted hover:text-dark-text"
            >
              בטל בחירה
            </button>
          </div>
        </div>
      )}

      {/* Bulk Category Assignment Modal */}
      {bulkCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-dark-surface light:bg-light-surface border border-dark-border light:border-light-border rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Tag className="w-5 h-5 text-brand-primary" />
                <span>שינוי קטגוריה במרוכז</span>
              </h3>
              <button
                onClick={() => setBulkCategoryModalOpen(false)}
                className="p-1 rounded-lg hover:bg-dark-surface-elevated text-dark-text-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-dark-text-muted light:text-light-text-muted">
              בחר קטגוריה או תת-קטגוריה להחלה על {selectedCount} התנועות שנבחרו. המערכת תלמד את הסיווג עבור בתי עסק אלו.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dark-text-muted">קטגוריה רצויה</label>
              <CategoryPicker
                value={bulkCategory}
                onChange={setBulkCategory}
                placeholder="בחר קטגוריה או תת-קטגוריה..."
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBulkCategoryModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-dark-border light:border-light-border text-xs font-medium"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleApplyBulkCategory}
                disabled={!bulkCategory || savingBulk}
                className="flex-1 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-primary-hover disabled:opacity-50 transition-colors"
              >
                {savingBulk ? 'מעדכן...' : `החל על ${selectedCount} תנועות`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-over Transaction Drawer */}
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

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-dark-text-muted">טוען תנועות...</div>}>
      <TransactionsContent />
    </Suspense>
  );
}
