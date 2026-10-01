'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Plus, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Sparkles, 
  Check, 
  RotateCcw,
  Tag,
  Clock,
  Layers
} from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import CategoryBadge from '@/components/common/CategoryBadge';

const PRESET_CATEGORIES = [
  { key: 'dining', name: 'אוכל בחוץ', icon: 'Utensils', color: '#f59e0b' },
  { key: 'groceries', name: 'סופר ומכולת', icon: 'ShoppingBag', color: '#ec4899' },
  { key: 'fuel', name: 'דלק ותחבורה', icon: 'Fuel', color: '#f97316' },
  { key: 'shopping', name: 'קניות וביגוד', icon: 'Shirt', color: '#a855f7' },
  { key: 'bills', name: 'משק בית וחשבונות', icon: 'Home', color: '#6366f1' },
  { key: 'pharmacy', name: 'בריאות ופארם', icon: 'HeartPulse', color: '#ef4444' },
  { key: 'leisure', name: 'פנאי ובילויים', icon: 'Gamepad2', color: '#06b6d4' },
  { key: 'car', name: 'רכב ותחזוקה', icon: 'Car', color: '#e11d48' },
  { key: 'insurance', name: 'ביטוחים ופיננסים', icon: 'Shield', color: '#059669' },
  { key: 'education', name: 'חינוך והשכלה', icon: 'GraduationCap', color: '#3b82f6' },
  { key: 'vacation', name: 'חופשות וטיסות', icon: 'Plane', color: '#8b5cf6' },
];

