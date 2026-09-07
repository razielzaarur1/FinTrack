'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Filter,
  Download,
  Calendar,
  Tag,
  ArrowUpDown,
  CreditCard,
  Landmark,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  X,
  FileSpreadsheet,
  FileCode,
  Info,
  CheckCircle2,
  AlertCircle,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  Check,
} from 'lucide-react';
import {
  getTransactions,
  getAccounts,
  updateTransactionCategory,
  formatILS,
  formatDate,
} from '../../lib/api';
import { ISRAELI_INSTITUTIONS, CATEGORIES } from '../../lib/types';
import QuickActionModal from '../../components/dashboard/QuickActionModal';

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedType, setSelectedType] = useState('all'); // 'all' | 'expense' | 'income'
  const [datePreset, setDatePreset] = useState('all'); // 'all' | 'this_month' | 'last_month' | '3_months' | 'custom'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all'); // 'all' | 'completed' | 'pending'

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Sorting
  const [sortBy, setSortBy] = useState('date'); // 'date' | 'amount'
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc' | 'desc'

  // Selected Transaction for Details Drawer/Modal
  const [selectedTx, setSelectedTx] = useState(null);
  const [activeCategoryPopoverTxId, setActiveCategoryPopoverTxId] = useState(null);
  const [copiedId, setCopiedId] = useState(false);
  const [isAddTxOpen, setIsAddTxOpen] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [txRes, accs] = await Promise.all([getTransactions(), getAccounts()]);
        setTransactions(txRes?.data || []);
        setAccounts(accs || []);
      } catch (err) {
        console.error('Failed to load transactions:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Filter and Sort Transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // 1. Search query (description, merchant, amount, externalId, id)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const descMatch = tx.description?.toLowerCase().includes(q);
        const merchantMatch = tx.merchantName?.toLowerCase().includes(q);
        const amountMatch = tx.amount.toString().includes(q);
        const idMatch = tx.id?.toLowerCase().includes(q) || tx.externalId?.toLowerCase().includes(q);
        if (!descMatch && !merchantMatch && !amountMatch && !idMatch) return false;
      }

      // 2. Account filter
      if (selectedAccount !== 'all' && tx.accountId !== selectedAccount) {
        return false;
      }

      // 3. Category filter
      if (selectedCategory !== 'all' && tx.category !== selectedCategory) {
        return false;
      }

      // 4. Type filter
      if (selectedType === 'expense' && tx.amount > 0) return false;
      if (selectedType === 'income' && tx.amount < 0) return false;

      // 5. Status filter
      if (selectedStatus !== 'all' && tx.status !== selectedStatus) {
        return false;
      }

      // 6. Date Presets
      if (datePreset !== 'all' && tx.date) {
        const txDate = new Date(tx.date);
        const now = new Date();

        if (datePreset === 'this_month') {
          if (
            txDate.getMonth() !== now.getMonth() ||
            txDate.getFullYear() !== now.getFullYear()
          ) {
            return false;
          }
        } else if (datePreset === 'last_month') {
          const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          if (
            txDate.getMonth() !== lastMonth.getMonth() ||
            txDate.getFullYear() !== lastMonth.getFullYear()
          ) {
            return false;
          }
        } else if (datePreset === '3_months') {
          const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
          if (txDate < threeMonthsAgo) return false;
        } else if (datePreset === 'custom') {
          if (customStartDate && new Date(tx.date) < new Date(customStartDate)) return false;
          if (customEndDate && new Date(tx.date) > new Date(customEndDate)) return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'date') {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      } else if (sortBy === 'amount') {
        const amtA = Math.abs(a.amount);
        const amtB = Math.abs(b.amount);
        return sortOrder === 'desc' ? amtB - amtA : amtA - amtB;
      }
      return 0;
    });
  }, [
    transactions,
    searchQuery,
    selectedAccount,
    selectedCategory,
    selectedType,
    datePreset,
    customStartDate,
    customEndDate,
    selectedStatus,
    sortBy,
    sortOrder,
  ]);

  // Aggregate stats for filtered data
  const summaryStats = useMemo(() => {
    let totalExpenses = 0;
    let totalIncome = 0;
    filteredTransactions.forEach((t) => {
      if (t.amount < 0) totalExpenses += Math.abs(t.amount);
      else totalIncome += t.amount;
    });
    return {
      count: filteredTransactions.length,
      totalExpenses,
      totalIncome,
      net: totalIncome - totalExpenses,
    };
  }, [filteredTransactions]);

  // Paginated Slices
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / itemsPerPage));
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTransactions.slice(start, start + itemsPerPage);
  }, [filteredTransactions, currentPage, itemsPerPage]);

  const handleUpdateCategory = async (txId, newCategory) => {
    try {
      await updateTransactionCategory(txId, newCategory);
      setTransactions((prev) =>
        prev.map((t) => (t.id === txId ? { ...t, category: newCategory } : t))
      );
      if (selectedTx && selectedTx.id === txId) {
        setSelectedTx((prev) => ({ ...prev, category: newCategory }));
      }
      setActiveCategoryPopoverTxId(null);
    } catch (e) {
      console.error('Failed updating category:', e);
    }
  };

  const handleExportCSV = () => {
    // UTF-8 BOM so Hebrew is preserved in Excel
    const BOM = '\uFEFF';
    const headers = ['תאריך', 'תיאור בית עסק', 'חשבון', 'קטגוריה', 'סכום (₪)', 'סוג', 'סטטוס', 'מזהה ייחודי'];
    const rows = filteredTransactions.map((t) => [
      t.date,
      `"${t.description?.replace(/"/g, '""') || ''}"`,
      `"${getAccountName(t.accountId)}"`,
      `"${t.category || ''}"`,
      t.amount,
      t.amount < 0 ? 'הוצאה' : 'הכנסה',
      t.status === 'completed' ? 'הושלם' : 'בהמתנה',
      t.id,
    ]);

    const csvContent = BOM + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `fintrack-transactions-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJSON = () => {
    const dataStr = JSON.stringify(filteredTransactions, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `fintrack-transactions-${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedAccount('all');
    setSelectedCategory('all');
    setSelectedType('all');
    setDatePreset('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setSelectedStatus('all');
    setCurrentPage(1);
  };

  const getAccountName = (accId) => {
    const acc = accounts.find((a) => a.id === accId);
    return acc?.displayName || acc?.bankCompany || 'חשבון כללי';
  };

  const getAccountInstitution = (accId) => {
    const acc = accounts.find((a) => a.id === accId);
    if (!acc) return null;
    return ISRAELI_INSTITUTIONS[acc.bankCompany] || null;
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* ── 1. PAGE HEADER & ACTIONS ──────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-5 sm:p-6 rounded-3xl border border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              תנועות ועסקאות
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-blue/20 text-brand-blue-light border border-brand-blue/30">
              {filteredTransactions.length} תנועות
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            מעקב, סינון וסיווג חכם של כל הפעולות הפיננסיות מכל הבנקים וכרטיסי האשראי
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setIsAddTxOpen(true)}
            className="px-3.5 py-2 rounded-xl glass-button text-xs font-semibold flex items-center gap-1.5 shadow-glow-blue"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>הוסף תנועה ידנית</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="px-3 py-2 rounded-xl glass-button-secondary text-xs font-medium flex items-center gap-1.5 hover:text-white"
            title="ייצא כקובץ Excel / CSV"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>ייצא CSV</span>
          </button>

          <button
            onClick={handleExportJSON}
            className="px-3 py-2 rounded-xl glass-button-secondary text-xs font-medium flex items-center gap-1.5 hover:text-white"
            title="ייצא כקובץ JSON"
          >
            <FileCode className="w-3.5 h-3.5 text-brand-cyan" />
            <span>JSON</span>
          </button>
        </div>
      </div>

      {/* ── 2. SUMMARY STRIP (KPIs for Filtered Results) ──────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-card p-3.5 rounded-2xl border border-white/10">
          <span className="text-[11px] text-slate-400 block mb-1">סה״כ תנועות בסינון</span>
          <div className="text-lg font-bold text-white num-he">{summaryStats.count}</div>
        </div>
        <div className="glass-card p-3.5 rounded-2xl border border-white/10">
          <span className="text-[11px] text-slate-400 block mb-1">סה״כ הוצאות</span>
          <div className="text-lg font-bold text-rose-400 num-he">
            {formatILS(summaryStats.totalExpenses)}
          </div>
        </div>
        <div className="glass-card p-3.5 rounded-2xl border border-white/10">
          <span className="text-[11px] text-slate-400 block mb-1">סה״כ הכנסות</span>
          <div className="text-lg font-bold text-emerald-400 num-he">
            {formatILS(summaryStats.totalIncome, { showSign: true })}
          </div>
        </div>
        <div className="glass-card p-3.5 rounded-2xl border border-white/10">
          <span className="text-[11px] text-slate-400 block mb-1">מאזן נטו</span>
          <div
            className={`text-lg font-bold num-he ${
              summaryStats.net >= 0 ? 'text-brand-cyan' : 'text-rose-400'
            }`}
          >
            {formatILS(summaryStats.net, { showSign: true })}
          </div>
        </div>
      </div>

      {/* ── 3. SEARCH & ADVANCED FILTERS BAR ──────────────────────────────── */}
      <div className="glass-card p-4 sm:p-5 rounded-3xl border border-white/10 space-y-3.5">
        {/* Search Input Row */}
        <div className="relative">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="חיפוש חופשי לפי שם בית עסק, תיאור, סכום או מזהה עסקה..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pr-10 pl-4 py-2.5 rounded-2xl glass-input text-sm text-white placeholder-slate-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Dropdowns Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
          {/* Account Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">חשבון / כרטיס</label>
            <select
              value={selectedAccount}
              onChange={(e) => {
                setSelectedAccount(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full p-2 rounded-xl glass-input text-xs text-white bg-navy-900"
            >
              <option value="all">כל החשבונות ({accounts.length})</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id} className="bg-navy-900 text-white">
                  {acc.displayName || acc.bankCompany}
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">קטגוריה</label>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full p-2 rounded-xl glass-input text-xs text-white bg-navy-900"
            >
              <option value="all">כל הקטגוריות</option>
              {CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.name} className="bg-navy-900 text-white">
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">סוג תנועה</label>
            <select
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full p-2 rounded-xl glass-input text-xs text-white bg-navy-900"
            >
              <option value="all">הכל (הכנסות והוצאות)</option>
              <option value="expense">הוצאות בלבד (-₪)</option>
              <option value="income">הכנסות בלבד (+₪)</option>
            </select>
          </div>

          {/* Date Preset */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">טווח תאריכים</label>
            <select
              value={datePreset}
              onChange={(e) => {
                setDatePreset(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full p-2 rounded-xl glass-input text-xs text-white bg-navy-900"
            >
              <option value="all">כל הזמנים</option>
              <option value="this_month">החודש הנוכחי</option>
              <option value="last_month">חודש שעבר</option>
              <option value="3_months">3 חודשים אחרונים</option>
              <option value="custom">מותאם אישית...</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">סטטוס</label>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full p-2 rounded-xl glass-input text-xs text-white bg-navy-900"
            >
              <option value="all">כל הסטטוסים</option>
              <option value="completed">הושלם בהצלחה</option>
              <option value="pending">בהמתנה / עתידי</option>
            </select>
          </div>

          {/* Reset Action */}
          <div className="flex flex-col justify-end">
            <button
              onClick={resetFilters}
              className="w-full py-2 px-3 rounded-xl glass-button-secondary text-xs font-medium text-slate-300 hover:text-white flex items-center justify-center gap-1"
            >
              <X className="w-3 h-3" />
              <span>נקה סינונים</span>
            </button>
          </div>
        </div>

        {/* Custom Date Inputs (Conditional) */}
        {datePreset === 'custom' && (
          <div className="pt-2 border-t border-white/10 flex items-center gap-3 text-xs flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">מתאריך:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg glass-input text-xs text-white bg-navy-900"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">עד תאריך:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg glass-input text-xs text-white bg-navy-900"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── 4. RESPONSIVE TRANSACTIONS TABLE & MOBILE CARDS ───────────────── */}
      <div className="glass-card rounded-3xl border border-white/10 overflow-hidden">
        {/* Sorting & Item Count Bar */}
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between text-xs text-slate-400 flex-wrap gap-2 bg-navy-950/40">
          <div className="flex items-center gap-2">
            <span>
              מציג <strong>{paginatedTransactions.length}</strong> מתוך{' '}
              <strong>{filteredTransactions.length}</strong> תנועות
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Sort Toggle */}
            <div className="flex items-center gap-1.5">
              <span>מיון לפי:</span>
              <button
                onClick={() => {
                  if (sortBy === 'date') setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                  else {
                    setSortBy('date');
                    setSortOrder('desc');
                  }
                }}
                className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                  sortBy === 'date' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>תאריך</span>
                <ArrowUpDown className="w-3 h-3" />
              </button>
              <button
                onClick={() => {
                  if (sortBy === 'amount') setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                  else {
                    setSortBy('amount');
                    setSortOrder('desc');
                  }
                }}
                className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                  sortBy === 'amount' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>סכום</span>
                <ArrowUpDown className="w-3 h-3" />
              </button>
            </div>

            {/* Items Per Page */}
            <div className="flex items-center gap-1.5">
              <span>לעמוד:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(parseInt(e.target.value, 10));
                  setCurrentPage(1);
                }}
                className="bg-navy-900 text-white rounded-lg px-2 py-1 text-xs border border-white/10"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>

        {/* Empty State */}
        {paginatedTransactions.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <AlertCircle className="w-10 h-10 mx-auto text-slate-500 mb-3" />
            <p className="text-sm font-semibold text-white">לא נמצאו תנועות התואמות את החיפוש</p>
            <p className="text-xs text-slate-400 mt-1">נסה לשנות את מסנני התאריכים, הקטגוריה או החשבון</p>
            <button
              onClick={resetFilters}
              className="mt-4 px-4 py-2 rounded-xl glass-button text-xs font-semibold"
            >
              איפוס כל המסננים
            </button>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-right border-collapse text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-navy-950/20 text-xs font-semibold text-slate-400">
                    <th className="py-3.5 px-4">תאריך</th>
                    <th className="py-3.5 px-4">בית עסק / תיאור</th>
                    <th className="py-3.5 px-4">חשבון / כרטיס</th>
                    <th className="py-3.5 px-4">קטגוריה</th>
                    <th className="py-3.5 px-4 text-left">סכום (₪)</th>
                    <th className="py-3.5 px-4 text-center">פעולות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {paginatedTransactions.map((tx) => {
                    const isIncome = tx.amount > 0;
                    const institution = getAccountInstitution(tx.accountId);
                    const isPopoverOpen = activeCategoryPopoverTxId === tx.id;

                    return (
                      <tr
                        key={tx.id}
                        className="hover:bg-white/5 transition-colors group cursor-pointer"
                        onClick={() => setSelectedTx(tx)}
                      >
                        {/* Date */}
                        <td className="py-3.5 px-4 text-xs text-slate-300 whitespace-nowrap">
                          {formatDate(tx.date)}
                        </td>

                        {/* Merchant & Description */}
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-white group-hover:text-brand-blue-light transition-colors">
                            {tx.merchantName || tx.description}
                          </div>
                          {tx.merchantName && tx.merchantName !== tx.description && (
                            <div className="text-[11px] text-slate-400 truncate max-w-xs">
                              {tx.description}
                            </div>
                          )}
                        </td>

                        {/* Account Badge */}
                        <td className="py-3.5 px-4">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-navy-800/80 border border-white/10 text-xs text-slate-200">
                            {institution ? (
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: institution.color }}
                              />
                            ) : (
                              <Landmark className="w-3 h-3 text-brand-cyan" />
                            )}
                            <span className="truncate">{getAccountName(tx.accountId)}</span>
                          </div>
                        </td>

                        {/* Category with Inline Popover Selector */}
                        <td
                          className="py-3.5 px-4 relative"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="relative inline-block">
                            <button
                              onClick={() =>
                                setActiveCategoryPopoverTxId(isPopoverOpen ? null : tx.id)
                              }
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-xs text-slate-300 transition-colors"
                              title="לחץ לשינוי קטגוריה"
                            >
                              <Tag className="w-3 h-3 text-brand-cyan" />
                              <span>{tx.category}</span>
                            </button>

                            {/* Category Selector Popover */}
                            {isPopoverOpen && (
                              <div className="absolute top-full right-0 mt-1 z-30 w-52 rounded-2xl bg-navy-900 border border-white/20 shadow-2xl p-2.5 space-y-1 text-right animate-fade-in">
                                <div className="text-[10px] font-bold text-slate-400 px-2 py-1">
                                  סווג לקטגוריה:
                                </div>
                                <div className="max-h-48 overflow-y-auto space-y-1">
                                  {CATEGORIES.map((cat) => (
                                    <button
                                      key={cat.id}
                                      onClick={() => handleUpdateCategory(tx.id, cat.name)}
                                      className={`w-full text-right px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                                        tx.category === cat.name
                                          ? 'bg-brand-blue/30 text-white font-bold'
                                          : 'hover:bg-white/10 text-slate-300'
                                      }`}
                                    >
                                      <span>{cat.name}</span>
                                      {tx.category === cat.name && (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-brand-cyan" />
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Amount */}
                        <td className="py-3.5 px-4 text-left">
                          <span
                            className={`font-bold num-he text-sm ${
                              isIncome ? 'text-emerald-400' : 'text-slate-100'
                            }`}
                          >
                            {formatILS(tx.amount, { showSign: true })}
                          </span>
                        </td>

                        {/* Actions */}
                        <td
                          className="py-3.5 px-4 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => setSelectedTx(tx)}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                            title="פרטים נוספים"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View */}
            <div className="md:hidden divide-y divide-white/5">
              {paginatedTransactions.map((tx) => {
                const isIncome = tx.amount > 0;
                const institution = getAccountInstitution(tx.accountId);

                return (
                  <div
                    key={tx.id}
                    onClick={() => setSelectedTx(tx)}
                    className="p-4 hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                          isIncome
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-navy-800 text-slate-300 border border-white/10'
                        }`}
                      >
                        {isIncome ? '₪+' : '₪-'}
                      </div>

                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">
                          {tx.merchantName || tx.description}
                        </div>
                        <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                          <span className="truncate">{getAccountName(tx.accountId)}</span>
                          <span>&bull;</span>
                          <span>{formatDate(tx.date)}</span>
                        </div>
                        <div className="mt-1">
                          <span className="inline-block text-[10px] px-2 py-0.5 rounded bg-white/10 text-slate-300">
                            {tx.category}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-left flex-shrink-0">
                      <div
                        className={`text-sm font-bold num-he ${
                          isIncome ? 'text-emerald-400' : 'text-slate-100'
                        }`}
                      >
                        {formatILS(tx.amount, { showSign: true })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── 5. PAGINATION CONTROLS ───────────────────────────────────────── */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-white/10 flex items-center justify-between gap-2 text-xs">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-xl glass-button-secondary font-medium flex items-center gap-1 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
              <span>הקודם</span>
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-8 h-8 rounded-xl font-semibold transition-all ${
                    currentPage === pageNum
                      ? 'bg-brand-blue text-white shadow-glow-blue'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {pageNum}
                </button>
              ))}
            </div>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-xl glass-button-secondary font-medium flex items-center gap-1 disabled:opacity-40"
            >
              <span>הבא</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* ── 6. TRANSACTION DETAILS MODAL / DRAWER ─────────────────────────── */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="relative w-full max-w-lg rounded-3xl bg-navy-900 border border-white/15 shadow-2xl p-6 sm:p-7 overflow-hidden text-right">
            {/* Glow Header Accent */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-brand-blue via-brand-cyan to-brand-emerald" />

            {/* Close Button */}
            <button
              onClick={() => setSelectedTx(null)}
              className="absolute top-4 left-4 p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              title="סגור פרטים"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3 mb-5">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-base ${
                  selectedTx.amount > 0
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-navy-800 text-slate-200 border border-white/10'
                }`}
              >
                {selectedTx.amount > 0 ? '₪+' : '₪-'}
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  {selectedTx.merchantName || selectedTx.description}
                </h3>
                <p className="text-xs text-slate-400">
                  {getAccountName(selectedTx.accountId)} &bull; {formatDate(selectedTx.date)}
                </p>
              </div>
            </div>

            {/* Amount Big Display */}
            <div className="p-4 rounded-2xl bg-navy-950/60 border border-white/10 mb-5 flex items-center justify-between">
              <span className="text-xs text-slate-400">סכום העסקה</span>
              <span
                className={`text-2xl font-bold num-he ${
                  selectedTx.amount > 0 ? 'text-emerald-400' : 'text-slate-100'
                }`}
              >
                {formatILS(selectedTx.amount, { showSign: true })}
              </span>
            </div>

            {/* Key-Value Details Grid */}
            <div className="space-y-2.5 text-xs mb-5">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5">
                <span className="text-slate-400">תיאור מקורי מהבנק</span>
                <span className="text-white font-medium">{selectedTx.description}</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5">
                <span className="text-slate-400">קטגוריה נוכחית</span>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedTx.category}
                    onChange={(e) => handleUpdateCategory(selectedTx.id, e.target.value)}
                    className="p-1 rounded-lg glass-input text-xs text-white bg-navy-900"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.name} className="bg-navy-900 text-white">
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5">
                <span className="text-slate-400">סטטוס סנכרון</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{selectedTx.status === 'completed' ? 'הושלם ונרשם' : 'בהמתנה'}</span>
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5">
                <span className="text-slate-400">מזהה תנועה (ID)</span>
                <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-300">
                  <span>{selectedTx.id}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(selectedTx.id);
                      setCopiedId(true);
                      setTimeout(() => setCopiedId(false), 2000);
                    }}
                    className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white"
                    title="העתק מזהה"
                  >
                    {copiedId ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Raw JSON Payload Viewer */}
            <div className="mb-5">
              <div className="text-[11px] font-bold text-slate-400 mb-1">
                מבנה נתונים גולמי (Raw Bank JSON):
              </div>
              <pre className="p-3 rounded-xl bg-navy-950/80 border border-white/10 text-[11px] font-mono text-brand-cyan overflow-x-auto dir-ltr text-left max-h-32">
                {JSON.stringify(selectedTx, null, 2)}
              </pre>
            </div>

            {/* Close Modal Action */}
            <button
              onClick={() => setSelectedTx(null)}
              className="w-full py-2.5 rounded-xl glass-button text-xs font-semibold"
            >
              סגור פרטים
            </button>
          </div>
        </div>
      )}

      {/* ── 7. ADD MANUAL TRANSACTION MODAL ──────────────────────────────── */}
      <QuickActionModal
        isOpen={isAddTxOpen}
        onClose={() => setIsAddTxOpen(false)}
        onTransactionAdded={(newTx) => {
          setTransactions((prev) => [newTx, ...prev]);
        }}
      />
    </div>
  );
}
