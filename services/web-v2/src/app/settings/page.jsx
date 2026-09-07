'use client';

import React, { useState, useEffect } from 'react';
import { 
  Tag, 
  Plus, 
  Trash2, 
  Check, 
  Download, 
  Palette, 
  ShieldAlert, 
  Settings as SettingsIcon,
  RefreshCw
} from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';

export default function SettingsPage() {
  const { lang, t, theme, toggleTheme, toggleLanguage } = useApp();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // New Category form
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [type, setType] = useState('expense');
  const [color, setColor] = useState('#6366f1');
  const [submitting, setSubmitting] = useState(false);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const res = await api.getCategories();
      if (res.data) setCategories(res.data.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.createCategory({
        name: name.trim(),
        nameEn: nameEn.trim() || undefined,
        type,
        color,
      });
      if (res.data) {
        setName('');
        setNameEn('');
        loadCategories();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCategory = async (id) => {
    const res = await api.deleteCategory(id);
    if (res.data) {
      setCategories(categories.filter((c) => c.id !== id));
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">
          {t('settings')}
        </h1>
        <p className="text-xs text-dark-text-muted light:text-light-text-muted">
          {lang === 'he' ? 'ניהול קטגוריות מותאמות אישית, שפה, תצוגה ומערכת' : 'Custom category management, localization, and system display'}
        </p>
      </div>

      {/* General Display Settings */}
      <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-brand-primary" />
          <span>{lang === 'he' ? 'העדפות תצוגה ושפה' : 'Display & Localization'}</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated flex items-center justify-between">
            <div>
              <div className="font-semibold">{lang === 'he' ? 'שפת ממשק' : 'Interface Language'}</div>
              <div className="text-dark-text-muted">{lang === 'he' ? 'עברית (RTL) / English (LTR)' : 'English (LTR) / Hebrew (RTL)'}</div>
            </div>
            <button
              onClick={toggleLanguage}
              className="px-3 py-1.5 rounded-lg bg-brand-primary text-white font-semibold"
            >
              {lang === 'he' ? 'Switch to English' : 'עבור לעברית'}
            </button>
          </div>

          <div className="p-4 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated flex items-center justify-between">
            <div>
              <div className="font-semibold">{lang === 'he' ? 'ערכת נושא' : 'Theme Mode'}</div>
              <div className="text-dark-text-muted">{theme === 'dark' ? t('darkMode') : t('lightMode')}</div>
            </div>
            <button
              onClick={toggleTheme}
              className="px-3 py-1.5 rounded-lg border border-dark-border bg-dark-surface font-semibold"
            >
              {theme === 'dark' ? '☀️ ' + t('lightMode') : '🌙 ' + t('darkMode')}
            </button>
          </div>
        </div>
      </div>

      {/* Category Manager */}
      <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-6">
        <div>
          <h3 className="font-semibold text-base flex items-center gap-2">
            <Tag className="w-5 h-5 text-brand-cyan" />
            <span>{lang === 'he' ? 'ניהול קטגוריות (הכנסות והוצאות)' : 'Category Manager (Income & Expense)'}</span>
          </h3>
          <p className="text-xs text-dark-text-muted mt-0.5">
            {lang === 'he' ? 'הוסף קטגוריות מותאמות אישית עם הפרדה ברורה בין הכנסה להוצאה' : 'Define custom categories with clear income/expense separation'}
          </p>
        </div>

        {/* Create Category Form */}
        <form onSubmit={handleCreateCategory} className="p-4 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated space-y-3">
          <div className="text-xs font-semibold">{lang === 'he' ? '+ הוסף קטגוריה חדשה' : '+ Add New Category'}</div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={lang === 'he' ? 'שם בעברית (למשל: חשמל)' : 'Name in Hebrew'}
              className="p-2.5 rounded-lg border border-dark-border bg-dark-surface light:bg-light-surface"
            />
            <input
              type="text"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder={lang === 'he' ? 'שם באנגלית (אופציונלי)' : 'English Name (Optional)'}
              className="p-2.5 rounded-lg border border-dark-border bg-dark-surface light:bg-light-surface"
            />
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="p-2.5 rounded-lg border border-dark-border bg-dark-surface light:bg-light-surface"
            >
              <option value="expense">{t('expense')}</option>
              <option value="income">{t('income')}</option>
              <option value="both">{t('both')}</option>
            </select>
            <div className="flex gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-10 h-9 p-0.5 rounded-lg border border-dark-border bg-dark-surface cursor-pointer"
              />
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-2 rounded-lg bg-brand-primary text-white font-semibold shadow-md"
              >
                {submitting ? '...' : (lang === 'he' ? 'הוסף' : 'Add')}
              </button>
            </div>
          </div>
        </form>

        {/* Existing Categories Table */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="p-3 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                <div className="truncate">
                  <span className="font-semibold">{cat.name}</span>
                  {cat.nameEn && <span className="text-dark-text-muted text-[10px] ml-1">({cat.nameEn})</span>}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  cat.type === 'income' ? 'bg-brand-income/20 text-brand-income' : cat.type === 'expense' ? 'bg-brand-expense/20 text-brand-expense' : 'bg-gray-500/20 text-gray-400'
                }`}>
                  {cat.type === 'income' ? t('income') : cat.type === 'expense' ? t('expense') : t('both')}
                </span>

                {!cat.isSystem && (
                  <button
                    onClick={() => handleDeleteCategory(cat.id)}
                    className="p-1 hover:bg-dark-surface text-brand-expense rounded"
                    title={t('delete')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
