'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X, Search } from 'lucide-react';

export default function MultiSelectDropdown({
  label,
  options = [],
  selectedValues = [],
  onChange,
  placeholder = 'בחר...',
  icon: Icon = null,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
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

  const filteredOptions = options.filter((opt) =>
    opt.label?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    opt.secondaryLabel?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleOption = (id) => {
    const isSelected = selectedValues.includes(id);
    if (isSelected) {
      onChange(selectedValues.filter((v) => v !== id));
    } else {
      onChange([...selectedValues, id]);
    }
  };

  const handleSelectAll = () => {
    onChange(filteredOptions.map((o) => o.id));
  };

  const handleClearAll = () => {
    onChange([]);
  };

  const selectedCount = selectedValues.length;

  return (
    <div className={`relative inline-block ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border transition-all ${
          selectedCount > 0
            ? 'bg-brand-primary/10 border-brand-primary/40 text-brand-primary dark:text-brand-primary'
            : 'bg-dark-surface light:bg-light-surface border-dark-border light:border-light-border text-dark-text light:text-light-text hover:border-dark-border-hover'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon className="w-3.5 h-3.5 shrink-0 opacity-80" />}
          <span className="truncate">{label}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {selectedCount > 0 ? (
            <span className="flex items-center justify-center px-1.5 py-0.2 rounded-full bg-brand-primary text-white text-[10px] font-bold min-w-[18px]">
              {selectedCount}
            </span>
          ) : (
            <span className="text-dark-text-muted light:text-light-text-muted text-[11px] font-normal">
              ({placeholder})
            </span>
          )}

          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 opacity-60 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute right-0 rtl:right-0 ltr:left-0 mt-2 w-72 max-w-[calc(100vw-2rem)] max-h-96 z-50 bg-dark-surface-elevated light:bg-light-surface-elevated border border-dark-border light:border-light-border rounded-2xl shadow-2xl overflow-hidden flex flex-col backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Search Header */}
          <div className="p-2.5 border-b border-dark-border/60 light:border-light-border/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute right-2.5 rtl:right-2.5 ltr:left-2.5 top-2.5 text-dark-text-muted light:text-light-text-muted pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="חיפוש..."
                className="w-full pr-8 rtl:pr-8 ltr:pl-8 pl-3 rtl:pl-3 py-1.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-xs focus:outline-none focus:border-brand-primary"
                autoFocus
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute left-2.5 rtl:left-2.5 ltr:right-2.5 top-2 text-dark-text-muted hover:text-dark-text"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex items-center justify-between mt-2 px-1 text-[11px]">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-brand-primary hover:underline font-medium"
              >
                בחר הכל ({filteredOptions.length})
              </button>
              {selectedCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-dark-text-muted light:text-light-text-muted hover:text-brand-expense font-medium"
                >
                  נקה בחירה
                </button>
              )}
            </div>
          </div>

          {/* Options List */}
          <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
            {filteredOptions.length === 0 ? (
              <div className="p-4 text-center text-xs text-dark-text-muted light:text-light-text-muted">
                לא נמצאו תוצאות
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selectedValues.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleOption(opt.id)}
                    className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition-colors text-right ${
                      isSelected
                        ? 'bg-brand-primary/15 text-brand-primary font-semibold'
                        : 'hover:bg-dark-surface/60 light:hover:bg-light-surface/60 text-dark-text light:text-light-text'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Styled Squircle Checkbox */}
                      <div
                        className={`w-4 h-4 rounded-md flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-brand-primary text-white shadow-sm'
                            : 'border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>

                      {opt.icon && <div className="shrink-0">{opt.icon}</div>}

                      <span className="truncate">{opt.label}</span>
                    </div>

                    {opt.secondaryLabel && (
                      <span className="text-[10px] text-dark-text-muted light:text-light-text-muted shrink-0 font-mono">
                        {opt.secondaryLabel}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
