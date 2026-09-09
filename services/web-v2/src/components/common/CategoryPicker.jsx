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
        <div className="flex items-center gap-2.5 overflow-hidden">
          {value ? (
            <>
              <CategoryBadge category={value} size={16} />
              <div className="text-right min-w-0">
                <div className="text-sm font-semibold text-dark-text-primary light:text-light-text-primary truncate">
                  {selectedDetails?.subCat?.name || value}
                </div>
                {selectedDetails?.mainCat?.name && selectedDetails.mainCat.name !== (selectedDetails?.subCat?.name || value) && (
                  <div className="text-xs text-dark-text-muted light:text-light-text-muted truncate">
                    {selectedDetails.mainCat.name}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-dark-text-muted light:text-light-text-muted text-sm py-0.5">
              <span className="w-7 h-7 rounded-lg bg-dark-border/40 light:bg-light-border/40 flex items-center justify-center text-xs">
                🏷️
              </span>
              <span>{placeholder}</span>
            </div>
          )}
        </div>

        <ChevronDown className={`w-4 h-4 text-dark-text-muted transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Modal / Popover */}
      {isOpen && (
        <div className="absolute top-full mt-2 left-0 right-0 z-50 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface shadow-2xl overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[560px] animate-in fade-in zoom-in-95 duration-150">
          {/* Header: Tabs & Search */}
          <div className="p-2.5 border-b border-dark-border light:border-light-border space-y-2 bg-dark-surface-elevated/60 light:bg-light-surface-elevated/60 backdrop-blur-xs shrink-0">
            {/* Type Switcher */}
            <div className="grid grid-cols-2 gap-1 p-0.5 bg-dark-surface light:bg-light-surface rounded-xl border border-dark-border light:border-light-border text-xs font-medium">
              <button
                type="button"
                onClick={() => { setActiveTab('expense'); setSearch(''); }}
                className={`py-1 rounded-lg transition-all text-xs font-semibold flex items-center justify-center gap-1.5 ${
                  activeTab === 'expense'
                    ? 'bg-rose-500/15 text-rose-500 shadow-xs'
                    : 'text-dark-text-muted hover:text-dark-text-primary'
                }`}
              >
                <span>📉</span>
                <span>הוצאות</span>
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('income'); setSearch(''); }}
                className={`py-1 rounded-lg transition-all text-xs font-semibold flex items-center justify-center gap-1.5 ${
                  activeTab === 'income'
                    ? 'bg-emerald-500/15 text-emerald-500 shadow-xs'
                    : 'text-dark-text-muted hover:text-dark-text-primary'
                }`}
              >
                <span>📈</span>
                <span>הכנסות</span>
              </button>
            </div>

            {/* Search input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-dark-text-muted pointer-events-none" />
              <input
                type="text"
                placeholder="חיפוש מהיר של קטגוריה או תת-קטגוריה..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pr-8 pl-3 py-1.5 text-xs rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface focus:outline-none focus:border-brand-primary placeholder:text-dark-text-muted/60"
              />
            </div>
          </div>

          {/* Categories & Subcategories List */}
          <div className="flex-1 overflow-y-auto p-1.5 space-y-1 divide-y divide-dark-border/20 light:divide-light-border/20 overscroll-contain">
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
                  <div key={cat.id} className="pt-1 first:pt-0">
                    {/* Main Category Row */}
                    <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl transition-colors group cursor-pointer ${
                      isSelectedMain 
                        ? 'bg-brand-primary/10 border border-brand-primary/30' 
                        : 'hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated border border-transparent'
                    }`}>
                      <button
                        type="button"
                        onClick={() => {
                          if (hasSubs) {
                            setExpandedCatId(isExpanded ? null : cat.id);
                          } else {
                            handleSelect(cat.name);
                          }
                        }}
                        className="flex items-center gap-2.5 flex-1 text-right min-w-0"
                      >
                        <CategoryBadge category={cat.name} size={15} />
                        <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                          <span className="text-xs sm:text-sm font-semibold text-dark-text-primary light:text-light-text-primary truncate">
                            {cat.name}
                          </span>
                          {hasSubs && (
                            <span className="text-[10px] text-dark-text-muted light:text-light-text-muted shrink-0 bg-dark-surface-elevated light:bg-light-surface-elevated px-1.5 py-0.5 rounded-md border border-dark-border/40 light:border-light-border/40">
                              {cat.subs.length}
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
                          className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-dark-text-muted transition-transform ml-1"
                          title={isExpanded ? 'סגור תתי-קטגוריות' : 'פתח תתי-קטגוריות'}
                        >
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-brand-primary' : ''}`} />
                        </button>
                      )}
                    </div>

                    {/* Subcategories Grid / List */}
                    {hasSubs && isExpanded && (
                      <div className="mr-4 ml-1 mt-1 mb-1.5 pr-2 pl-1 border-r-2 border-brand-primary/40 space-y-1">
                        {/* Option to select the main parent category */}
                        <button
                          type="button"
                          onClick={() => handleSelect(cat.name)}
                          className={`w-full flex items-center justify-between px-2 py-1 rounded-lg text-xs transition-colors text-right ${
                            isSelectedMain
                              ? 'bg-brand-primary/15 text-brand-primary font-bold'
                              : 'hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated text-dark-text-muted'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 font-medium text-xs">
                            <span>📌</span>
                            <span>בחר כללי: "{cat.name}"</span>
                          </div>
                          {isSelectedMain && <Check className="w-3.5 h-3.5 text-brand-primary" />}
                        </button>

                        {/* Subcategories Grid - 2 columns for quick access and density */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-0.5">
                          {cat.subs.map((sub) => {
                            const isSelectedSub = value === sub.name;
                            return (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() => handleSelect(sub.name)}
                                className={`flex items-center justify-between px-2 py-1 rounded-lg text-xs transition-colors text-right ${
                                  isSelectedSub
                                    ? 'bg-brand-primary/15 text-brand-primary font-bold border border-brand-primary/30'
                                    : 'hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated text-dark-text-primary light:text-light-text-primary'
                                }`}
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <CategoryBadge category={sub.name} size={12} className="shrink-0" />
                                  <span className="truncate">{sub.name}</span>
                                </div>
                                {isSelectedSub && <Check className="w-3 h-3 text-brand-primary shrink-0 mr-1" />}
                              </button>
                            );
                          })}
                        </div>
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
