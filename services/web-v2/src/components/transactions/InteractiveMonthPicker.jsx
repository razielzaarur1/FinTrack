'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Calendar, ChevronDown, Check, ChevronLeft, ChevronRight, X, Clock } from 'lucide-react';
import { HEBREW_MONTHS_SHORT, HEBREW_MONTHS_FULL, pad2 } from '@/lib/date-utils';

/**
 * Interactive Year & Month Picker tailored dynamically to actual transactions in the system.
 * Allows quick jumping to any year, selecting individual months, whole years, or all time,
 * with active transaction count or indicator.
 */
export default function InteractiveMonthPicker({
  allMonths = [],
  selectedMonthValue = 'all',
  onChange,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Group months by year
  const yearsMap = useMemo(() => {
    const map = new Map();
    (allMonths || []).forEach((m) => {
      const y = m.year;
      if (!map.has(y)) {
        map.set(y, []);
      }
      map.get(y).push(m);
    });
    return map;
  }, [allMonths]);

  const availableYears = useMemo(() => {
    const years = Array.from(yearsMap.keys()).sort((a, b) => b - a);
    return years.length > 0 ? years : [new Date().getFullYear()];
  }, [yearsMap]);

  // Determine active year in navigation view
  const currentSelectedYear = useMemo(() => {
    if (selectedMonthValue && selectedMonthValue.includes('-')) {
      const y = parseInt(selectedMonthValue.split('-')[0], 10);
      if (!isNaN(y)) return y;
    }
    return availableYears[0];
  }, [selectedMonthValue, availableYears]);

  const [viewYear, setViewYear] = useState(currentSelectedYear);

  useEffect(() => {
    if (currentSelectedYear) {
      setViewYear(currentSelectedYear);
    }
  }, [currentSelectedYear]);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Label to show on the main button
  const triggerLabel = useMemo(() => {
    if (!selectedMonthValue || selectedMonthValue === 'all') {
      return 'כל התקופות';
    }
    if (selectedMonthValue.startsWith('year_')) {
      return `שנת ${selectedMonthValue.replace('year_', '')}`;
    }
    const match = allMonths.find((m) => m.monthKey === selectedMonthValue);
    if (match) {
      return match.label;
    }
    return selectedMonthValue;
  }, [selectedMonthValue, allMonths]);

  const currentYearMonths = useMemo(() => {
    return yearsMap.get(viewYear) || [];
  }, [yearsMap, viewYear]);

  const handleSelectMonth = (monthKey) => {
    onChange(monthKey);
    setIsOpen(false);
  };

  const handleSelectWholeYear = (y) => {
    onChange(`year_${y}`);
    setIsOpen(false);
  };

  const handleSelectAll = () => {
    onChange('all');
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold shadow-2xs transition-all cursor-pointer ${
          selectedMonthValue !== 'all'
            ? 'bg-brand-primary/10 border-brand-primary text-brand-primary'
            : 'border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text hover:border-brand-primary/40'
        }`}
        title="בחירת חודש ושנה מותאמת לכל ההיסטוריה"
      >
        <Calendar className="w-3.5 h-3.5 text-brand-primary shrink-0" />
        <span className="truncate max-w-[130px] sm:max-w-none">{triggerLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-dark-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Interactive Popover Menu */}
      {isOpen && (
        <div className="absolute top-full mt-2 rtl:right-0 ltr:left-0 z-50 w-72 sm:w-80 bg-dark-surface light:bg-light-surface border border-dark-border light:border-light-border rounded-2xl shadow-2xl p-3 space-y-3 animate-in fade-in zoom-in-95 duration-150">
          {/* Header Quick Options: All Time */}
          <div className="flex items-center justify-between pb-2 border-b border-dark-border/60 light:border-light-border/60">
            <button
              type="button"
              onClick={handleSelectAll}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                selectedMonthValue === 'all'
                  ? 'bg-brand-primary text-white shadow-xs'
                  : 'text-dark-text-muted hover:text-dark-text hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated'
              }`}
            >
              כל התקופות
            </button>

            <button
              type="button"
              onClick={() => handleSelectWholeYear(viewYear)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                selectedMonthValue === `year_${viewYear}`
                  ? 'bg-brand-primary text-white shadow-xs'
                  : 'text-brand-primary hover:bg-brand-primary/10'
              }`}
              title={`סנן את כל תנועות שנת ${viewYear}`}
            >
              כל שנת {viewYear}
            </button>
          </div>

          {/* Year Switcher Header */}
          <div className="flex items-center justify-between px-1">
            <button
              type="button"
              onClick={() => {
                const idx = availableYears.indexOf(viewYear);
                if (idx < availableYears.length - 1) setViewYear(availableYears[idx + 1]);
              }}
              disabled={availableYears.indexOf(viewYear) >= availableYears.length - 1}
              className="p-1 rounded-lg hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated text-dark-text-muted hover:text-dark-text disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="שנה קודמת"
            >
              <ChevronRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
            </button>

            {/* Quick Year Pill Selectors */}
            <div className="flex items-center gap-1 overflow-x-auto max-w-[180px] no-scrollbar py-0.5">
              {availableYears.map((yr) => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => setViewYear(yr)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 ${
                    viewYear === yr
                      ? 'bg-brand-primary/20 text-brand-primary border border-brand-primary/40'
                      : 'text-dark-text-muted hover:text-dark-text hover:bg-dark-surface-elevated'
                  }`}
                >
                  {yr}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                const idx = availableYears.indexOf(viewYear);
                if (idx > 0) setViewYear(availableYears[idx - 1]);
              }}
              disabled={availableYears.indexOf(viewYear) <= 0}
              className="p-1 rounded-lg hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated text-dark-text-muted hover:text-dark-text disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="שנה הבאה"
            >
              <ChevronLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
            </button>
          </div>

          {/* 12-Month Interactive Grid for the Selected Year */}
          <div className="grid grid-cols-3 gap-1.5 pt-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((mNum) => {
              const monthKey = `${viewYear}-${pad2(mNum)}`;
              const monthData = currentYearMonths.find((m) => m.month === mNum);
              const isSelected = selectedMonthValue === monthKey;
              const hasData = Boolean(monthData);

              return (
                <button
                  key={mNum}
                  type="button"
                  disabled={!hasData}
                  onClick={() => handleSelectMonth(monthKey)}
                  className={`p-2 rounded-xl text-center flex flex-col items-center justify-center transition-all ${
                    isSelected
                      ? 'bg-brand-primary text-white font-bold shadow-sm ring-2 ring-brand-primary/30'
                      : hasData
                      ? 'bg-dark-surface-elevated light:bg-light-surface-elevated hover:bg-brand-primary/10 hover:text-brand-primary text-dark-text light:text-light-text font-semibold border border-dark-border/50 light:border-light-border/50'
                      : 'opacity-30 cursor-not-allowed bg-dark-surface-elevated/30 light:bg-light-surface-elevated/30 text-dark-text-muted'
                  }`}
                >
                  <span className="text-xs">{HEBREW_MONTHS_SHORT[mNum - 1]}</span>
                  {monthData && (
                    <span className="text-[9px] opacity-75 font-mono mt-0.5">
                      {monthData.displayRange?.split('–')[0]?.trim() || ''}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Dynamic Footer note */}
          <div className="pt-2 border-t border-dark-border/50 light:border-light-border/50 text-[10px] text-dark-text-muted text-center">
            {availableYears.length > 1
              ? `נמצאו נתונים לאורך ${availableYears.length} שנים (${availableYears[availableYears.length - 1]}–${availableYears[0]})`
              : `נמצאו נתונים עבור שנת ${availableYears[0]}`}
          </div>
        </div>
      )}
    </div>
  );
}
