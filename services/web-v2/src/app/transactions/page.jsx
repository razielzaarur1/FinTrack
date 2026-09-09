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
  Square,
  Check
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatILS, formatDate } from '@/lib/formatters';
import { useApp } from '@/lib/app-context';
import CategoryBadge from '@/components/common/CategoryBadge';
import CategoryPicker from '@/components/common/CategoryPicker';
import InstitutionLogo from '@/components/common/InstitutionLogo';
import MultiSelectDropdown from '@/components/common/MultiSelectDropdown';
import TransactionDrawer from '@/components/transactions/TransactionDrawer';
import { CATEGORIES_DATA } from '@/lib/categories';

function TransactionsContent() {
  const { t, lang } = useApp();
  const searchParams = useSearchParams();
  const initialAccountId = searchParams?.get('accountId');

  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [nextCursorId, setNextCursorId] = useState(null);
  const [hasNextPage, setHasNextPage] = useState(true);

  // Filters State (Supports Multi-Select)
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all'); // all, expense, income
  const [selectedAccountIds, setSelectedAccountIds] = useState(initialAccountId ? [initialAccountId] : []);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [datePreset, setDatePreset] = useState('all'); // all, current_month, last_month, last_90, custom
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // UI State
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);
  const [selectMode, setSelectMode] = useState(false);

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

  // Load user accounts for filter options
  useEffect(() => {
    api.getAccounts().then((res) => {
      if (res.data) setAccounts(res.data);
    });
  }, []);

  // Update account filter if URL param changes
  useEffect(() => {
    const accParam = searchParams?.get('accountId');
    if (accParam) {
      setSelectedAccountIds([accParam]);
      setShowFilters(true);
    }
  }, [searchParams]);

  // Options for Account Multi-Select
  const accountOptions = useMemo(() => {
    return accounts.map((acc) => ({
      id: acc.id,
      label: acc.displayName || acc.bankCompany,
      secondaryLabel: acc.accountNumber ? `•••• ${acc.accountNumber.slice(-4)}` : undefined,
      icon: <InstitutionLogo institution={acc.bankCompany} size={18} />,
    }));
  }, [accounts]);

  // Options for Category Multi-Select
  const categoryOptions = useMemo(() => {
    const list = [];
    CATEGORIES_DATA.expenses.forEach((cat) => {
      list.push({
        id: cat.name,
        label: cat.name,
        secondaryLabel: 'הוצאה',
        icon: <CategoryBadge category={cat.name} size={18} />,
      });
    });
    CATEGORIES_DATA.incomes.forEach((cat) => {
      list.push({
        id: cat.name,
        label: cat.name,
        secondaryLabel: 'הכנסה',
        icon: <CategoryBadge category={cat.name} size={18} />,
      });
    });
    return list;
  }, []);

  // Compute active filters count
  const activeFiltersCount = [
    search.trim() ? 1 : 0,
    type !== 'all' ? 1 : 0,
    selectedAccountIds.length > 0 ? selectedAccountIds.length : 0,
    selectedCategories.length > 0 ? selectedCategories.length : 0,
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
      const s = new Date(now.getTime() - 90 * 24 * 60 * 1000);
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
        accountIds: selectedAccountIds.length > 0 ? selectedAccountIds : undefined,
        categories: selectedCategories.length > 0 ? selectedCategories : undefined,
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
  }, [type, selectedAccountIds, selectedCategories, datePreset, startDate, endDate]);

  const handleSearchSubmit = (e) => {
    e?.preventDefault();
    loadTransactions(null, null, true);
  };

  const handleResetFilters = () => {
    setSearch('');
    setType('all');
    setSelectedAccountIds([]);
    setSelectedCategories([]);
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
          {/* Select Mode Toggle Button */}
          <button
            onClick={() => {
              if (selectMode) {
                setSelectedIds(new Set());
              }
              setSelectMode(!selectMode);
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs font-semibold shadow-sm transition-all ${
              selectMode
                ? 'bg-brand-primary text-white border-brand-primary shadow-brand-primary/20'
                : 'bg-dark-surface light:bg-light-surface border-dark-border light:border-light-border text-dark-text hover:border-brand-primary/40'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>{selectMode ? 'ביטול בחירה' : 'מצב בחירה'}</span>
          </button>

          <button
            onClick={() => loadTransactions(null, null, true)}
            disabled={loading}
            className="p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text-muted hover:text-dark-text shadow-sm transition-colors"
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
      <div className="p-3 sm:p-4 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-center gap-2.5">
          {/* Free-text Search Input */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-dark-text-muted light:text-light-text-muted absolute right-3 rtl:right-3 ltr:left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חפש לפי שם בית עסק, תיאור, הערות או סכום..."
              className="w-full py-2.5 rtl:pr-9 rtl:pl-9 ltr:pl-9 ltr:pr-9 rounded-xl border border-dark-border/80 light:border-light-border/80 bg-dark-surface-elevated/70 light:bg-light-surface-elevated/70 text-xs sm:text-sm focus:outline-none focus:border-brand-primary"
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); loadTransactions(null, null, true); }}
                className="absolute left-3 rtl:left-3 ltr:right-3 top-1/2 -translate-y-1/2 text-dark-text-muted hover:text-dark-text p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>

          {/* Action Row on Mobile / Inline on Desktop */}
          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            {/* Type Toggle Buttons */}
            <div className="flex-1 sm:flex-initial flex rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated p-1 text-xs justify-center">
              <button
                onClick={() => setType('all')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-semibold text-center transition-all ${
                  type === 'all' ? 'bg-brand-primary text-white shadow-sm' : 'text-dark-text-muted hover:text-dark-text'
                }`}
              >
                הכל
              </button>
              <button
                onClick={() => setType('expense')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-semibold text-center transition-all ${
                  type === 'expense' ? 'bg-rose-500 text-white shadow-sm' : 'text-dark-text-muted hover:text-dark-text'
                }`}
              >
                הוצאות
              </button>
              <button
                onClick={() => setType('income')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-semibold text-center transition-all ${
                  type === 'income' ? 'bg-emerald-600 text-white shadow-sm' : 'text-dark-text-muted hover:text-dark-text'
                }`}
              >
                הכנסות
              </button>
            </div>

            {/* Toggle Advanced Filters Button */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all shrink-0 justify-center ${
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
        </div>

        {/* Expandable Advanced Multi-Select Filters */}
        {showFilters && (
          <div className="pt-3 border-t border-dark-border/60 light:border-light-border/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-in fade-in duration-200">
            {/* 1. Account / Card Multi-Select Filter */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-dark-text-muted flex items-center gap-1">
                <CreditCard className="w-3 h-3 text-indigo-400" />
                <span>חשבונות וכרטיסים (בחירה מרובה)</span>
              </label>
              <MultiSelectDropdown
                label="בחר חשבונות"
                options={accountOptions}
                selectedValues={selectedAccountIds}
                onChange={setSelectedAccountIds}
                placeholder="הכל"
                icon={CreditCard}
                className="w-full"
              />
            </div>

            {/* 2. Category Multi-Select Filter */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-dark-text-muted flex items-center gap-1">
                <Tag className="w-3 h-3 text-pink-400" />
                <span>קטגוריות (בחירה מרובה)</span>
              </label>
              <MultiSelectDropdown
                label="בחר קטגוריות"
                options={categoryOptions}
                selectedValues={selectedCategories}
                onChange={setSelectedCategories}
                placeholder="הכל"
                icon={Tag}
                className="w-full"
              />
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
                  className="w-1/2 p-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none font-mono"
                />
                <span className="text-dark-text-muted text-xs">-</span>
                <input
                  type="number"
                  placeholder="עד"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  onBlur={() => loadTransactions(null, null, true)}
                  className="w-1/2 p-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none font-mono"
                />
              </div>
            </div>

            {/* 4. Date Filter */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-dark-text-muted flex items-center gap-1">
                <Calendar className="w-3 h-3 text-sky-400" />
                <span>תקופה ותאריכים</span>
              </label>
              <select
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value)}
                className="w-full p-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-xs font-medium focus:outline-none focus:border-brand-primary cursor-pointer"
              >
                <option value="all">כל הזמנים</option>
                <option value="current_month">חודש נוכחי</option>
                <option value="last_month">חודש שעבר</option>
                <option value="last_90">90 ימים אחרונים</option>
                <option value="custom">טווח תאריכים מותאם אישית...</option>
              </select>
            </div>

            {datePreset === 'custom' && (
              <div className="col-span-full flex items-center gap-2 pt-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="p-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated text-xs"
                />
                <span className="text-xs text-dark-text-muted">עד</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="p-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated text-xs"
                />
              </div>
            )}
          </div>
        )}

        {/* Active Filter Badges */}
        {activeFiltersCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] text-dark-text-muted light:text-light-text-muted font-medium">
              מסננים פעילים:
            </span>

            {search && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-dark-surface-elevated border border-dark-border text-[11px]">
                <span>חיפוש: "{search}"</span>
                <button onClick={() => { setSearch(''); loadTransactions(null, null, true); }}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {type !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-primary/15 text-brand-primary font-medium text-[11px]">
                <span>סוג: {type === 'expense' ? 'הוצאות' : 'הכנסות'}</span>
                <button onClick={() => setType('all')}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {selectedAccountIds.map((accId) => {
              const acc = accounts.find((a) => a.id === accId);
              return (
                <span key={accId} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-400 font-medium text-[11px]">
                  <span>{acc?.displayName || acc?.bankCompany || 'חשבון'}</span>
                  <button onClick={() => setSelectedAccountIds(selectedAccountIds.filter((id) => id !== accId))}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}

            {selectedCategories.map((catName) => (
              <span key={catName} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-pink-500/15 text-pink-400 font-medium text-[11px]">
                <span>{catName}</span>
                <button onClick={() => setSelectedCategories(selectedCategories.filter((c) => c !== catName))}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

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
        {/* Select All & Multi-select Header Bar (Shown only in selectMode) */}
        {selectMode && transactions.length > 0 && (
          <div className="px-4 py-2.5 bg-dark-surface-elevated/80 light:bg-light-surface-elevated/80 border-b border-dark-border/60 light:border-light-border/60 flex items-center justify-between text-xs text-dark-text-muted light:text-light-text-muted animate-in fade-in duration-150">
            <div className="flex items-center gap-2.5">
              {/* Custom Squircle Checkbox for Select All */}
              <button
                type="button"
                onClick={toggleSelectAll}
                className={`w-5 h-5 rounded-lg flex items-center justify-center transition-all ${
                  selectedIds.size === transactions.length && transactions.length > 0
                    ? 'bg-brand-primary text-white shadow-sm ring-2 ring-brand-primary/30'
                    : 'border-2 border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface'
                }`}
                title="סמן את כל התנועות"
              >
                {selectedIds.size === transactions.length && transactions.length > 0 && (
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                )}
              </button>

              <span className="font-semibold text-dark-text light:text-light-text">
                {selectedCount > 0 ? `נבחרו ${selectedCount} מתוך ${transactions.length}` : `סמן הכל (${transactions.length})`}
              </span>
            </div>
            {selectedCount > 0 && (
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-[11px] text-brand-primary hover:underline font-semibold"
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
              const merchantTitle = tx.userDescription || tx.merchantName || tx.description || 'ללא תיאור';
              const subDescription = tx.description && tx.description !== merchantTitle ? tx.description : null;
              const isAtm = Boolean(tx.isCashWithdrawal || (tx.merchantName && tx.merchantName.includes('משיכת מזומן')));

              return (
                <div
                  key={tx.id}
                  ref={isLast ? lastTxRef : null}
                  onClick={() => {
                    if (selectMode) {
                      toggleSelect(tx.id);
                    } else {
                      setSelectedTx(tx);
                    }
                  }}
                  className={`p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-dark-surface-elevated/70 light:hover:bg-light-surface-elevated/70 transition-colors cursor-pointer group ${
                    isSelected ? 'bg-brand-primary/5 dark:bg-brand-primary/10' : ''
                  }`}
                >
                  {/* Right side (in RTL): Checkbox (if in selectMode) + Category Icon + Merchant Name + Details */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {selectMode && (
                      <button
                        type="button"
                        onClick={(e) => toggleSelect(tx.id, e)}
                        className={`w-5 h-5 rounded-lg flex items-center justify-center transition-all shrink-0 ${
                          isSelected
                            ? 'bg-brand-primary text-white shadow-sm ring-2 ring-brand-primary/30'
                            : 'border-2 border-dark-border light:border-light-border hover:border-brand-primary/60 bg-dark-surface light:bg-light-surface'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </button>
                    )}

                    <CategoryBadge category={tx.category} size={20} className="shrink-0" />

                    <div className="min-w-0 flex-1">
                      {/* Merchant Store Name (Headline) + Badges */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-xs sm:text-sm text-dark-text light:text-light-text truncate max-w-[180px] sm:max-w-xs">
                          {merchantTitle}
                        </span>

                        {isAtm && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-500 dark:text-amber-400 text-[10px] font-bold inline-flex items-center gap-0.5 shrink-0" title="משיכת מזומן">
                            <span>💵</span>
                            <span>מזומן</span>
                          </span>
                        )}

                        {tx.isSplit && (
                          <span className="px-1.5 py-0.2 rounded bg-brand-primary/20 text-brand-primary text-[10px] font-medium shrink-0" title="מפוצלת">
                            מפוצלת
                          </span>
                        )}
                        {tx.hasLinks && (
                          <span className="p-0.5 rounded bg-brand-cyan/20 text-brand-cyan text-[10px] shrink-0" title="מקושרת">
                            <Link2 className="w-3 h-3" />
                          </span>
                        )}
                        {tx.hasNotes && (
                          <span className="p-0.5 rounded bg-brand-amber/20 text-brand-amber text-[10px] shrink-0" title="הערות">
                            <MessageSquare className="w-3 h-3" />
                          </span>
                        )}
                        {tx.status === 'pending' && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-500 text-[10px] font-medium shrink-0">
                            <Clock className="w-2.5 h-2.5" />
                            <span>ממתין</span>
                          </span>
                        )}
                      </div>

                      {/* Subtitle: Date + Account + Category */}
                      <div className="text-[11px] text-dark-text-muted light:text-light-text-muted flex items-center gap-1.5 mt-0.5 truncate">
                        {subDescription && (
                          <>
                            <span className="hidden sm:inline text-dark-text/75 truncate max-w-[140px]">
                              {subDescription}
                            </span>
                            <span className="hidden sm:inline">•</span>
                          </>
                        )}
                        <span className="shrink-0">{formatDate(tx.date, lang)}</span>
                        <span>•</span>
                        <span className="truncate max-w-[110px] sm:max-w-none font-mono">
                          {tx.accountDisplayName || tx.bankCompany}
                          {tx.accountNumber ? ` (${tx.accountNumber.slice(-4)})` : ''}
                        </span>
                        <span>•</span>
                        <span className="px-1.5 py-0.2 rounded bg-dark-surface-elevated light:bg-light-surface-elevated text-[10px] truncate max-w-[100px] sm:max-w-none">
                          {tx.category || 'ללא סיווג'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Left side (in RTL): Transaction Amount */}
                  <div className="shrink-0 text-left ltr:text-right rtl:mr-1 ltr:ml-1">
                    <div 
                      className={`text-sm sm:text-base font-bold font-mono tracking-tight ${
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
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-2xl w-[92%] sm:w-auto bg-dark-surface light:bg-light-surface border border-brand-primary/40 rounded-2xl shadow-2xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-brand-primary/15 text-brand-primary font-bold flex items-center justify-center text-xs sm:text-sm shadow-xs shrink-0">
              {selectedCount}
            </span>
            <div className="min-w-0">
              <div className="text-[11px] text-dark-text-muted light:text-light-text-muted">
                {selectedCount} נבחרו • סך:
              </div>
              <div className="text-base sm:text-lg font-bold text-brand-primary font-mono" dir="ltr">
                {formatILS(totalSelectedSum)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setBulkCategoryModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-primary-hover transition-colors flex items-center gap-1.5 shadow-sm shrink-0"
            >
              <Tag className="w-3.5 h-3.5" />
              <span>שנה קטגוריה</span>
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-2 rounded-xl border border-dark-border light:border-light-border hover:bg-dark-surface-elevated text-xs font-medium transition-colors text-dark-text-muted hover:text-dark-text shrink-0"
            >
              בטל
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
