'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Brain,
  Search,
  Trash2,
  Check,
  RefreshCw,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Filter,
  ArrowLeft,
  Sparkles,
  Calendar,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import CategoryBadge from '@/components/common/CategoryBadge';

export default function LearnedRulesSection() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState('all'); // 'all', 'active', 'inactive'
  const [updatingId, setUpdatingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);

  const fetchRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getCategoryRules();
      if (res && res.data) {
        setRules(res.data);
      }
    } catch (err) {
      console.error('Error fetching category rules:', err);
      setError('לא ניתן לטעון את הרגלי הלמידה');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleToggle = async (rule) => {
    const nextState = !rule.isActive;
    setUpdatingId(rule.id);
    // Optimistic UI update
    setRules((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, isActive: nextState } : r))
    );

    try {
      await api.updateCategoryRule(rule.id, { isActive: nextState });
    } catch (err) {
      console.error('Failed to toggle rule state:', err);
      // Revert on error
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, isActive: !nextState } : r))
      );
      setError('שגיאה בעדכון מצב ההרגל');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (ruleId) => {
    if (!window.confirm('האם אתה בטוח שברצונך למחוק הרגל למידה זה? המערכת תשכח אותו.')) {
      return;
    }

    setDeletingId(ruleId);
    try {
      await api.deleteCategoryRule(ruleId);
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch (err) {
      console.error('Failed to delete rule:', err);
      setError('שגיאה במחיקת ההרגל');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredRules = useMemo(() => {
    return rules.filter((r) => {
      const matchesSearch =
        !search ||
        (r.merchantPattern && r.merchantPattern.toLowerCase().includes(search.toLowerCase())) ||
        (r.category && r.category.toLowerCase().includes(search.toLowerCase())) ||
        (r.subCategory && r.subCategory.toLowerCase().includes(search.toLowerCase())) ||
        (r.descriptionHe && r.descriptionHe.toLowerCase().includes(search.toLowerCase()));

      const matchesFilter =
        filterActive === 'all' ||
        (filterActive === 'active' && r.isActive !== false) ||
        (filterActive === 'inactive' && r.isActive === false);

      return matchesSearch && matchesFilter;
    });
  }, [rules, search, filterActive]);

  const activeCount = useMemo(() => rules.filter((r) => r.isActive !== false).length, [rules]);
  const inactiveCount = rules.length - activeCount;

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                הרגלי למידה וסנטימנטים פעילים
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  {rules.length} הרגלים
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                שליטה מלאה ושקופה בהרגלים שה-AI למד מסיווגי העבר שלך. תוכל לכבות כל סנטימנט בלחיצה אם אינו מדויק.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={fetchRules}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 rounded-xl border border-slate-700/60 transition-colors disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          רענן
        </button>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-xs text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="mt-5 flex flex-col sm:flex-row items-center gap-3">
        <div className="relative w-full sm:flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם בית עסק, קטגוריה או הערה..."
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl pr-9 pl-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/60 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
            >
              נקה
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 self-stretch sm:self-auto bg-slate-800/40 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setFilterActive('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filterActive === 'all'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            הכל ({rules.length})
          </button>
          <button
            onClick={() => setFilterActive('active')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filterActive === 'active'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            פעילים ({activeCount})
          </button>
          <button
            onClick={() => setFilterActive('inactive')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filterActive === 'inactive'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            מושבתים ({inactiveCount})
          </button>
        </div>
      </div>

      {/* Rules List */}
      <div className="mt-4">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-purple-400" />
            <span className="text-sm">טוען הרגלי למידה...</span>
          </div>
        ) : filteredRules.length === 0 ? (
          <div className="py-12 text-center text-slate-400 bg-slate-800/20 rounded-xl border border-slate-800/60 p-6">
            <Brain className="w-10 h-10 mx-auto text-slate-600 mb-2 opacity-50" />
            <p className="text-sm font-medium text-slate-300">לא נמצאו הרגלי למידה</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              כשתסווג תנועות ידנית או תאשר המלצות, המערכת תזהה את דפוסי ההעדפה שלך ותציג אותם כאן לניהול ושליטה.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-1">
            {filteredRules.map((rule) => {
              const isActive = rule.isActive !== false;
              const hasDowContext = rule.contextConditions?.dayOfWeek || rule.contextConditions?.dow;

              return (
                <div
                  key={rule.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isActive
                      ? 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600/80'
                      : 'bg-slate-900/40 border-slate-800/60 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Merchant pattern & badges */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white text-sm bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-700/60 truncate max-w-[200px]" title={rule.merchantPattern}>
                          {rule.merchantPattern}
                        </span>

                        <span className="text-slate-500 text-xs">
                          {rule.matchType === 'contains' ? 'מכיל' : 'מדויק'}
                        </span>

                        {hasDowContext && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            ימי שישי
                          </span>
                        )}

                        {rule.descriptionHe && (
                          <span className="text-[11px] text-slate-400 truncate max-w-[150px]" title={rule.descriptionHe}>
                            {rule.descriptionHe}
                          </span>
                        )}
                      </div>

                      {/* Direction to Category */}
                      <div className="mt-3 flex items-center gap-2 text-xs">
                        <ArrowLeft className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <CategoryBadge category={rule.subCategory || rule.category} size={18} />
                          <span className="font-medium text-slate-200">
                            {rule.subCategory ? `${rule.category} • ${rule.subCategory}` : rule.category}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions: Toggle & Delete */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleToggle(rule)}
                        disabled={updatingId === rule.id}
                        title={isActive ? 'השבת הרגל זה (המערכת תתעלם ממנו)' : 'הפעל הרגל זה'}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isActive
                            ? 'text-emerald-400 hover:bg-emerald-500/10'
                            : 'text-slate-500 hover:bg-slate-800'
                        }`}
                      >
                        {isActive ? (
                          <ToggleRight className="w-6 h-6" />
                        ) : (
                          <ToggleLeft className="w-6 h-6" />
                        )}
                      </button>

                      <button
                        onClick={() => handleDelete(rule.id)}
                        disabled={deletingId === rule.id}
                        title="מחק ושכח הרגל זה לצמיתות"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