export default function ConfigureAveragesModal({ currentLookbackMonths = 12, onClose, onSaved }) {
  const { lang, theme } = useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lookbackMonths, setLookbackMonths] = useState(currentLookbackMonths);
  const [averagesList, setAveragesList] = useState([]);
  const [availableCategories, setAvailableCategories] = useState([]);
  const [selectedToAdd, setSelectedToAdd] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true);
      try {
        const [settingsRes, catsRes] = await Promise.all([
          api.getSystemSettings(),
          api.getCategories(),
        ]);

        if (catsRes.data?.data) {
          setAvailableCategories(catsRes.data.data);
        }

        const s = settingsRes.data?.settings || {};
        if (s.analyticsAveragesLookbackMonths) {
          setLookbackMonths(parseInt(s.analyticsAveragesLookbackMonths, 10));
        }

        if (Array.isArray(s.analyticsCustomAverages) && s.analyticsCustomAverages.length > 0) {
          setAveragesList(s.analyticsCustomAverages);
        } else {
          setAveragesList(PRESET_CATEGORIES.slice(0, 7));
        }
      } catch (err) {
        console.error('Failed to load averages settings:', err);
        setAveragesList(PRESET_CATEGORIES.slice(0, 7));
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleMove = (index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= averagesList.length) return;
    const newList = [...averagesList];
    const temp = newList[index];
    newList[index] = newList[targetIndex];
    newList[targetIndex] = temp;
    setAveragesList(newList);
  };

  const handleRemove = (index) => {
    setAveragesList(averagesList.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    if (!selectedToAdd) return;
    if (averagesList.some((item) => item.name === selectedToAdd)) return;

    // Find in presets or availableCategories
    const preset = PRESET_CATEGORIES.find((p) => p.name === selectedToAdd);
    const cat = availableCategories.find((c) => c.name === selectedToAdd);

    const newItem = {
      key: preset?.key || selectedToAdd,
      name: selectedToAdd,
      icon: preset?.icon || cat?.icon || 'Tag',
      color: preset?.color || cat?.color || '#6366f1',
    };

    setAveragesList([...averagesList, newItem]);
    setSelectedToAdd('');
  };

  const handleResetDefault = () => {
    setAveragesList(PRESET_CATEGORIES.slice(0, 7));
    setLookbackMonths(12);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.getSystemSettings();
      const current = res.data?.settings || {};
      const updated = {
        ...current,
        analyticsAveragesLookbackMonths: lookbackMonths,
        analyticsCustomAverages: averagesList,
      };

      await api.updateSystemSettings(updated);
      setSavedSuccess(true);
      window.dispatchEvent(new CustomEvent('fintrack_settings_updated'));
      setTimeout(() => {
        setSavedSuccess(false);
        onSaved?.();
        onClose();
      }, 800);
    } catch (err) {
      console.error('Failed to save averages settings:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="w-full max-w-xl max-h-[92vh] bg-dark-surface light:bg-light-surface border border-dark-border light:border-light-border rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-dark-border light:border-light-border flex items-center justify-between bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-dark-text light:text-light-text">
                התאמה אישית של כרטיסי ממוצעים
              </h2>
              <p className="text-xs text-dark-text-muted light:text-light-text-muted">
                קבע אילו קטגוריות יוצגו בממוצעים החודשיים ומשך זמן החישוב
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated text-dark-text-muted hover:text-dark-text transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-6">
          
          {/* Lookback Months Selector */}
          <div className="p-4 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface-elevated/30 light:bg-light-surface-elevated/30 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-dark-text light:text-light-text flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-brand-primary" />
                <span>טווח חודשים לחישוב הממוצע החודשי:</span>
              </label>
              <span className="text-xs font-bold text-brand-primary font-mono">{lookbackMonths} חודשים</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 3, label: '3 חודשים' },
                { id: 6, label: '6 חודשים' },
                { id: 12, label: '12 חודשים (שנה)' },
                { id: 24, label: '24 חודשים (שנתיים)' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setLookbackMonths(m.id)}
                  className={`p-2 rounded-xl text-xs font-semibold border transition-all text-center ${
                    lookbackMonths === m.id
                      ? 'border-brand-primary bg-brand-primary text-white shadow-xs'
                      : 'border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text-muted hover:text-dark-text'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-dark-text-muted light:text-light-text-muted">
              סך כל ההוצאה בפועל בכל קטגוריה יחולק בדיוק במספר חודשים זה.
            </p>
          </div>

          {/* Add Category Section */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-dark-text light:text-light-text">
              הוסף קטגוריה לממוצעים:
            </label>
            <div className="flex items-center gap-2">
              <select
                value={selectedToAdd}
                onChange={(e) => setSelectedToAdd(e.target.value)}
                className="flex-1 px-3 py-2 text-xs rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text focus:outline-none focus:border-brand-primary"
              >
                <option value="">בחר קטגוריה להוספה...</option>
                {PRESET_CATEGORIES.filter(p => !averagesList.some(a => a.name === p.name)).map(p => (
                  <option key={p.key} value={p.name}>
                    {p.name} (מומלץ)
                  </option>
                ))}
                {availableCategories
                  .filter(c => !averagesList.some(a => a.name === c.name) && !PRESET_CATEGORIES.some(p => p.name === c.name))
                  .map(c => (
                    <option key={c.id || c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))
                }
              </select>

              <button
                type="button"
                onClick={handleAdd}
                disabled={!selectedToAdd}
                className="px-4 py-2 rounded-xl bg-brand-primary text-white text-xs font-semibold hover:bg-brand-primary-hover transition-colors disabled:opacity-40 flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>הוסף</span>
              </button>
            </div>
          </div>

          {/* Category List with Reorder and Delete */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-dark-text light:text-light-text">
                קטגוריות מוצגות ({averagesList.length}) - סדר התצוגה:
              </label>
              <button
                type="button"
                onClick={handleResetDefault}
                className="text-[11px] text-brand-primary hover:underline flex items-center gap-1 font-semibold"
              >
                <RotateCcw className="w-3 h-3" />
                <span>שחזר לברירת מחדל</span>
              </button>
            </div>

            <div className="space-y-2">
              {averagesList.map((item, idx) => (
                <div
                  key={item.key || idx}
                  className="p-3 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-dark-text-muted font-bold text-[11px] w-4">{idx + 1}.</span>
                    <CategoryBadge category={item.name} size={18} />
                    <span className="font-bold text-dark-text light:text-light-text">{item.name}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleMove(idx, 'up')}
                      disabled={idx === 0}
                      className="p-1.5 rounded-lg hover:bg-dark-surface light:hover:bg-light-surface text-dark-text-muted hover:text-dark-text disabled:opacity-30 transition-colors"
                      title="הזז למעלה"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(idx, 'down')}
                      disabled={idx === averagesList.length - 1}
                      className="p-1.5 rounded-lg hover:bg-dark-surface light:hover:bg-light-surface text-dark-text-muted hover:text-dark-text disabled:opacity-30 transition-colors"
                      title="הזז למטה"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(idx)}
                      className="p-1.5 rounded-lg hover:bg-rose-500/10 text-dark-text-muted hover:text-rose-500 transition-colors mr-1"
                      title="הסר"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-dark-border light:border-light-border flex items-center justify-between bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-dark-text-muted hover:text-dark-text transition-colors"
          >
            ביטול
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || savedSuccess}
            className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm ${
              savedSuccess
                ? 'bg-emerald-500 text-white'
                : 'bg-brand-primary text-white hover:bg-brand-primary-hover'
            }`}
          >
            {savedSuccess ? (
              <>
                <Check className="w-4 h-4" />
                <span>נשמר בהצלחה!</span>
              </>
            ) : saving ? (
              <span>שומר...</span>
            ) : (
              <span>שמור הגדרות</span>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
