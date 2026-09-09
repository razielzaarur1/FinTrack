'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { 
  ChevronRight, 
  ChevronLeft, 
  CreditCard, 
  TrendingDown, 
  TrendingUp, 
  ArrowUpRight, 
  RefreshCw, 
  PieChart as PieIcon,
  ChevronDown,
  Layers,
  Search,
  Filter,
  X,
  Calendar,
  Tag
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatILS, formatDate } from '@/lib/formatters';
import { useApp } from '@/lib/app-context';
import CategoryBadge from '@/components/common/CategoryBadge';
import InstitutionLogo from '@/components/common/InstitutionLogo';
import MultiSelectDropdown from '@/components/common/MultiSelectDropdown';
import TransactionDrawer from '@/components/transactions/TransactionDrawer';
import { CATEGORIES_DATA } from '@/lib/categories';

// Component for in-page category transaction drilldown drawer
function CategoryTransactionsDrawer({ categoryName, year, month, accountIds, onClose, onTxUpdated }) {
  const { lang } = useApp();
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTx, setSelectedTx] = useState(null);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow || 'unset';
    };
  }, []);

  useEffect(() => {
    if (!categoryName) return;
    setLoading(true);
    const startDate = new Date(year, month - 1, 1).toISOString().slice(0, 10);
    const endDate = new Date(year, month, 0).toISOString().slice(0, 10);

    // If categoryName is a main category, gather all its subcategories too
    const allMain = [...CATEGORIES_DATA.expenses, ...CATEGORIES_DATA.incomes];
    const foundMain = allMain.find((c) => c.name === categoryName);
    const categoryList = foundMain && foundMain.subs?.length > 0
      ? [categoryName, ...foundMain.subs.map((s) => s.name)]
      : [categoryName];

    api.getTransactionsV2({
      categories: categoryList,
      startDate,
      endDate,
      accountIds: accountIds.length > 0 ? accountIds : undefined,
      limit: 300,
    }).then((res) => {
      if (res.data) {
        setTxs(res.data.data || []);
      }
    }).finally(() => {
      setLoading(false);
    });
  }, [categoryName, year, month, accountIds]);

  const totalSum = useMemo(() => {
    return txs.reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);
  }, [txs]);

  // Group transactions by category name
  const groupedTxs = useMemo(() => {
    const groups = {};
    txs.forEach((t) => {
      const cat = t.category || 'אחר / שונות';
      if (!groups[cat]) {
        groups[cat] = {
          name: cat,
          items: [],
          total: 0,
        };
      }
      groups[cat].items.push(t);
      groups[cat].total += parseFloat(t.amount) || 0;
    });

    // Sort transactions inside each group by date descending
    Object.values(groups).forEach((g) => {
      g.items.sort((a, b) => new Date(b.date) - new Date(a.date));
    });

    // Return groups array sorted by total amount descending
    return Object.values(groups).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  }, [txs]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-dark-surface light:bg-light-surface h-full border-l border-dark-border light:border-light-border shadow-2xl flex flex-col justify-between overflow-hidden">
        {/* Drawer Header */}
        <div className="p-5 border-b border-dark-border light:border-light-border flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <CategoryBadge category={categoryName} size={24} />
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-dark-text light:text-light-text truncate">
                {categoryName}
              </h2>
              <div className="text-xs text-dark-text-muted light:text-light-text-muted mt-0.5">
                {MONTH_NAMES[month - 1]} {year} • {txs.length} תנועות • <span className="font-bold text-brand-primary font-mono">{formatILS(totalSum)}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-dark-surface-elevated text-dark-text-muted hover:text-dark-text cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Transactions List Grouped by Subcategory */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="p-16 text-center text-dark-text-muted">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-brand-primary mb-2" />
              <p className="text-xs">טוען תנועות...</p>
            </div>
          ) : txs.length === 0 ? (
            <div className="py-16 text-center text-dark-text-muted text-xs">
              לא נמצאו תנועות בקטגוריה זו בחודש הנבחר
            </div>
          ) : (
            groupedTxs.map((group) => {
              const isGroupIncome = group.total > 0;
              return (
                <div key={group.name} className="space-y-2">
                  {/* Group header if multiple groups or distinct from drawer category */}
                  {(groupedTxs.length > 1 || group.name !== categoryName) && (
                    <div className="flex items-center justify-between px-1 py-1 text-xs font-semibold text-dark-text-muted border-b border-dark-border/40 light:border-light-border/40">
                      <div className="flex items-center gap-2">
                        <CategoryBadge category={group.name} size={16} />
                        <span className="text-dark-text light:text-light-text font-bold">{group.name}</span>
                        <span className="text-[10px] text-dark-text-muted font-normal">({group.items.length} תנועות)</span>
                      </div>
                      <span className={`font-mono font-bold text-xs ${isGroupIncome ? 'text-emerald-500' : 'text-dark-text'}`} dir="ltr">
                        {formatILS(group.total)}
                      </span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {group.items.map((t) => {
                      const isIncome = parseFloat(t.amount) > 0;
                      return (
                        <div
                          key={t.id}
                          onClick={() => setSelectedTx(t)}
                          className="p-3 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated/50 hover:bg-dark-surface-elevated transition-colors cursor-pointer flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-xs sm:text-sm text-dark-text light:text-light-text truncate">
                              {t.userDescription || t.merchantName || t.description || 'ללא תיאור'}
                            </div>
                            <div className="text-[11px] text-dark-text-muted mt-0.5 flex items-center gap-1.5 truncate">
                              <span>{formatDate(t.date, lang)}</span>
                              <span>•</span>
                              <span className="font-mono">{t.accountDisplayName || t.bankCompany}</span>
                            </div>
                          </div>

                          <div className={`font-bold text-xs sm:text-sm font-mono shrink-0 ${isIncome ? 'text-emerald-500' : 'text-dark-text'}`} dir="ltr">
                            {formatILS(t.amount, { showSign: true })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Link to full search */}
        <div className="p-4 border-t border-dark-border light:border-light-border bg-dark-surface-elevated/40">
          <Link
            href={`/transactions?categories=${encodeURIComponent(categoryName)}`}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-brand-primary/15 text-brand-primary font-bold text-xs hover:bg-brand-primary/25 transition-colors"
          >
            <span>פתח בעמוד תנועות לסינון מלא</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Transaction Detail Drawer */}
        {selectedTx && (
          <TransactionDrawer
            tx={selectedTx}
            onClose={() => setSelectedTx(null)}
            onUpdate={(updated) => {
              setTxs((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
              onTxUpdated?.(updated);
            }}
          />
        )}
      </div>
    </div>
  );
}

const MONTH_NAMES = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
];

function CategoriesContent() {
  const { t, lang } = useApp();
  const now = new Date();

  // Period State
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [categoryType, setCategoryType] = useState('expense'); // 'expense' | 'income'

  // Accounts & Multi-Select
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);

  // Data State
  const [loading, setLoading] = useState(false);
  const [breakdownData, setBreakdownData] = useState([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [drawerCategory, setDrawerCategory] = useState(null);

  // Fetch accounts on mount
  useEffect(() => {
    api.getAccounts().then((res) => {
      if (res.data) setAccounts(res.data);
    });
  }, []);

  const accountOptions = useMemo(() => {
    return accounts.map((acc) => ({
      id: acc.id,
      label: acc.displayName || acc.bankCompany,
      secondaryLabel: acc.accountNumber ? `•••• ${acc.accountNumber.slice(-4)}` : undefined,
      icon: <InstitutionLogo institution={acc.bankCompany} size={18} />,
    }));
  }, [accounts]);

  // Load Breakdown Data
  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.getCategoryBreakdown({
        year: selectedYear,
        month: selectedMonth,
        type: categoryType,
        accountIds: selectedAccountIds.length > 0 ? selectedAccountIds : undefined,
      });

      if (res.data) {
        setTotalSpent(res.data.total || 0);
        setBreakdownData(res.data.data || []);
      }
    } catch (err) {
      console.error('Failed to load category breakdown:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedYear, selectedMonth, categoryType, selectedAccountIds]);

  // Month navigation helpers
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((prev) => prev - 1);
    } else {
      setSelectedMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((prev) => prev + 1);
    } else {
      setSelectedMonth((prev) => prev + 1);
    }
  };

  const handleCurrentMonth = () => {
    setSelectedYear(now.getFullYear());
    setSelectedMonth(now.getMonth() + 1);
  };

  const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1;

  // Build tree of categories with subcategories and amounts
  const treeData = useMemo(() => {
    const mainCategories = categoryType === 'expense' ? CATEGORIES_DATA.expenses : CATEGORIES_DATA.incomes;
    
    // Map of raw category name from backend -> amount & count
    const backendCategoryMap = new Map();
    breakdownData.forEach((item) => {
      backendCategoryMap.set(item.name, {
        amount: item.amount,
        count: item.count,
        color: item.color,
      });
    });

    const result = [];
    let unmatchedTotal = 0;
    let unmatchedCount = 0;
    const unmatchedItems = [];

    // Check which backend categories got matched
    const matchedCategoryNames = new Set();

    mainCategories.forEach((mainCat) => {
      let mainSum = 0;
      let mainCount = 0;
      const subItems = [];

      // Check if there's direct spending on the main category itself
      if (backendCategoryMap.has(mainCat.name)) {
        const direct = backendCategoryMap.get(mainCat.name);
        mainSum += direct.amount;
        mainCount += direct.count;
        matchedCategoryNames.add(mainCat.name);
      }

      // Check subcategories
      if (mainCat.subs && mainCat.subs.length > 0) {
        mainCat.subs.forEach((sub) => {
          if (backendCategoryMap.has(sub.name)) {
            const subData = backendCategoryMap.get(sub.name);
            mainSum += subData.amount;
            mainCount += subData.count;
            matchedCategoryNames.add(sub.name);
            subItems.push({
              name: sub.name,
              amount: subData.amount,
              count: subData.count,
              icon: sub.icon,
            });
          }
        });
      }

      // Sort sub-items by amount descending
      subItems.sort((a, b) => b.amount - a.amount);

      result.push({
        id: mainCat.id,
        name: mainCat.name,
        color: mainCat.color,
        bg: mainCat.bg,
        amount: mainSum,
        count: mainCount,
        percentage: totalSpent > 0 ? Math.round((mainSum / totalSpent) * 100) : 0,
        subcategories: subItems,
      });
    });

    // Capture any legacy or custom categories not in schema
    backendCategoryMap.forEach((val, name) => {
      if (!matchedCategoryNames.has(name) && name !== 'אחר') {
        unmatchedItems.push({
          name,
          amount: val.amount,
          count: val.count,
        });
        unmatchedTotal += val.amount;
        unmatchedCount += val.count;
      }
    });

    if (backendCategoryMap.has('אחר')) {
      const other = backendCategoryMap.get('אחר');
      unmatchedTotal += other.amount;
      unmatchedCount += other.count;
    }

    if (unmatchedTotal > 0) {
      result.push({
        id: 'other',
        name: 'אחר / שונות',
        color: 'text-slate-400',
        bg: 'bg-slate-500/10',
        amount: unmatchedTotal,
        count: unmatchedCount,
        percentage: totalSpent > 0 ? Math.round((unmatchedTotal / totalSpent) * 100) : 0,
        subcategories: unmatchedItems,
      });
    }

    // Filter out empty categories (where amount === 0 && count === 0)
    let filteredResult = result.filter((cat) => cat.amount > 0 || cat.count > 0);

    // Sort by amount descending
    filteredResult.sort((a, b) => b.amount - a.amount);

    // Apply filter search if provided
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return filteredResult.filter((cat) =>
        cat.name.toLowerCase().includes(q) ||
        cat.subcategories.some((s) => s.name.toLowerCase().includes(q))
      );
    }

    return filteredResult;
  }, [breakdownData, totalSpent, categoryType, searchTerm]);

  const toggleExpand = (catId) => {
    const next = new Set(expandedCategories);
    if (next.has(catId)) next.delete(catId);
    else next.add(catId);
    setExpandedCategories(next);
  };

  const expandAll = () => {
    setExpandedCategories(new Set(treeData.map((c) => c.id)));
  };

  const collapseAll = () => {
    setExpandedCategories(new Set());
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">
            {lang === 'he' ? 'קטגוריות ותתי-קטגוריות' : 'Categories & Subcategories'}
          </h1>
          <p className="text-xs text-dark-text-muted light:text-light-text-muted">
            {lang === 'he' ? 'מעקב ופירוט מעמיק אחר כל תחומי ההוצאות וההכנסות' : 'Deep breakdown of your spending by category'}
          </p>
        </div>

        {/* Expense / Income Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface p-1 text-xs shadow-sm">
            <button
              onClick={() => setCategoryType('expense')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold transition-all ${
                categoryType === 'expense'
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'text-dark-text-muted hover:text-dark-text'
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5" />
              <span>הוצאות</span>
            </button>
            <button
              onClick={() => setCategoryType('income')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold transition-all ${
                categoryType === 'income'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-dark-text-muted hover:text-dark-text'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>הכנסות</span>
            </button>
          </div>
        </div>
      </div>

      {/* Period & Filter Bar */}
      <div className="p-4 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Month Selector */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-start">
          <button
            onClick={handleNextMonth}
            className="p-2 rounded-xl border border-dark-border light:border-light-border hover:bg-dark-surface-elevated text-dark-text-muted hover:text-dark-text transition-colors"
            title="חודש הבא"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-dark-surface-elevated light:bg-light-surface-elevated border border-dark-border/60">
            <span className="font-bold text-sm text-dark-text light:text-light-text min-w-[110px] text-center">
              {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
            </span>
          </div>

          <button
            onClick={handlePrevMonth}
            className="p-2 rounded-xl border border-dark-border light:border-light-border hover:bg-dark-surface-elevated text-dark-text-muted hover:text-dark-text transition-colors"
            title="חודש קודם"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {!isCurrentMonth && (
            <button
              onClick={handleCurrentMonth}
              className="text-xs px-2.5 py-1.5 rounded-xl border border-brand-primary/40 bg-brand-primary/10 text-brand-primary font-semibold hover:bg-brand-primary/20 transition-colors"
            >
              החודש
            </button>
          )}
        </div>

        {/* Multi-Account Filter & Search */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
          <div className="relative flex-1 md:w-48">
            <Search className="w-3.5 h-3.5 absolute right-3 rtl:right-3 ltr:left-3 top-1/2 -translate-y-1/2 text-dark-text-muted" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="חפש קטגוריה..."
              className="w-full pr-8 rtl:pr-8 ltr:pl-8 pl-3 py-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated text-xs focus:outline-none focus:border-brand-primary"
            />
          </div>

          <MultiSelectDropdown
            label="כרטיסים וחשבונות"
            options={accountOptions}
            selectedValues={selectedAccountIds}
            onChange={setSelectedAccountIds}
            placeholder="הכל"
            icon={CreditCard}
          />

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated text-dark-text-muted hover:text-dark-text shadow-xs"
            title="רענן"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-brand-primary' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary KPI Banner */}
      <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-gradient-to-r from-dark-surface to-dark-surface-elevated light:from-light-surface light:to-light-surface-elevated shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
            {categoryType === 'expense' ? 'סך הוצאות לחודש זה:' : 'סך הכנסות לחודש זה:'}
          </span>
          <div className={`text-3xl font-black mt-1 ${categoryType === 'expense' ? 'text-rose-500' : 'text-emerald-500'}`} dir="ltr">
            {formatILS(totalSpent)}
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <button
            onClick={expandAll}
            className="text-brand-primary hover:underline font-semibold flex items-center gap-1"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>הרחב הכל</span>
          </button>
          <span>•</span>
          <button
            onClick={collapseAll}
            className="text-dark-text-muted hover:text-dark-text font-medium"
          >
            כווץ הכל
          </button>
        </div>
      </div>

      {/* Category Cards / Drill-down Tree */}
      {loading ? (
        <div className="p-16 text-center text-dark-text-muted">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-brand-primary mb-2" />
          <p className="text-sm font-medium">טוען קטגוריות...</p>
        </div>
      ) : treeData.length === 0 ? (
        <div className="py-16 text-center text-dark-text-muted space-y-2">
          <PieIcon className="w-10 h-10 mx-auto opacity-30" />
          <div className="font-semibold text-sm">אין נתונים לחודש זה</div>
          <p className="text-xs max-w-xs mx-auto opacity-75">לא נמצאו תנועות בקטגוריה זו בטווח הנבחר</p>
        </div>
      ) : (
        <div className="space-y-3">
          {treeData.map((cat) => {
            const isExpanded = expandedCategories.has(cat.id);
            const hasSubs = cat.subcategories.length > 0;

            return (
              <div
                key={cat.id}
                className="rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface overflow-hidden shadow-xs transition-all hover:border-dark-border-hover"
              >
                {/* Main Category Header Card */}
                <div
                  className="p-4 flex items-center justify-between gap-3 hover:bg-dark-surface-elevated/40 transition-colors"
                >
                  <div
                    onClick={() => setDrawerCategory(cat.name)}
                    className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer group"
                    title="לחץ להצגת תנועות בקטגוריה זו"
                  >
                    <CategoryBadge category={cat.name} size={22} className="shrink-0 group-hover:scale-105 transition-transform" />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-xs sm:text-sm text-dark-text light:text-light-text flex items-center gap-1.5 flex-wrap">
                        <span className="truncate group-hover:text-brand-primary transition-colors">{cat.name}</span>
                        {hasSubs && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-dark-surface-elevated text-dark-text-muted font-medium shrink-0">
                            {cat.subcategories.length} תתי-קטגוריות
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-dark-text-muted light:text-light-text-muted mt-0.5 truncate">
                        {cat.count} תנועות • {cat.percentage}%
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    {/* Progress Bar & Amount */}
                    <div 
                      onClick={() => setDrawerCategory(cat.name)}
                      className="text-left rtl:text-right flex flex-col items-end cursor-pointer"
                    >
                      <div className="font-bold text-sm sm:text-base text-dark-text light:text-light-text font-mono" dir="ltr">
                        {formatILS(cat.amount)}
                      </div>
                      {/* Visual Spending Share Bar */}
                      <div className="hidden sm:block w-24 bg-dark-surface-elevated light:bg-light-surface-elevated h-1.5 rounded-full overflow-hidden mt-1">
                        <div
                          className={`h-full rounded-full ${categoryType === 'expense' ? 'bg-rose-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Expand/Collapse Chevron */}
                    {hasSubs && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(cat.id);
                        }}
                        className="p-1 text-dark-text-muted hover:text-dark-text transition-transform rounded-lg cursor-pointer"
                        title={isExpanded ? 'כווץ תתי-קטגוריות' : 'הרחב תתי-קטגוריות'}
                      >
                        <ChevronDown
                          className={`w-4 h-4 transition-transform duration-200 ${
                            isExpanded ? 'rotate-180 text-brand-primary' : ''
                          }`}
                        />
                      </button>
                    )}
                  </div>
                </div>

                {/* Subcategories Drill-down Drawer */}
                {isExpanded && hasSubs && (
                  <div className="border-t border-dark-border/40 light:border-light-border/40 bg-dark-surface-elevated/30 light:bg-light-surface-elevated/30 divide-y divide-dark-border/30">
                    {cat.subcategories.map((sub, idx) => (
                      <div
                        key={idx}
                        onClick={() => setDrawerCategory(sub.name)}
                        className="px-6 py-3 flex items-center justify-between text-xs hover:bg-dark-surface-elevated/60 transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-3">
                          <CategoryBadge category={sub.name} size={18} />
                          <span className="font-semibold text-dark-text light:text-light-text group-hover:text-brand-primary transition-colors">
                            {sub.name}
                          </span>
                          <span className="text-[11px] text-dark-text-muted">
                            ({sub.count} תנועות)
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-bold font-mono text-dark-text light:text-light-text" dir="ltr">
                            {formatILS(sub.amount)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Category Transactions Drawer */}
      {drawerCategory && (
        <CategoryTransactionsDrawer
          categoryName={drawerCategory}
          year={selectedYear}
          month={selectedMonth}
          accountIds={selectedAccountIds}
          onClose={() => setDrawerCategory(null)}
          onTxUpdated={() => loadData()}
        />
      )}
    </div>
  );
}

export default function CategoriesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-dark-text-muted">טוען קטגוריות...</div>}>
      <CategoriesContent />
    </Suspense>
  );
}
