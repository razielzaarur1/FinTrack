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
  Check,
  Receipt,
  Coins,
  Banknote,
  EyeOff,
  Zap,
  ShieldAlert,
  AlertCircle
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatILS, formatDate, cleanSpacedHebrew, getTransactionTitle, formatCurrency, extractInstallmentInfo } from '@/lib/formatters';
import { useApp } from '@/lib/app-context';
import CategoryBadge from '@/components/common/CategoryBadge';
import CategoryPicker from '@/components/common/CategoryPicker';
import InstitutionLogo from '@/components/common/InstitutionLogo';
import MultiSelectDropdown from '@/components/common/MultiSelectDropdown';
import TransactionDrawer from '@/components/transactions/TransactionDrawer';
import { CATEGORIES_DATA, getCategoryDetails } from '@/lib/categories';

function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getMonthDateBounds(monthStr) {
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) return null;
  const [yStr, mStr] = monthStr.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const lastDay = new Date(y, m, 0).getDate();
  const start = `${yStr}-${mStr}-01`;
  const end = `${yStr}-${mStr}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

function TransactionsContent() {
  const { t, lang, expenseCategories, incomeCategories } = useApp();
  const searchParams = useSearchParams();
  const initialAccountId = searchParams?.get('accountId');
  const initialMonth = searchParams?.get('month');
  const initialStartDateParam = searchParams?.get('startDate');
  const initialEndDateParam = searchParams?.get('endDate');

  const initialBounds = getMonthDateBounds(initialMonth);
  const initStart = initialStartDateParam || (initialBounds ? initialBounds.start : '');
  const initEnd = initialEndDateParam || (initialBounds ? initialBounds.end : '');
  const initPreset = (initStart || initEnd) ? 'custom' : 'all';

  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [availableCurrencies, setAvailableCurrencies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [nextCursorId, setNextCursorId] = useState(null);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // Full-screen Linker Mode State
  const [linkingTx, setLinkingTx] = useState(null);
  const [linkingType, setLinkingType] = useState('refund');
  const [processingLinkId, setProcessingLinkId] = useState(null);

  // Filters State (Supports Multi-Select)
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [type, setType] = useState('all'); // all, expense, income
  const [selectedAccountIds, setSelectedAccountIds] = useState(initialAccountId ? [initialAccountId] : []);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedSpecialFilters, setSelectedSpecialFilters] = useState([]);
  const [ccLinkStatus, setCcLinkStatus] = useState('all'); // 'all' | 'linked' | 'unlinked'
  const [filterCounts, setFilterCounts] = useState({ accounts: {}, categories: {}, specials: {}, currencies: {} });
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [datePreset, setDatePreset] = useState(initPreset);
  const [startDate, setStartDate] = useState(initStart);
  const [endDate, setEndDate] = useState(initEnd);

  // Debounce search input for instant live search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  
  // UI State
  const [showFilters, setShowFilters] = useState(Boolean(initialAccountId || initStart || initEnd));
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
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('fintrack_tx_updated'));
        }
      }
    } finally {
      setSavingBulk(false);
    }
  };

  const observer = useRef();

  // Load user accounts, currencies, and filter counts
  useEffect(() => {
    api.getAccounts().then((res) => {
      if (res?.data && Array.isArray(res.data)) setAccounts(res.data);
    }).catch(() => {});
    api.getCurrencies().then((res) => {
      if (res?.data?.data && Array.isArray(res.data.data)) setAvailableCurrencies(res.data.data);
    }).catch(() => {});
    api.getFilterCounts().then((res) => {
      if (res?.data && typeof res.data === 'object' && !res.data.error) {
        setFilterCounts({
          accounts: res.data.accounts || {},
          categories: res.data.categories || {},
          specials: res.data.specials || {},
          currencies: res.data.currencies || {},
        });
      }
    }).catch(() => {});
  }, []);

  // Update filters if URL params change (accountId, month, startDate, endDate)
  useEffect(() => {
    const accParam = searchParams?.get('accountId');
    if (accParam) {
      setSelectedAccountIds([accParam]);
      setShowFilters(true);
    }
    const monthParam = searchParams?.get('month');
    const startParam = searchParams?.get('startDate');
    const endParam = searchParams?.get('endDate');

    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const bounds = getMonthDateBounds(monthParam);
      if (bounds) {
        setDatePreset('custom');
        setStartDate(bounds.start);
        setEndDate(bounds.end);
        setShowFilters(true);
      }
    } else if (startParam || endParam) {
      setDatePreset('custom');
      if (startParam) setStartDate(startParam);
      if (endParam) setEndDate(endParam);
      setShowFilters(true);
    }
  }, [searchParams]);

  // Synchronize Linking Mode from URL query params
  const linkingTxIdParam = searchParams?.get('linkingTxId');
  const linkTypeParam = searchParams?.get('linkType');

  useEffect(() => {
    if (linkingTxIdParam && (!linkingTx || linkingTx.id !== linkingTxIdParam)) {
      api.getTransaction(linkingTxIdParam).then((res) => {
        if (res.data?.data) {
          setLinkingTx(res.data.data);
          if (linkTypeParam) setLinkingType(linkTypeParam);
        }
      });
    }
  }, [linkingTxIdParam, linkTypeParam]);

  const handleStartLinking = ({ tx, linkType }) => {
    setSelectedTx(null);
    setLinkingTx(tx);
    setLinkingType(linkType || 'refund');
    window.history.pushState({}, '', `/transactions?linkingTxId=${tx.id}&linkType=${linkType || 'refund'}`);
  };

  const handleCancelLinking = () => {
    const prevTx = linkingTx;
    setLinkingTx(null);
    setLinkingType('refund');
    window.history.pushState({}, '', '/transactions');
    if (prevTx) {
      setSelectedTx(prevTx);
    }
  };

  const handleExecuteLink = async (targetTx, e) => {
    e?.stopPropagation();
    if (!linkingTx || processingLinkId) return;
    setProcessingLinkId(targetTx.id);
    try {
      const res = await api.linkTransaction(linkingTx.id, {
        targetTransactionId: targetTx.id,
        linkType: linkingType,
      });
      if (res.data) {
        const prevTx = linkingTx;
        setLinkingTx(null);
        setLinkingType('refund');
        window.history.pushState({}, '', '/transactions');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('fintrack_tx_updated'));
        }
        const updatedTxRes = await api.getTransaction(prevTx.id);
        setSelectedTx(updatedTxRes.data?.data || prevTx);
      }
    } catch (err) {
      console.error('Failed to link transaction:', err);
    } finally {
      setProcessingLinkId(null);
    }
  };

  // Real-time listener for transaction updates
  useEffect(() => {
    const handleSync = () => {
      loadTransactions(null, null, true);
      api.getFilterCounts().then((res) => {
        if (res?.data && typeof res.data === 'object' && !res.data.error) {
          setFilterCounts({
            accounts: res.data.accounts || {},
            categories: res.data.categories || {},
            specials: res.data.specials || {},
            currencies: res.data.currencies || {},
          });
        }
      }).catch(() => {});
    };
    window.addEventListener('fintrack_tx_updated', handleSync);
    return () => {
      window.removeEventListener('fintrack_tx_updated', handleSync);
    };
  }, [type, selectedAccountIds, selectedCategories, selectedSpecialFilters, ccLinkStatus, datePreset, startDate, endDate]);

  // Options for Account Multi-Select
  const accountOptions = useMemo(() => {
    return accounts.map((acc) => ({
      id: acc.id,
      label: acc.displayName || acc.bankCompany,
      secondaryLabel: acc.accountNumber ? `•••• ${acc.accountNumber.slice(-4)}` : undefined,
      count: filterCounts.accounts?.[acc.id] ?? 0,
      icon: <InstitutionLogo institution={acc.bankCompany} size={18} />,
    }));
  }, [accounts, filterCounts.accounts]);

  // Options for Category Multi-Select
  const categoryOptions = useMemo(() => {
    const list = [];
    const expenses = (expenseCategories && expenseCategories.length > 0) ? expenseCategories : CATEGORIES_DATA.expenses;
    const incomes = (incomeCategories && incomeCategories.length > 0) ? incomeCategories : CATEGORIES_DATA.incomes;

    expenses.forEach((cat) => {
      if (cat.isActive === false) return;
      list.push({
        id: cat.name,
        label: cat.name,
        secondaryLabel: 'הוצאה',
        count: filterCounts.categories?.[cat.name] ?? 0,
        icon: <CategoryBadge category={cat.name} customSvg={cat.customSvg} size={18} />,
      });
      if (cat.subs && cat.subs.length > 0) {
        cat.subs.forEach((sub) => {
          if (sub.isActive === false) return;
          list.push({
            id: sub.name,
            label: `  ↳ ${sub.name}`,
            secondaryLabel: cat.name,
            count: filterCounts.categories?.[sub.name] ?? 0,
            icon: <CategoryBadge category={sub.name} customSvg={sub.customSvg} size={16} />,
          });
        });
      }
    });

    incomes.forEach((cat) => {
      if (cat.isActive === false) return;
      list.push({
        id: cat.name,
        label: cat.name,
        secondaryLabel: 'הכנסה',
        count: filterCounts.categories?.[cat.name] ?? 0,
        icon: <CategoryBadge category={cat.name} customSvg={cat.customSvg} size={18} />,
      });
      if (cat.subs && cat.subs.length > 0) {
        cat.subs.forEach((sub) => {
          if (sub.isActive === false) return;
          list.push({
            id: sub.name,
            label: `  ↳ ${sub.name}`,
            secondaryLabel: cat.name,
            count: filterCounts.categories?.[sub.name] ?? 0,
            icon: <CategoryBadge category={sub.name} customSvg={sub.customSvg} size={16} />,
          });
        });
      }
    });

    return list;
  }, [expenseCategories, incomeCategories, filterCounts.categories]);

  // Options for Special Characteristics & Currencies Multi-Select
  const specialOptions = useMemo(() => {
    const list = [
      {
        id: 'installments',
        label: 'תשלומים',
        count: filterCounts.specials?.installments ?? 0,
        icon: <CreditCard className="w-4 h-4 text-indigo-400" />,
      },
      {
        id: 'bit',
        label: 'העברות בביט (Bit)',
        count: filterCounts.specials?.bit ?? 0,
        icon: <Zap className="w-4 h-4 text-blue-400" />,
      },
      {
        id: 'cc_billing',
        label: 'חיובי חברות אשראי',
        count: filterCounts.specials?.cc_billing ?? 0,
        icon: <ShieldAlert className="w-4 h-4 text-slate-400" />,
      },
      {
        id: 'cash',
        label: 'משיכת מזומן / כספומט',
        count: filterCounts.specials?.cash ?? 0,
        icon: <Banknote className="w-4 h-4 text-emerald-400" />,
      },
      {
        id: 'splits',
        label: 'תנועות מפוצלות',
        count: filterCounts.specials?.splits ?? 0,
        icon: <Split className="w-4 h-4 text-purple-400" />,
      },
      {
        id: 'receipts',
        label: 'קבלות וחשבוניות',
        count: filterCounts.specials?.receipts ?? 0,
        icon: <Receipt className="w-4 h-4 text-pink-400" />,
      },
      {
        id: 'notes',
        label: 'הערות אישיות',
        count: filterCounts.specials?.notes ?? 0,
        icon: <MessageSquare className="w-4 h-4 text-sky-400" />,
      },
      {
        id: 'links',
        label: 'תנועות מקושרות (זיכוי/חיוב)',
        count: filterCounts.specials?.links ?? 0,
        icon: <Link2 className="w-4 h-4 text-teal-400" />,
      },
      {
        id: 'ignored',
        label: 'תנועות שהוחרגו מהתקציב',
        count: filterCounts.specials?.ignored ?? 0,
        icon: <EyeOff className="w-4 h-4 text-slate-400" />,
      },
      {
        id: 'header_currencies',
        isHeader: true,
        label: 'מטבעות מט״ח (הכל מלבד שקל)',
        count: filterCounts.specials?.foreign ?? 0,
        icon: <Coins className="w-3.5 h-3.5 text-amber-400" />,
      },
      {
        id: 'foreign',
        label: 'כל עסקאות המט״ח',
        count: filterCounts.specials?.foreign ?? 0,
        icon: <Coins className="w-4 h-4 text-amber-400" />,
      },
    ];

    // Add individual currency options from availableCurrencies
    if (Array.isArray(availableCurrencies)) {
      availableCurrencies.forEach((c) => {
        if (!c || !c.currency) return;
        if (['ILS', 'NIS', 'ש"ח', 'שח', '₪'].includes(c.currency)) return;
        list.push({
          id: `curr_${c.currency}`,
          label: `${c.symbol || c.currency} (${c.currency})`,
          count: filterCounts.currencies?.[c.currency] ?? c.count ?? 0,
          icon: (
            <span className="w-4 h-4 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-[10px]">
              {c.symbol || c.currency}
            </span>
          ),
        });
      });
    }

    return list;
  }, [filterCounts, availableCurrencies]);

  // Quick month selector helper options (last 24 months)
  const monthOptions = useMemo(() => {
    const opts = [];
    const now = new Date();
    const MONTH_HEBREW = [
      'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
      'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
    ];
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const val = `${y}-${String(m).padStart(2, '0')}`;
      opts.push({
        value: val,
        label: `${MONTH_HEBREW[m - 1]} ${y}`,
      });
    }
    return opts;
  }, []);

  const selectedMonthValue = useMemo(() => {
    if (datePreset === 'all' && !startDate && !endDate) return 'all';
    if (startDate && endDate && startDate.slice(0, 7) === endDate.slice(0, 7)) {
      return startDate.slice(0, 7);
    }
    if (datePreset === 'current_month') {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    if (datePreset === 'last_month') {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    return 'all';
  }, [datePreset, startDate, endDate]);

  const handleQuickMonthChange = (val) => {
    if (val === 'all') {
      setDatePreset('all');
      setStartDate('');
      setEndDate('');
    } else {
      const [y, m] = val.split('-').map(Number);
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      setDatePreset('custom');
      setStartDate(start);
      setEndDate(end);
    }
  };

  // Compute active filters count
  const activeFiltersCount = [
    debouncedSearch.trim() ? 1 : 0,
    type !== 'all' ? 1 : 0,
    selectedAccountIds.length > 0 ? selectedAccountIds.length : 0,
    selectedCategories.length > 0 ? selectedCategories.length : 0,
    selectedSpecialFilters.length > 0 ? selectedSpecialFilters.length : 0,
    (selectedSpecialFilters.includes('cc_billing') && ccLinkStatus !== 'all') ? 1 : 0,
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
      return { start: formatLocalDate(s), end: formatLocalDate(e) };
    }
    if (preset === 'last_month') {
      const s = new Date(y, m - 1, 1);
      const e = new Date(y, m, 0);
      return { start: formatLocalDate(s), end: formatLocalDate(e) };
    }
    if (preset === 'last_90') {
      const s = new Date(now.getTime() - 90 * 24 * 60 * 1000);
      return { start: formatLocalDate(s), end: formatLocalDate(now) };
    }
    return { start: startDate || undefined, end: endDate || undefined };
  };

  const loadTransactions = async (cursor = null, cursorId = null, reset = false) => {
    setLoading(true);
    if (reset) {
      setFetchError(null);
    }
    try {
      const range = getDateRangeForPreset(datePreset);

      // Build effective special filters list (handling CC link status if cc_billing is selected)
      const effectiveSpecials = [...selectedSpecialFilters];
      if (selectedSpecialFilters.includes('cc_billing')) {
        if (ccLinkStatus === 'linked') {
          effectiveSpecials.push('cc_linked');
        } else if (ccLinkStatus === 'unlinked') {
          effectiveSpecials.push('cc_unlinked');
        }
      }

      const res = await api.getTransactionsV2({
        limit: 30,
        cursor,
        cursorId,
        search: debouncedSearch.trim() || undefined,
        type: type !== 'all' ? type : undefined,
        accountIds: selectedAccountIds.length > 0 ? selectedAccountIds : undefined,
        categories: selectedCategories.length > 0 ? selectedCategories : undefined,
        specialFilters: effectiveSpecials.length > 0 ? effectiveSpecials.join(',') : undefined,
        minAmount: minAmount ? parseFloat(minAmount) : undefined,
        maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
        startDate: range.start,
        endDate: range.end,
      });

      if (res?.data && Array.isArray(res.data.data)) {
        setTransactions((prev) => (reset ? res.data.data : [...prev, ...res.data.data]));
        setNextCursor(res.data.nextCursor || null);
        setNextCursorId(res.data.nextCursorId || null);
        setHasNextPage(Boolean(res.data.hasNextPage));
        setFetchError(null);
      } else {
        if (reset) {
          setTransactions([]);
        }
        if (res?.error) {
          setFetchError(res.error);
        }
      }
    } catch (err) {
      console.error('Failed to load transactions:', err);
      if (reset) {
        setTransactions([]);
      }
      setFetchError(err?.message || 'שגיאה בטעינת העסקאות');
    } finally {
      setLoading(false);
    }
  };

  // Reload transactions on filter change
  useEffect(() => {
    loadTransactions(null, null, true);
  }, [type, selectedAccountIds, selectedCategories, selectedSpecialFilters, ccLinkStatus, debouncedSearch, minAmount, maxAmount, datePreset, startDate, endDate]);

  const handleSearchSubmit = (e) => {
    e?.preventDefault();
    loadTransactions(null, null, true);
  };

  const handleResetFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setType('all');
    setSelectedAccountIds([]);
    setSelectedCategories([]);
    setSelectedSpecialFilters([]);
    setCcLinkStatus('all');
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
      {/* Sticky Banner when in Linking Mode */}
      {linkingTx && (
        <div className="sticky top-2 z-30 p-4 rounded-2xl bg-brand-primary/10 border-2 border-brand-primary flex flex-wrap items-center justify-between gap-3 shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-brand-primary text-white shadow-sm shrink-0">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-brand-primary flex items-center gap-1.5">
                <span>מצב קישור תנועה פעיל</span>
                <span>•</span>
                <span>
                  {linkingType === 'refund' ? 'סוג: זיכוי / ביטול' : linkingType === 'correction' ? 'סוג: תיקון' : 'סוג: תנועה קשורה'}
                </span>
              </div>
              <div className="text-sm font-bold text-dark-text light:text-light-text flex items-center gap-2 mt-0.5">
                <span>מקשר עבור:</span>
                <span className="text-brand-primary font-extrabold">{cleanSpacedHebrew(getTransactionTitle(linkingTx))}</span>
                <span className="text-xs text-dark-text-muted font-mono font-normal">
                  ({formatDate(linkingTx.date, lang)} • {formatILS(linkingTx.amount, { showSign: true })})
                </span>
              </div>
              <div className="text-[11px] text-dark-text-muted light:text-light-text-muted mt-0.5">
                חפש ובחר תנועה מהרשימה ולחץ על כפתור "קשר" כדי לחבר ביניהן.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCancelLinking}
            className="px-4 py-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface hover:bg-dark-surface-elevated text-xs font-bold text-dark-text light:text-light-text transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
          >
            <span>חזור / ביטול קישור</span>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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
                : 'bg-dark-surface light:bg-light-surface border-dark-border light:border-light-border text-dark-text light:text-light-text hover:border-brand-primary/40'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>{selectMode ? 'ביטול בחירה' : 'מצב בחירה'}</span>
          </button>

          <button
            onClick={() => loadTransactions(null, null, true)}
            disabled={loading}
            className="p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text shadow-sm transition-colors"
            title="רענן"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-brand-primary' : ''}`} />
          </button>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated text-dark-text light:text-light-text text-xs font-semibold shadow-sm transition-colors"
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
              className="w-full py-2.5 rtl:pr-9 rtl:pl-9 ltr:pl-9 ltr:pr-9 rounded-xl border border-dark-border/80 light:border-light-border/80 bg-dark-surface-elevated/70 light:bg-light-surface-elevated/70 text-dark-text light:text-light-text text-xs sm:text-sm focus:outline-none focus:border-brand-primary"
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); loadTransactions(null, null, true); }}
                className="absolute left-3 rtl:left-3 ltr:right-3 top-1/2 -translate-y-1/2 text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>

          {/* Action Row on Mobile / Inline on Desktop */}
          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 flex-wrap">
            {/* Quick Month Selector Dropdown */}
            <select
              value={selectedMonthValue}
              onChange={(e) => handleQuickMonthChange(e.target.value)}
              className="px-3 py-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs font-semibold focus:outline-none focus:border-brand-primary cursor-pointer shadow-2xs"
              title="סינון מהיר לפי חודש"
            >
              <option value="all">כל החודשים</option>
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Type Toggle Buttons */}
            <div className="flex-1 sm:flex-initial flex rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated p-1 text-xs justify-center">
              <button
                onClick={() => setType('all')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-semibold text-center transition-all ${
                  type === 'all' ? 'bg-brand-primary text-white shadow-sm' : 'text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
                }`}
              >
                הכל
              </button>
              <button
                onClick={() => setType('expense')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-semibold text-center transition-all ${
                  type === 'expense' ? 'bg-rose-500 text-white shadow-sm' : 'text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
                }`}
              >
                הוצאות
              </button>
              <button
                onClick={() => setType('income')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-semibold text-center transition-all ${
                  type === 'income' ? 'bg-emerald-600 text-white shadow-sm' : 'text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
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
                  : 'border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
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
          <div className="pt-3 border-t border-dark-border/60 light:border-light-border/60 space-y-3 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* 1. Account / Card Multi-Select Filter */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-dark-text-muted light:text-light-text-muted flex items-center gap-1">
                  <CreditCard className="w-3 h-3 text-indigo-400" />
                  <span>חשבונות וכרטיסים</span>
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
                <label className="text-[11px] font-semibold text-dark-text-muted light:text-light-text-muted flex items-center gap-1">
                  <Tag className="w-3 h-3 text-pink-400" />
                  <span>קטגוריות</span>
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

              {/* 3. Special Characteristics Multi-Select Filter */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-dark-text-muted light:text-light-text-muted flex items-center gap-1">
                  <SlidersHorizontal className="w-3 h-3 text-purple-400" />
                  <span>מאפייני עסקה</span>
                </label>
                <MultiSelectDropdown
                  label="מאפיינים מיוחדים"
                  options={specialOptions}
                  selectedValues={selectedSpecialFilters}
                  onChange={setSelectedSpecialFilters}
                  placeholder="הכל"
                  icon={SlidersHorizontal}
                  className="w-full"
                />
              </div>

              {/* 4. Amount Range (Min - Max) */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-dark-text-muted light:text-light-text-muted">
                  סכום מינימום - מקסימום
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    placeholder="מ-"
                    value={minAmount}
                    onChange={(e) => setMinAmount(e.target.value)}
                    onBlur={() => loadTransactions(null, null, true)}
                    className="w-1/2 p-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none font-mono focus:outline-none focus:border-brand-primary"
                  />
                  <span className="text-dark-text-muted light:text-light-text-muted text-xs">-</span>
                  <input
                    type="number"
                    placeholder="עד"
                    value={maxAmount}
                    onChange={(e) => setMaxAmount(e.target.value)}
                    onBlur={() => loadTransactions(null, null, true)}
                    className="w-1/2 p-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none font-mono focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>

              {/* 5. Date Filter */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-dark-text-muted light:text-light-text-muted flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-sky-400" />
                  <span>תקופה ותאריכים</span>
                </label>
                <select
                  value={datePreset}
                  onChange={(e) => setDatePreset(e.target.value)}
                  className="w-full p-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs font-medium focus:outline-none focus:border-brand-primary cursor-pointer"
                >
                  <option value="all">כל הזמנים</option>
                  <option value="current_month">חודש נוכחי</option>
                  <option value="last_month">חודש שעבר</option>
                  <option value="last_90">90 ימים אחרונים</option>
                  <option value="custom">טווח תאריכים מותאם אישית...</option>
                </select>
              </div>
            </div>

            {/* CC Billing Link Status Sub-Filter (Visible only when 'cc_billing' is checked) */}
            {selectedSpecialFilters.includes('cc_billing') && (
              <div className="pt-2 border-t border-dark-border/40 light:border-light-border/40 flex items-center gap-2.5 flex-wrap animate-in fade-in duration-150">
                <span className="text-[11px] font-semibold text-dark-text-muted light:text-light-text-muted flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                  <span>סטטוס קישור חיובי אשראי:</span>
                </span>
                <div className="inline-flex rounded-xl p-1 bg-dark-surface-elevated light:bg-light-surface-elevated border border-dark-border light:border-light-border text-xs">
                  {[
                    { id: 'all', label: 'הכל' },
                    { id: 'linked', label: 'מקושר' },
                    { id: 'unlinked', label: 'לא מקושר' },
                  ].map((btn) => (
                    <button
                      key={btn.id}
                      type="button"
                      onClick={() => setCcLinkStatus(btn.id)}
                      className={`px-3 py-1 rounded-lg font-medium text-xs transition-all ${
                        ccLinkStatus === btn.id
                          ? 'bg-brand-primary text-white shadow-xs'
                          : 'text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {datePreset === 'custom' && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="p-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs"
                />
                <span className="text-xs text-dark-text-muted light:text-light-text-muted">עד</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="p-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs"
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
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-dark-surface-elevated light:bg-light-surface-elevated border border-dark-border light:border-light-border text-dark-text light:text-light-text text-[11px]">
                <span>חיפוש: "{search}"</span>
                <button onClick={() => setSearch('')}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {type !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-primary/15 text-brand-primary font-medium text-[11px]">
                <span>סוג: {type === 'expense' ? 'הוצאות' : type === 'income' ? 'הכנסות' : 'תשלומים 💳'}</span>
                <button onClick={() => setType('all')}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {selectedAccountIds.map((accId) => {
              const acc = accounts.find((a) => a.id === accId);
              return (
                <span key={accId} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-500 dark:text-indigo-400 font-medium text-[11px]">
                  <span>{acc?.displayName || acc?.bankCompany || 'חשבון'}</span>
                  <button onClick={() => setSelectedAccountIds(selectedAccountIds.filter((id) => id !== accId))}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}

            {selectedCategories.map((catName) => (
              <span key={catName} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-pink-500/15 text-pink-500 dark:text-pink-400 font-medium text-[11px]">
                <span>{catName}</span>
                <button onClick={() => setSelectedCategories(selectedCategories.filter((c) => c !== catName))}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {selectedSpecialFilters.map((sId) => {
              const opt = specialOptions.find((o) => o.id === sId);
              return (
                <span key={sId} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400 font-medium text-[11px]">
                  <span>{opt?.label || sId}</span>
                  <button onClick={() => setSelectedSpecialFilters(selectedSpecialFilters.filter((s) => s !== sId))}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}

            {selectedSpecialFilters.includes('cc_billing') && ccLinkStatus !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-500/15 text-slate-600 dark:text-slate-300 font-medium text-[11px]">
                <span>סטטוס חיוב: {ccLinkStatus === 'linked' ? 'מקושר' : 'לא מקושר'}</span>
                <button onClick={() => setCcLinkStatus('all')}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {(minAmount || maxAmount) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-500 dark:text-amber-400 font-medium text-[11px]">
                <span>סכום: {minAmount || '0'} עד {maxAmount || '∞'}</span>
                <button onClick={() => { setMinAmount(''); setMaxAmount(''); }}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {datePreset !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-500 dark:text-sky-400 font-medium text-[11px]">
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

        {fetchError && transactions.length === 0 && !loading ? (
          <div className="py-16 text-center text-red-500 text-sm space-y-3 px-4">
            <AlertCircle className="w-10 h-10 mx-auto opacity-80" />
            <div className="font-bold text-base">שגיאה בטעינת העסקאות</div>
            <p className="text-xs text-dark-text-muted light:text-light-text-muted max-w-sm mx-auto">{fetchError}</p>
            <button
              type="button"
              onClick={() => loadTransactions(null, null, true)}
              className="px-4 py-2 rounded-xl bg-brand-primary text-white text-xs font-semibold hover:bg-brand-primary-hover transition-colors inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>נסה שוב</span>
            </button>
          </div>
        ) : transactions.length === 0 && !loading ? (
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
              const merchantTitle = cleanSpacedHebrew(getTransactionTitle(tx));
              const isAtm = Boolean(tx.isCashWithdrawal || (tx.merchantName && tx.merchantName.includes('משיכת מזומן')));

              const catDetails = getCategoryDetails(tx.category);
              const parentCat = catDetails?.mainCat?.name;
              const subCat = catDetails?.subCat?.name;
              const hasDistinctSub = parentCat && subCat && parentCat !== subCat;
              const categoryPath = hasDistinctSub ? `${parentCat} › ${subCat}` : (tx.category || 'ללא סיווג');

              const cleanAccount = (tx.accountDisplayName || tx.bankCompany || '')
                .replace(/\s*\((כרטיס|card).*?\)/gi, '')
                .trim();
              const accountText = tx.accountNumber ? `${cleanAccount} (${tx.accountNumber.slice(-4)})` : cleanAccount;

              return (
                <div
                  key={tx.id}
                  ref={isLast && hasNextPage ? lastTxRef : null}
                  onClick={() => {
                    if (selectMode) {
                      toggleSelect(tx.id);
                    } else if (linkingTx) {
                      if (tx.id !== linkingTx.id) {
                        handleExecuteLink(tx);
                      }
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

                    <div className="min-w-0 flex-1 space-y-1">
                      {/* Merchant Store Name (Headline) + Badges */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-xs sm:text-sm text-dark-text light:text-light-text truncate max-w-[200px] sm:max-w-xs">
                          {merchantTitle}
                        </span>

                        {/* Installment Badge */}
                        {(() => {
                          const inst = extractInstallmentInfo(tx);
                          if (inst.isInstallment) {
                            return (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-500 dark:text-indigo-300 text-[10px] font-bold inline-flex items-center gap-1 shrink-0" title={`עסקת תשלומים: ${inst.text}`}>
                                <span>💳</span>
                                <span>{inst.text}</span>
                              </span>
                            );
                          }
                          return null;
                        })()}

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
                        {tx.hasReceipts && (
                          <span className="p-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] shrink-0" title="מצורפת חשבונית">
                            <Receipt className="w-3 h-3" />
                          </span>
                        )}
                        {tx.isIgnored && (
                          <span className="px-1.5 py-0.2 rounded bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text-muted light:text-light-text-muted text-[10px] font-medium border border-dark-border light:border-light-border shrink-0" title="הוחרגה מתקציבים ודוחות">
                            הוחרגה
                          </span>
                        )}
                        {tx.status === 'pending' && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-500 text-[10px] font-medium shrink-0">
                            <Clock className="w-2.5 h-2.5" />
                            <span>ממתין</span>
                          </span>
                        )}
                      </div>

                      {/* Subtitle: Date • Account • Parent > Subcategory */}
                      <div className="text-[11px] text-dark-text-muted light:text-light-text-muted flex items-center gap-1.5 flex-wrap">
                        <span className="shrink-0">{formatDate(tx.date, lang)}</span>
                        <span>•</span>
                        <span className="font-mono text-dark-text-muted shrink-0">{accountText}</span>
                        <span>•</span>
                        <span className="px-1.5 py-0.5 rounded-md bg-dark-surface-elevated light:bg-light-surface-elevated text-[10px] text-brand-primary font-medium truncate max-w-[160px] sm:max-w-none">
                          {categoryPath}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Left side (in RTL): Action / Amount */}
                  <div className="shrink-0 flex items-center gap-2.5 text-left ltr:text-right rtl:mr-1 ltr:ml-1">
                    {linkingTx && (
                      linkingTx.id === tx.id ? (
                        <span className="px-2.5 py-1 rounded-lg bg-brand-primary/20 text-brand-primary text-xs font-bold shrink-0">
                          תנועת המקור
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={processingLinkId === tx.id}
                          onClick={(e) => handleExecuteLink(tx, e)}
                          className="px-3 py-1.5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
                        >
                          {processingLinkId === tx.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Link2 className="w-3.5 h-3.5" />
                          )}
                          <span>קשר</span>
                        </button>
                      )
                    )}

                    <div className="flex flex-col items-end">
                      <div 
                        className={`text-sm sm:text-base font-bold font-mono tracking-tight ${
                          isIncome ? 'text-emerald-500 dark:text-emerald-400' : 'text-dark-text light:text-light-text'
                        }`}
                        dir="ltr"
                      >
                        {formatILS(tx.amount, { showSign: true })}
                      </div>
                      {(tx.isForeign || (tx.originalCurrency && tx.originalCurrency !== 'ILS')) && tx.originalAmount && (
                        <div className="text-[10px] font-mono text-blue-500 dark:text-blue-400 font-medium" dir="ltr">
                          {formatCurrency(tx.originalAmount, tx.originalCurrency)}
                        </div>
                      )}
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

        {/* End of List indicator */}
        {!loading && !hasNextPage && transactions.length > 0 && (
          <div className="py-5 text-center text-xs text-dark-text-muted light:text-light-text-muted border-t border-dark-border/40 light:border-light-border/40 font-medium">
            אין תנועות נוספות להצגה
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
              className="px-3 py-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated text-xs font-medium transition-colors text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text shrink-0"
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
              <h3 className="text-base font-bold text-dark-text light:text-light-text flex items-center gap-2">
                <Tag className="w-5 h-5 text-brand-primary" />
                <span>שינוי קטגוריה במרוכז</span>
              </h3>
              <button
                onClick={() => setBulkCategoryModalOpen(false)}
                className="p-1 rounded-lg hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-dark-text-muted light:text-light-text-muted">
              בחר קטגוריה או תת-קטגוריה להחלה על {selectedCount} התנועות שנבחרו. המערכת תלמד את הסיווג עבור בתי עסק אלו.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">קטגוריה רצויה</label>
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
                className="flex-1 py-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated text-xs font-medium transition-colors"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleApplyBulkCategory}
                disabled={!bulkCategory || savingBulk}
                className="flex-1 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-primary-hover disabled:opacity-50 transition-colors shadow-md shadow-brand-primary/20"
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
          onStartLinking={handleStartLinking}
        />
      )}
    </div>
  );
}

class TransactionsErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('TransactionsPage caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-lg mx-auto text-center space-y-4 my-12 bg-dark-surface light:bg-light-surface rounded-2xl border border-red-500/20 shadow-lg">
          <div className="w-12 h-12 mx-auto rounded-full bg-red-500/15 text-red-500 flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold text-dark-text light:text-light-text">אירעה שגיאה בטעינת עמוד התנועות</h2>
            <p className="text-xs text-dark-text-muted light:text-light-text-muted">
              {this.state.error?.message || 'שגיאה בטעינת הממשק. נסה לטעון מחדש את הדף.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              if (typeof window !== 'undefined') window.location.reload();
            }}
            className="px-4 py-2 rounded-xl bg-brand-primary text-white text-xs font-semibold hover:bg-brand-primary-hover transition-colors inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>טען מחדש</span>
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function TransactionsPage() {
  return (
    <TransactionsErrorBoundary>
      <Suspense fallback={<div className="p-8 text-center text-sm text-dark-text-muted">טוען תנועות...</div>}>
        <TransactionsContent />
      </Suspense>
    </TransactionsErrorBoundary>
  );
}
