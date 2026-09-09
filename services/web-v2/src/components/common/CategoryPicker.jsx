'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Search, Check, Sparkles } from 'lucide-react';
import { CATEGORIES_DATA, getCategoryDetails } from '@/lib/categories';
import CategoryBadge from './CategoryBadge';

export default function CategoryPicker({
  value,
  onChange,
  className = '',
  disabled = false,
  placeholder = 'בחר קטגוריה...',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('expense'); // 'expense' | 'income'
  const [search, setSearch] = useState('');
  const [expandedCatId, setExpandedCatId] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isOpen]);

  const selectedDetails = useMemo(() => {
    if (!value) return null;
    return getCategoryDetails(value);
  }, [value]);

  // Categories list for current tab
  const list = activeTab === 'expense' ? CATEGORIES_DATA.expenses : CATEGORIES_DATA.incomes;

  // Filtered categories
  const filteredCategories = useMemo(() => {
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();

    return list
      .map((cat) => {
        const matchesMain = cat.name.toLowerCase().includes(q);
        const matchedSubs = (cat.subs || []).filter((s) => s.name.toLowerCase().includes(q));
        if (matchesMain || matchedSubs.length > 0) {
          return {
            ...cat,
            subs: matchedSubs.length > 0 ? matchedSubs : cat.subs,
            autoExpanded: true,
          };
        }
        return null;
      })
      .filter(Boolean);
  }, [list, search]);

  const handleSelect = (categoryName) => {
    onChange?.(categoryName);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated hover:border-brand-primary/50 transition-colors text-right cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="flex items-center gap-3 overflow-hidden">
          {value ? (
            <>
              <CategoryBadge category={value} size={18} />
              <div className="text-right">
                <div className="text-sm font-medium text-dark-text-primary light:text-light-text-primary">
                  {selectedDetails?.subCat?.name || value}
                </div>
                {selectedDetails?.mainCat?.name && selectedDetails.mainCat.name !== (selectedDetails?.subCat?.name || value) && (
                  <div className="text-xs text-dark-text-muted light:text-light-text-muted">
                    {selectedDetails.mainCat.name}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-dark-text-muted light:text-light-text-muted text-sm py-1">
              <span className="w-8 h-8 rounded-lg bg-dark-border/40 light:bg-light-border/40 flex items-center justify-center text-xs">
                🏷️
              </span>
              <span>{placeholder}</span>
            </div>
          )}
        </div>

        <ChevronDown className={`w-4 h-4 text-dark-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Modal / Popover */}
      {isOpen && (
        <div className="absolute top-full mt-2 left-0 right-0 z-50 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface shadow-2xl overflow-hidden flex flex-col max-h-[70vh] sm:max-h-[440px] animate-in fade-in zoom-in-95 duration-150">
            {/* Header: Tabs & Search */}
            <div className="p-3 border-b border-dark-border light:border-light-border space-y-2 bg-dark-surface-elevated/50 light:bg-light-surface-elevated/50">
              {/* Type Switcher */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-dark-surface light:bg-light-surface rounded-xl border border-dark-border light:border-light-border text-xs font-medium">
                <button
                  type="button"
                  onClick={() => { setActiveTab('expense'); setSearch(''); }}
                  className={`py-1.5 rounded-lg transition-all ${
                    activeTab === 'expense'
                      ? 'bg-rose-500/15 text-rose-500 font-semibold shadow-xs'
                      : 'text-dark-text-muted hover:text-dark-text-primary'
                  }`}
                >
                  הוצאות
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab('income'); setSearch(''); }}
                  className={`py-1.5 rounded-lg transition-all ${
                    activeTab === 'income'
                      ? 'bg-emerald-500/15 text-emerald-500 font-semibold shadow-xs'
                      : 'text-dark-text-muted hover:text-dark-text-primary'
                  }`}
                >
                  הכנסות
                </button>
              </div>

              {/* Search input */}
              <div className="relative">
                <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-dark-text-muted pointer-events-none" />
                <input
                  type="text"
                  placeholder="חיפוש קטגוריה או תת-קטגוריה..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pr-9 pl-3 py-1.5 text-xs rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface focus:outline-none focus:border-brand-primary"
                />
              </div>
            </div>

            {/* Categories & Subcategories List */}
            <div className="overflow-y-auto p-2 space-y-1.5 divide-y divide-dark-border/20 light:divide-light-border/20">
              {filteredCategories.length === 0 ? (
                <div className="py-8 text-center text-xs text-dark-text-muted">
                  לא נמצאו קטגוריות מתאימות
                </div>
              ) : (
                filteredCategories.map((cat) => {
                  const isExpanded = cat.autoExpanded || expandedCatId === cat.id;
                  const hasSubs = cat.subs && cat.subs.length > 0;
                  const isSelectedMain = value === cat.name;

                  return (
                    <div key={cat.id} className="pt-1.5 first:pt-0">
                      {/* Main Category Row */}
                      <div className="flex items-center justify-between p-2 rounded-xl hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated transition-colors group">
                        <button
                          type="button"
                          onClick={() => {
                            if (hasSubs) {
                              setExpandedCatId(isExpanded ? null : cat.id);
                            } else {
                              handleSelect(cat.name);
                            }
                          }}
                          className="flex items-center gap-3 flex-1 text-right cursor-pointer"
                        >
                          <CategoryBadge category={cat.name} size={18} />
                          <div>
                            <div className="text-sm font-semibold text-dark-text-primary light:text-light-text-primary flex items-center gap-1.5">
                              <span>{cat.name}</span>
                              {isSelectedMain && <Check className="w-4 h-4 text-brand-primary" />}
                            </div>
                            {hasSubs && (
                              <span className="text-[11px] text-dark-text-muted light:text-light-text-muted">
                                {cat.subs.length} תתי-קטגוריות • לחץ לפתיחה
                              </span>
                            )}
                          </div>
                        </button>

                        {/* Expand / Collapse Subcategories Button */}
                        {hasSubs && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedCatId(isExpanded ? null : cat.id);
                            }}
                            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-dark-text-muted transition-transform cursor-pointer"
                            title={isExpanded ? 'סגור תתי-קטגוריות' : 'פתח תתי-קטגוריות'}
                          >
                            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-brand-primary' : ''}`} />
                          </button>
                        )}
                      </div>

                      {/* Subcategories Grid / List */}
                      {hasSubs && isExpanded && (
                        <div className="mr-6 ml-2 mt-1 mb-2 pl-2 border-r-2 border-dark-border/60 light:border-light-border/60 space-y-1">
                          {/* Option to select the main parent category */}
                          <button
                            type="button"
                            onClick={() => handleSelect(cat.name)}
                            className={`w-full flex items-center justify-between p-1.5 rounded-lg text-xs transition-colors text-right ${
                              isSelectedMain
                                ? 'bg-brand-primary/15 text-brand-primary font-bold'
                                : 'hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated text-dark-text-muted'
                            }`}
                          >
                            <div className="flex items-center gap-2 font-medium">
                              <span>📌</span>
                              <span>בחר "{cat.name}" (קטגוריית אב)</span>
                            </div>
                            {isSelectedMain && <Check className="w-3.5 h-3.5 text-brand-primary" />}
                          </button>

                          {cat.subs.map((sub) => {
                            const isSelectedSub = value === sub.name;
                            return (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() => handleSelect(sub.name)}
                                className={`w-full flex items-center justify-between p-1.5 rounded-lg text-xs transition-colors text-right ${
                                  isSelectedSub
                                    ? 'bg-brand-primary/15 text-brand-primary font-bold'
                                    : 'hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated text-dark-text-primary light:text-light-text-primary'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <CategoryBadge category={sub.name} size={14} className="scale-75 -my-1" />
                                  <span>{sub.name}</span>
                                </div>
                                {isSelectedSub && <Check className="w-3.5 h-3.5 text-brand-primary" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
      )}
    </div>
  );
}
