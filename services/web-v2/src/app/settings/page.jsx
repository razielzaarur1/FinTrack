'use client';

import React, { useState, useEffect } from 'react';
import { 
  Tag, 
  Plus, 
  Trash2, 
  Check, 
  Download, 
  Settings as SettingsIcon,
  RefreshCw,
  ChevronDown,
  Upload,
  FileCode,
  Sparkles,
  X,
  Layers,
  Edit2
} from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import CategoryBadge from '@/components/common/CategoryBadge';
import { CATEGORIES_DATA } from '@/lib/categories';
import { generateDesignSystemPrompt } from '@/lib/designSystemPrompt';

export default function SettingsPage() {
  const { lang, t, theme, toggleTheme, toggleLanguage } = useApp();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Scraping range settings
  const [scrapeDaysBack, setScrapeDaysBack] = useState(30);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Monthly Billing Cycle Start Day
  const [monthStartDay, setMonthStartDay] = useState(10);
  const [monthSaved, setMonthSaved] = useState(false);

  // Category Tree UI State
  const [activeTab, setActiveTab] = useState('expense'); // 'expense' | 'income'
  const [expandedCats, setExpandedCats] = useState(new Set(['exp_household', 'exp_shopping']));

  // Add/Edit Category Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [modalParentId, setModalParentId] = useState(null);
  const [modalParentName, setModalParentName] = useState('');
  const [formName, setFormName] = useState('');
  const [formNameEn, setFormNameEn] = useState('');
  const [formType, setFormType] = useState('expense');
  const [formColor, setFormColor] = useState('#6366f1');
  const [formIcon, setFormIcon] = useState('tag');
  const [formSvg, setFormSvg] = useState('');
  const [submittingCat, setSubmittingCat] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
  const [reclassifyResult, setReclassifyResult] = useState(null);

  const loadSettings = async () => {
    try {
      const res = await api.getSystemSettings();
      if (res.data?.settings?.scrapeDaysBack) {
        setScrapeDaysBack(parseInt(res.data.settings.scrapeDaysBack, 10) || 30);
      }
      if (res.data?.settings?.monthStartDay) {
        setMonthStartDay(parseInt(res.data.settings.monthStartDay, 10) || 10);
      }
    } catch (err) {
      console.error('Failed to load system settings:', err);
    }
  };

  const loadCategories = async () => {
    setLoading(true);
    try {
      const res = await api.getCategories({ tree: 'true' });
      if (res.data?.data && Array.isArray(res.data.data) && res.data.data.length > 0) {
        setCategories(res.data.data);
      } else {
        const fallback = [
          ...CATEGORIES_DATA.expenses.map(c => ({ ...c, type: 'expense' })),
          ...CATEGORIES_DATA.incomes.map(c => ({ ...c, type: 'income' })),
        ];
        setCategories(fallback);
      }
    } catch (err) {
      console.error('Failed to load categories:', err);
      const fallback = [
        ...CATEGORIES_DATA.expenses.map(c => ({ ...c, type: 'expense' })),
        ...CATEGORIES_DATA.incomes.map(c => ({ ...c, type: 'income' })),
      ];
      setCategories(fallback);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
    loadSettings();
  }, []);

  const handleSaveSyncSettings = async (days) => {
    const val = parseInt(days, 10) || 30;
    setScrapeDaysBack(val);
    setSavingSettings(true);
    setSettingsSaved(false);
    try {
      const res = await api.getSystemSettings();
      const current = res.data?.settings || {};
      await api.updateSystemSettings({ ...current, scrapeDaysBack: val });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save scraping settings:', err);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveMonthStartDay = async (day) => {
    const val = parseInt(day, 10) || 10;
    setMonthStartDay(val);
    setMonthSaved(false);
    try {
      const res = await api.getSystemSettings();
      const current = res.data?.settings || {};
      await api.updateSystemSettings({ ...current, monthStartDay: val });
      setMonthSaved(true);
      setTimeout(() => setMonthSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save month start day:', err);
    }
  };

  // Download Design System Prompt Guide
  const handleDownloadDesignPrompt = () => {
    const content = generateDesignSystemPrompt();
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'fintrack-svg-design-prompt.md');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Toggle Category Accordion
  const toggleExpand = (catId) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  // Open modal for adding subcategory
  const handleOpenAddSub = (parent) => {
    setEditingCat(null);
    setModalParentId(parent.id);
    setModalParentName(parent.name);
    setFormType(parent.type || 'expense');
    setFormColor(parent.color?.startsWith('#') ? parent.color : '#6366f1');
    setFormName('');
    setFormNameEn('');
    setFormIcon(parent.icon || 'tag');
    setFormSvg('');
    setIsModalOpen(true);
  };

  // Open modal for editing category / subcategory
  const handleOpenEdit = (cat, parentName = '') => {
    setEditingCat(cat);
    setModalParentId(cat.parentId || null);
    setModalParentName(parentName);
    setFormType(cat.type || 'expense');
    setFormColor(cat.color?.startsWith('#') ? cat.color : '#6366f1');
    setFormName(cat.name || '');
    setFormNameEn(cat.nameEn || '');
    setFormIcon(cat.icon || 'tag');
    setFormSvg(cat.customSvg || '');
    setIsModalOpen(true);
  };

  // Open modal for adding main category
  const handleOpenAddMain = () => {
    setEditingCat(null);
    setModalParentId(null);
    setModalParentName('');
    setFormType(activeTab);
    setFormColor(activeTab === 'expense' ? '#ec4899' : '#10b981');
    setFormName('');
    setFormNameEn('');
    setFormIcon('tag');
    setFormSvg('');
    setIsModalOpen(true);
  };

  // Delete category / subcategory
  const handleDeleteCategory = async (cat) => {
    if (!cat?.id) return;
    if (window.confirm(`האם אתה בטוח שברצונך למחוק את הקטגוריה "${cat.name}"?`)) {
      try {
        await api.deleteCategory(cat.id);
        await loadCategories();
      } catch (err) {
        console.error('Failed to delete category:', err);
      }
    }
  };

  // Handle SVG file upload
  const handleSvgFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        setFormSvg(text.trim());
      }
    };
    reader.readAsText(file);
  };

  // Submit Category / Subcategory
  const handleSubmitCategory = async (e) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setSubmittingCat(true);

    try {
      const payload = {
        name: formName.trim(),
        nameEn: formNameEn.trim() || undefined,
        type: formType,
        color: formColor,
        icon: formIcon,
        parentId: modalParentId || undefined,
        customSvg: formSvg.trim() || undefined,
      };

      if (editingCat && editingCat.id && !editingCat.id.startsWith('exp_') && !editingCat.id.startsWith('inc_')) {
        await api.updateCategory(editingCat.id, payload);
      } else {
        await api.createCategory(payload);
      }

      setIsModalOpen(false);
      setEditingCat(null);
      await loadCategories();
    } catch (err) {
      console.error('Failed to save category:', err);
    } finally {
      setSubmittingCat(false);
    }
  };

  // Trigger Re-classification
  const handleReclassifyAll = async () => {
    setReclassifying(true);
    setReclassifyResult(null);
    try {
      const res = await api.reclassifyAllTransactions();
      if (res.data) {
        setReclassifyResult(res.data);
      }
    } finally {
      setReclassifying(false);
    }
  };

  // Expense Categories
  const expenseCategories = React.useMemo(() => {
    if (!categories || categories.length === 0) return CATEGORIES_DATA.expenses;
    const filtered = categories.filter((c) => c.type === 'expense' || c.type === 'both' || !c.type);
    return filtered.length > 0 ? filtered : CATEGORIES_DATA.expenses;
  }, [categories]);

  // Income Categories
  const incomeCategories = React.useMemo(() => {
    if (!categories || categories.length === 0) return CATEGORIES_DATA.incomes;
    const filtered = categories.filter((c) => c.type === 'income');
    return filtered.length > 0 ? filtered : CATEGORIES_DATA.incomes;
  }, [categories]);

  // Active Category List based on tab
  const activeCategories = activeTab === 'expense' ? expenseCategories : incomeCategories;

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">
          {t('settings')}
        </h1>
        <p className="text-xs text-dark-text-muted light:text-light-text-muted">
          {lang === 'he' ? 'ניהול קטגוריות מתקדם, עיצובי SVG, שפה, תצוגה והגדרות מערכת' : 'Advanced categories, SVG customization, localization and system settings'}
        </p>
      </div>

      {/* General Display Settings */}
      <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-brand-primary" />
          <span>{lang === 'he' ? 'העדפות תצוגה ושפה' : 'Display & Localization'}</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated flex items-center justify-between">
            <div>
              <div className="font-semibold text-dark-text light:text-light-text">{lang === 'he' ? 'שפת ממשק' : 'Interface Language'}</div>
              <div className="text-dark-text-muted light:text-light-text-muted">{lang === 'he' ? 'עברית (RTL) / English (LTR)' : 'English (LTR) / Hebrew (RTL)'}</div>
            </div>
            <button
              onClick={toggleLanguage}
              className="px-3 py-1.5 rounded-lg bg-brand-primary text-white font-semibold shadow-sm hover:bg-brand-primary-hover transition-colors"
            >
              {lang === 'he' ? 'Switch to English' : 'עבור לעברית'}
            </button>
          </div>

          <div className="p-4 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated flex items-center justify-between">
            <div>
              <div className="font-semibold text-dark-text light:text-light-text">{lang === 'he' ? 'ערכת נושא' : 'Theme Mode'}</div>
              <div className="text-dark-text-muted light:text-light-text-muted">{theme === 'dark' ? t('darkMode') : t('lightMode')}</div>
            </div>
            <button
              onClick={toggleTheme}
              className="px-3 py-1.5 rounded-lg border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text font-semibold hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated transition-colors"
            >
              {theme === 'dark' ? '☀️ ' + t('lightMode') : '🌙 ' + t('darkMode')}
            </button>
          </div>
        </div>
      </div>

      {/* Scraping & Sync Range Preferences */}
      <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4">
        <div>
          <h3 className="font-semibold text-base flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-brand-primary" />
            <span>{lang === 'he' ? 'הגדרות סנכרון וסריקה בנקאית' : 'Scraping & Sync Settings'}</span>
          </h3>
          <p className="text-xs text-dark-text-muted light:text-light-text-muted mt-0.5">
            {lang === 'he'
              ? 'בחר כמה זמן היסטוריה למשוך בכל סריקה של חשבונות הבנק וכרטיסי האשראי'
              : 'Configure transaction history range fetched during scraping'}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <div className="font-semibold text-sm text-dark-text light:text-light-text">
                {lang === 'he' ? 'טווח משיכת עסקאות אחורה' : 'Transaction History Range'}
              </div>
              <div className="text-dark-text-muted light:text-light-text-muted text-[11px] mt-0.5">
                {lang === 'he'
                  ? 'הספריות של Max, כאל ובנקים תומכות במשיכה של עד שנה (365 יום) או שנתיים אחורה'
                  : 'Israeli bank scrapers support fetching up to 1 year (365 days) or 2 years back'}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={scrapeDaysBack}
                onChange={(e) => handleSaveSyncSettings(e.target.value)}
                disabled={savingSettings}
                className="p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text font-semibold text-xs focus:ring-2 focus:ring-brand-primary/50 cursor-pointer"
              >
                <option value="30">{lang === 'he' ? 'חודש אחד אחורה (30 יום) - ברירת מחדל' : '1 Month (30 days) - Default'}</option>
                <option value="60">{lang === 'he' ? 'חודשיים אחורה (60 יום)' : '2 Months (60 days)'}</option>
                <option value="90">{lang === 'he' ? '3 חודשים אחורה (90 יום)' : '3 Months (90 days)'}</option>
                <option value="180">{lang === 'he' ? 'חצי שנה אחורה (180 יום)' : '6 Months (180 days)'}</option>
                <option value="365">{lang === 'he' ? 'שנה אחורה (365 יום - מומלץ למשיכה מלאה)' : '1 Year (365 days - Full History)'}</option>
                <option value="730">{lang === 'he' ? 'שנתיים אחורה (730 יום - מוסדות תומכים)' : '2 Years (730 days)'}</option>
              </select>

              {settingsSaved && (
                <span className="flex items-center gap-1 text-brand-income font-medium text-xs">
                  <Check className="w-4 h-4" />
                  <span>{lang === 'he' ? 'נשמר' : 'Saved'}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Monthly Billing Cycle Definition */}
        <div className="p-4 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <div className="font-semibold text-sm text-dark-text light:text-light-text">
                {lang === 'he' ? 'יום תחילת חודש / מחזור תקציבי (ברירת מחדל)' : 'Default Monthly Cycle Start Day'}
              </div>
              <div className="text-dark-text-muted light:text-light-text-muted text-[11px] mt-0.5">
                {lang === 'he'
                  ? 'הגדר לפי איזה יום לסנן את החודש (ה-1 לחודש קלנדרי, או ה-10/15 לחודש לפי חיוב כרטיסי אשראי)'
                  : 'Define billing cycle start day for monthly budgeting and credit card calculations'}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={monthStartDay}
                onChange={(e) => handleSaveMonthStartDay(e.target.value)}
                className="p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text font-semibold text-xs focus:ring-2 focus:ring-brand-primary/50 cursor-pointer"
              >
                <option value="1">1 לחודש (חודש קלנדרי רגיל)</option>
                <option value="2">2 לחודש</option>
                <option value="10">10 לחודש (מועד חיוב אשראי נפוץ)</option>
                <option value="15">15 לחודש</option>
                <option value="20">20 לחודש</option>
                <option value="25">25 לחודש</option>
              </select>

              {monthSaved && (
                <span className="flex items-center gap-1 text-brand-income font-medium text-xs">
                  <Check className="w-4 h-4" />
                  <span>{lang === 'he' ? 'נשמר' : 'Saved'}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modern Categories & Custom SVG Design Hub */}
      <div className="p-6 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Tag className="w-5 h-5 text-brand-primary" />
              <span>{lang === 'he' ? 'ניהול קטגוריות, תתי-קטגוריות ועיצובי SVG' : 'Categories, Subcategories & SVG Design Hub'}</span>
            </h3>
            <p className="text-xs text-dark-text-muted mt-0.5">
              {lang === 'he'
                ? 'עץ קטגוריות מלא עם עיצובי סקווירקל צבעוניים. ניתן להוריד מפרט פרומפט ל-AI ולהעלות קובצי SVG מותאמים אישית.'
                : 'Complete category tree with colored squircle badges. Download AI prompt specs and upload custom SVGs.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadDesignPrompt}
              className="px-3.5 py-2 rounded-xl border border-brand-primary/40 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 transition-colors text-xs font-semibold flex items-center gap-1.5 shadow-xs"
              title="הורד קובץ מפרט עיצוב להעתקה ל-AI ליצירת SVG תואם"
            >
              <Download className="w-4 h-4" />
              <span>הורד מפרט ופרומפט SVG</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAddMain}
              className="px-3.5 py-2 rounded-xl bg-brand-primary text-white hover:bg-brand-primary-hover transition-colors text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>הוסף קטגוריה ראשית</span>
            </button>
          </div>
        </div>

        {/* Tabs: Expenses vs Incomes */}
        <div className="flex items-center justify-between border-b border-dark-border light:border-light-border pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('expense')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'expense'
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text border border-dark-border/40 light:border-light-border/40'
              }`}
            >
              הוצאות ({expenseCategories.length})
            </button>
            <button
              onClick={() => setActiveTab('income')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'income'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text border border-dark-border/40 light:border-light-border/40'
              }`}
            >
              הכנסות ({incomeCategories.length})
            </button>
          </div>

          <button
            onClick={handleReclassifyAll}
            disabled={reclassifying}
            className="text-[11px] text-brand-cyan hover:underline flex items-center gap-1 font-medium disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{reclassifying ? 'מסווג מחדש...' : 'סווג מחדש את כל התנועות'}</span>
          </button>
        </div>

        {reclassifyResult && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-500 font-medium">
            סווגו מחדש בהצלחה {reclassifyResult.updated} מתוך {reclassifyResult.total} תנועות לפי עץ הקטגוריות ומאגר העסקים!
          </div>
        )}

        {/* Categories Tree Cards */}
        <div className="space-y-3">
          {activeCategories.map((cat) => {
            const isExpanded = expandedCats.has(cat.id);
            const subs = cat.subs || [];

            return (
              <div
                key={cat.id}
                className="rounded-2xl border border-dark-border light:border-light-border bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 overflow-hidden transition-all shadow-xs"
              >
                {/* Main Category Header Row */}
                <div 
                  className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-dark-surface-elevated/70 light:hover:bg-light-surface-elevated/70 transition-colors"
                  onClick={() => toggleExpand(cat.id)}
                >
                  {/* Category Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <CategoryBadge category={cat.name} customSvg={cat.customSvg} size={22} className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-xs sm:text-sm text-dark-text light:text-light-text flex items-center gap-2 flex-wrap">
                        <span className="truncate">{cat.name}</span>
                        {cat.nameEn && (
                          <span className="text-[11px] font-normal text-dark-text-muted light:text-light-text-muted">
                            ({cat.nameEn})
                          </span>
                        )}
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-dark-surface light:bg-light-surface border border-dark-border/60 light:border-light-border/60 text-dark-text-muted light:text-light-text-muted shrink-0">
                          {subs.length} תתי-קטגוריות
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                          cat.type === 'income' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                        }`}>
                          {cat.type === 'income' ? 'הכנסה' : 'הוצאה'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-dark-border/40 light:border-light-border/40" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => handleOpenAddSub(cat)}
                      className="px-2.5 py-1.5 rounded-lg border border-dark-border light:border-light-border hover:border-brand-primary text-[11px] font-semibold flex items-center gap-1 transition-colors bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text shrink-0"
                      title="הוסף תת-קטגוריה"
                    >
                      <Plus className="w-3.5 h-3.5 text-brand-primary" />
                      <span>תת-קטגוריה</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(cat)}
                      className="p-1.5 rounded-lg border border-dark-border/60 light:border-light-border/60 hover:bg-dark-surface light:hover:bg-light-surface text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text transition-colors shrink-0"
                      title="ערוך קטגוריה ראשית"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(cat)}
                      className="p-1.5 rounded-lg border border-dark-border/60 light:border-light-border/60 hover:bg-rose-500/10 text-dark-text-muted light:text-light-text-muted hover:text-rose-500 transition-colors shrink-0"
                      title="מחק קטגוריה ראשית"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleExpand(cat.id)}
                      className="p-1.5 rounded-lg hover:bg-dark-surface light:hover:bg-light-surface text-dark-text-muted light:text-light-text-muted transition-transform shrink-0"
                      title={isExpanded ? 'סגור תתי-קטגוריות' : 'הצג תתי-קטגוריות'}
                    >
                      <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Subcategories Grid */}
                {isExpanded && (
                  <div className="p-4 pt-2 border-t border-dark-border/40 light:border-light-border/40 bg-dark-surface/50 light:bg-light-surface/50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 mt-2">
                      {subs.map((sub) => (
                        <div
                          key={sub.id}
                          className="group p-2.5 rounded-xl border border-dark-border/60 light:border-light-border/60 bg-dark-surface light:bg-light-surface flex items-center justify-between gap-2 shadow-2xs hover:border-brand-primary/40 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <CategoryBadge category={sub.name} customSvg={sub.customSvg} size={16} className="scale-90" />
                            <div className="truncate">
                              <div className="text-xs font-semibold truncate text-dark-text light:text-light-text">
                                {sub.name}
                              </div>
                              {sub.nameEn && (
                                <div className="text-[10px] text-dark-text-muted light:text-light-text-muted truncate">
                                  {sub.nameEn}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(sub, cat.name)}
                              className="p-1 rounded-md text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated transition-colors"
                              title="ערוך תת-קטגוריה"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCategory(sub)}
                              className="p-1 rounded-md text-dark-text-muted light:text-light-text-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                              title="מחק תת-קטגוריה"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Quick Add Subcategory Card inside grid */}
                      <button
                        type="button"
                        onClick={() => handleOpenAddSub(cat)}
                        className="p-2.5 rounded-xl border border-dashed border-dark-border light:border-light-border hover:border-brand-primary text-dark-text-muted light:text-light-text-muted hover:text-brand-primary flex items-center justify-center gap-2 text-xs font-medium transition-colors bg-dark-surface/30 light:bg-light-surface/30"
                      >
                        <Plus className="w-4 h-4" />
                        <span>הוסף תת-קטגוריה</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Add / Edit Category & SVG Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-dark-surface light:bg-light-surface border border-dark-border light:border-light-border rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Tag className="w-5 h-5 text-brand-primary" />
                <span>
                  {editingCat
                    ? `עריכת קטגוריה: "${editingCat.name}"`
                    : modalParentId
                    ? `הוספת תת-קטגוריה תחת "${modalParentName}"`
                    : 'הוספת קטגוריה ראשית'}
                </span>
              </h3>
              <button onClick={() => { setIsModalOpen(false); setEditingCat(null); }} className="p-1 rounded-lg hover:bg-dark-surface-elevated text-dark-text-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitCategory} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">שם הקטגוריה (בעברית) *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="למשל: ספורט וכושר"
                    className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs focus:border-brand-primary focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">שם באנגלית (אופציונלי)</label>
                  <input
                    type="text"
                    value={formNameEn}
                    onChange={(e) => setFormNameEn(e.target.value)}
                    placeholder="e.g. Fitness"
                    className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs focus:border-brand-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">סוג תנועה</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs focus:border-brand-primary focus:outline-none cursor-pointer"
                  >
                    <option value="expense">הוצאה (Expense)</option>
                    <option value="income">הכנסה (Income)</option>
                    <option value="both">הכנסה והוצאה (Both)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">צבע נושא</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formColor}
                      onChange={(e) => setFormColor(e.target.value)}
                      className="w-10 h-10 p-0.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={formColor}
                      onChange={(e) => setFormColor(e.target.value)}
                      className="flex-1 p-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Custom SVG Section */}
              <div className="p-3.5 rounded-xl border border-dark-border/80 light:border-light-border/80 bg-dark-surface-elevated/60 light:bg-light-surface-elevated/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold flex items-center gap-1.5 text-dark-text light:text-light-text">
                    <FileCode className="w-4 h-4 text-brand-cyan" />
                    <span>עיצוב SVG מותאם אישית (אופציונלי)</span>
                  </div>

                  <label className="cursor-pointer px-2.5 py-1 rounded-lg bg-brand-cyan/10 hover:bg-brand-cyan/20 text-brand-cyan text-[11px] font-semibold flex items-center gap-1 transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>העלה קובץ .svg</span>
                    <input
                      type="file"
                      accept=".svg"
                      onChange={handleSvgFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <p className="text-[11px] text-dark-text-muted light:text-light-text-muted">
                  הדבק קוד SVG (תקני עם viewBox 0 0 24 24) או העלה קובץ. לחץ על "הורד מפרט ופרומפט SVG" לקבלת הנחיות מדויקות ליצירה עם AI.
                </p>

                <textarea
                  rows={3}
                  value={formSvg}
                  onChange={(e) => setFormSvg(e.target.value)}
                  placeholder="<svg viewBox='0 0 24 24' stroke='currentColor' fill='none' stroke-width='2'>...</svg>"
                  className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text font-mono text-[11px] focus:border-brand-primary focus:outline-none"
                  dir="ltr"
                />

                {/* Live Preview */}
                {formSvg && (
                  <div className="flex items-center gap-3 pt-1">
                    <span className="text-[11px] text-dark-text-muted light:text-light-text-muted">תצוגה מקדימה:</span>
                    <div
                      className="w-10 h-10 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center p-2 border border-brand-primary/30 [&>svg]:w-full [&>svg]:h-full [&>svg]:stroke-current"
                      dangerouslySetInnerHTML={{ __html: formSvg }}
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text text-xs font-medium hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated transition-colors"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={submittingCat || !formName.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-primary-hover disabled:opacity-50 transition-colors shadow-sm"
                >
                  {submittingCat ? 'שומר...' : editingCat ? 'עדכן קטגוריה' : 'שמור קטגוריה'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
