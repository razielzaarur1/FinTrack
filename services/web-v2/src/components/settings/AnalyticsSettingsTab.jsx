'use client';

import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Calendar, 
  Clock, 
  Layers, 
  Plus, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Sparkles, 
  Check, 
  RotateCcw, 
  Eye, 
  EyeOff, 
  Scale, 
  TrendingUp, 
  Store, 
  Receipt, 
  Flame,
  CheckCircle2
} from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import CategoryBadge from '@/components/common/CategoryBadge';

const DEFAULT_WIDGET_DEFS = [
  { id: 'kpi_balance', label: 'ממוצעים ומאזן חודשי כולל (KPIs + כרטיס תזרים)', icon: Scale },
  { id: 'trend_chart', label: 'גרף הכנסות מול הוצאות לאורך זמן', icon: BarChart3 },
  { id: 'category_averages', label: 'כרטיסי ממוצעים חודשיים לפי קטגוריות נבחרות', icon: Sparkles },
  { id: 'deep_stats', label: 'סטטיסטיקות עומק: הוצאות קבועות/משתנות, קצב יומי וימי השבוע', icon: Flame },
  { id: 'category_breakdown', label: 'התפלגות קטגוריות (דונאט)', icon: Layers },
  { id: 'top_merchants', label: 'בתי עסק מובילים', icon: Store },
  { id: 'top_expenses', label: 'ההוצאות הגדולות ביותר בתקופה', icon: Receipt },
  { id: 'ai_studio', label: 'מחולל תובנות וגרפים AI דינמי (Prompt to Widget)', icon: Sparkles },
];

const PRESET_AVERAGE_CATS = [
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

export default function AnalyticsSettingsTab() {
  const { lang, theme } = useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Settings states
  const [trendRangeMonths, setTrendRangeMonths] = useState(12);
  const [averagesLookbackMonths, setAveragesLookbackMonths] = useState(12);
  const [customAverages, setCustomAverages] = useState(PRESET_AVERAGE_CATS.slice(0, 7));
  const [widgetOrder, setWidgetOrder] = useState(DEFAULT_WIDGET_DEFS.map(w => w.id));
  const [widgetVisibility, setWidgetVisibility] = useState(
    DEFAULT_WIDGET_DEFS.reduce((acc, w) => ({ ...acc, [w.id]: true }), {})
  );
  const [customAiWidgets, setCustomAiWidgets] = useState([]);

  // Category addition
  const [availableCategories, setAvailableCategories] = useState([]);
  const [selectedCatToAdd, setSelectedCatToAdd] = useState('');

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
      if (s.analyticsTrendRangeMonths) {
        setTrendRangeMonths(parseInt(s.analyticsTrendRangeMonths, 10));
      }
      if (s.analyticsAveragesLookbackMonths) {
        setAveragesLookbackMonths(parseInt(s.analyticsAveragesLookbackMonths, 10));
      }
      if (Array.isArray(s.analyticsCustomAverages) && s.analyticsCustomAverages.length > 0) {
        setCustomAverages(s.analyticsCustomAverages);
      }
      if (Array.isArray(s.analyticsWidgetOrder) && s.analyticsWidgetOrder.length > 0) {
        // Merge with any new default widgets
        const existingOrder = s.analyticsWidgetOrder;
        const missing = DEFAULT_WIDGET_DEFS.map(w => w.id).filter(id => !existingOrder.includes(id));
        setWidgetOrder([...existingOrder, ...missing]);
      }
      if (s.analyticsWidgetVisibility) {
        setWidgetVisibility({
          ...DEFAULT_WIDGET_DEFS.reduce((acc, w) => ({ ...acc, [w.id]: true }), {}),
          ...s.analyticsWidgetVisibility,
        });
      }
      if (Array.isArray(s.customAiWidgets)) {
        setCustomAiWidgets(s.customAiWidgets);
      }
    } catch (err) {
      console.error('Failed to load analytics settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async (overrides = {}) => {
    setSaving(true);
    try {
      const res = await api.getSystemSettings();
      const current = res.data?.settings || {};

      const updated = {
        ...current,
        analyticsTrendRangeMonths: overrides.trendRangeMonths !== undefined ? overrides.trendRangeMonths : trendRangeMonths,
        analyticsAveragesLookbackMonths: overrides.averagesLookbackMonths !== undefined ? overrides.averagesLookbackMonths : averagesLookbackMonths,
        analyticsCustomAverages: overrides.customAverages !== undefined ? overrides.customAverages : customAverages,
        analyticsWidgetOrder: overrides.widgetOrder !== undefined ? overrides.widgetOrder : widgetOrder,
        analyticsWidgetVisibility: overrides.widgetVisibility !== undefined ? overrides.widgetVisibility : widgetVisibility,
        customAiWidgets: overrides.customAiWidgets !== undefined ? overrides.customAiWidgets : customAiWidgets,
      };

      await api.updateSystemSettings(updated);
      setSavedSuccess(true);
      window.dispatchEvent(new CustomEvent('fintrack_settings_updated'));
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save analytics settings:', err);
    } finally {
      setSaving(false);
    }
  };

  // Reorder Widgets
  const handleMoveWidget = (index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= widgetOrder.length) return;
    const newOrder = [...widgetOrder];
    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;
    setWidgetOrder(newOrder);
    handleSave({ widgetOrder: newOrder });
  };

  // Toggle Widget Visibility
  const handleToggleWidget = (widgetId) => {
    const nextVal = !widgetVisibility[widgetId];
    const newVis = { ...widgetVisibility, [widgetId]: nextVal };
    setWidgetVisibility(newVis);
    handleSave({ widgetVisibility: newVis });
  };

  // Reset Widgets Layout to Default
  const handleResetWidgetLayout = () => {
    const defaultOrder = DEFAULT_WIDGET_DEFS.map(w => w.id);
    const defaultVis = DEFAULT_WIDGET_DEFS.reduce((acc, w) => ({ ...acc, [w.id]: true }), {});
    setWidgetOrder(defaultOrder);
    setWidgetVisibility(defaultVis);
    handleSave({ widgetOrder: defaultOrder, widgetVisibility: defaultVis });
  };

  // Reorder Average Categories
  const handleMoveAverageCat = (index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= customAverages.length) return;
    const newList = [...customAverages];
    const temp = newList[index];
    newList[index] = newList[targetIndex];
    newList[targetIndex] = temp;
    setCustomAverages(newList);
    handleSave({ customAverages: newList });
  };

  // Remove Average Category
  const handleRemoveAverageCat = (index) => {
    const newList = customAverages.filter((_, i) => i !== index);
    setCustomAverages(newList);
    handleSave({ customAverages: newList });
  };

  // Add Average Category
  const handleAddAverageCat = () => {
    if (!selectedCatToAdd) return;
    if (customAverages.some(a => a.name === selectedCatToAdd)) return;

    const preset = PRESET_AVERAGE_CATS.find(p => p.name === selectedCatToAdd);
    const cat = availableCategories.find(c => c.name === selectedCatToAdd);

    const newItem = {
      key: preset?.key || selectedCatToAdd,
      name: selectedCatToAdd,
      icon: preset?.icon || cat?.icon || 'Tag',
      color: preset?.color || cat?.color || '#6366f1',
    };

    const newList = [...customAverages, newItem];
    setCustomAverages(newList);
    setSelectedCatToAdd('');
    handleSave({ customAverages: newList });
  };

  // Delete Pinned AI Widget
  const handleDeletePinnedAiWidget = (widgetId) => {
    const updated = customAiWidgets.filter(w => w.id !== widgetId);
    setCustomAiWidgets(updated);
    handleSave({ customAiWidgets: updated });
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-xs text-dark-text-muted">
        טוען הגדרות סטטיסטיקה...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Save Success Alert */}
      {savedSuccess && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-150">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>הגדרות הסטטיסטיקה נשמרו בהצלחה והלוח עודכן בלייב!</span>
        </div>
      )}

      {/* Section 1: Default Lookback Ranges */}
      <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-5">
        <div>
          <h3 className="font-semibold text-base flex items-center gap-2 text-dark-text light:text-light-text">
            <BarChart3 className="w-5 h-5 text-brand-primary" />
            <span>טווחי זמן ותצוגה כרונולוגית</span>
          </h3>
          <p className="text-xs text-dark-text-muted light:text-light-text-muted mt-0.5">
            הגדרת טווחי ברירת המחדל לגרף הכנסות מול הוצאות ולחישוב הממוצעים והמאזן
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          
          {/* Trend Chart Range */}
          <div className="p-4 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated space-y-2">
            <div className="font-semibold text-dark-text light:text-light-text flex items-center justify-between">
              <span>טווח ברירת מחדל לגרף הכנסות מול הוצאות:</span>
              <span className="text-brand-primary font-bold font-mono">{trendRangeMonths} חודשים</span>
            </div>
            <p className="text-[11px] text-dark-text-muted light:text-light-text-muted">
              כמה חודשים לאחור יוצגו בעמודות הגרף הראשי בדשבורד הסטטיסטיקות
            </p>
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { id: 3, label: '3 חודשים' },
                { id: 6, label: '6 חודשים' },
                { id: 12, label: 'שנה (12 ח׳)' },
                { id: 18, label: 'שנה וחצי' },
                { id: 24, label: 'שנתיים' },
                { id: 36, label: '3 שנים' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setTrendRangeMonths(m.id);
                    handleSave({ trendRangeMonths: m.id });
                  }}
                  className={`p-2 rounded-xl text-center font-semibold transition-all border ${
                    trendRangeMonths === m.id
                      ? 'border-brand-primary bg-brand-primary text-white shadow-xs'
                      : 'border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text-muted hover:text-dark-text'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Historical Averages & Balance Lookback */}
          <div className="p-4 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated space-y-2">
            <div className="font-semibold text-dark-text light:text-light-text flex items-center justify-between">
              <span>טווח חישוב ממוצעים ומאזן היסטורי:</span>
              <span className="text-brand-primary font-bold font-mono">{averagesLookbackMonths} חודשים</span>
            </div>
            <p className="text-[11px] text-dark-text-muted light:text-light-text-muted">
              מספר החודשים שההוצאות והמאזן יחולקו בהם לחישוב הממוצע החודשי המדויק
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              {[
                { id: 3, label: '3 חודשים אחרונים' },
                { id: 6, label: '6 חודשים אחרונים' },
                { id: 12, label: '12 חודשים (שנה - ברירת מחדל)' },
                { id: 24, label: '24 חודשים (שנתיים)' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setAveragesLookbackMonths(m.id);
                    handleSave({ averagesLookbackMonths: m.id });
                  }}
                  className={`p-2 rounded-xl text-center font-semibold transition-all border ${
                    averagesLookbackMonths === m.id
                      ? 'border-brand-primary bg-brand-primary text-white shadow-xs'
                      : 'border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text-muted hover:text-dark-text'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Section 2: Dashboard Widget Order & Visibility Customization */}
      <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-base flex items-center gap-2 text-dark-text light:text-light-text">
              <Layers className="w-5 h-5 text-brand-primary" />
              <span>התאמת רכיבי הדשבורד (הפעלה, הסתרה ושינוי סדר)</span>
            </h3>
            <p className="text-xs text-dark-text-muted light:text-light-text-muted mt-0.5">
              בחר אילו כרטיסים יוצגו בעמוד הסטטיסטיקות ושנה את סדר הופעתם מלמעלה למטה
            </p>
          </div>

          <button
            type="button"
            onClick={handleResetWidgetLayout}
            className="text-xs text-brand-primary hover:underline flex items-center gap-1 font-semibold self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>שחזר סדר לברירת מחדל</span>
          </button>
        </div>

        <div className="space-y-2">
          {widgetOrder.map((widgetId, idx) => {
            const def = DEFAULT_WIDGET_DEFS.find(d => d.id === widgetId);
            if (!def) return null;
            const Icon = def.icon;
            const isVisible = widgetVisibility[widgetId] !== false;

            return (
              <div
                key={widgetId}
                className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between text-xs ${
                  isVisible
                    ? 'border-dark-border light:border-light-border bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40'
                    : 'border-dark-border/40 opacity-50 bg-dark-surface/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-dark-text-muted font-bold text-[11px] w-4">{idx + 1}.</span>
                  <div className="w-8 h-8 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="font-bold text-dark-text light:text-light-text">
                    {def.label}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Visibility Toggle Button */}
                  <button
                    type="button"
                    onClick={() => handleToggleWidget(widgetId)}
                    className={`p-2 rounded-xl border transition-all flex items-center gap-1 font-semibold ${
                      isVisible
                        ? 'border-brand-primary/30 text-brand-primary bg-brand-primary/10'
                        : 'border-dark-border text-dark-text-muted'
                    }`}
                    title={isVisible ? 'הסתר רכיב זה' : 'הצג רכיב זה'}
                  >
                    {isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">{isVisible ? 'מוצג' : 'מוסתר'}</span>
                  </button>

                  {/* Move Up Button */}
                  <button
                    type="button"
                    onClick={() => handleMoveWidget(idx, 'up')}
                    disabled={idx === 0}
                    className="p-2 rounded-xl border border-dark-border light:border-light-border hover:bg-dark-surface text-dark-text-muted hover:text-dark-text disabled:opacity-30 transition-colors"
                    title="הזז למעלה"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>

                  {/* Move Down Button */}
                  <button
                    type="button"
                    onClick={() => handleMoveWidget(idx, 'down')}
                    disabled={idx === widgetOrder.length - 1}
                    className="p-2 rounded-xl border border-dark-border light:border-light-border hover:bg-dark-surface text-dark-text-muted hover:text-dark-text disabled:opacity-30 transition-colors"
                    title="הזז למטה"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 3: Custom Category Averages Cards */}
      <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-base flex items-center gap-2 text-dark-text light:text-light-text">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <span>התאמה אישית של כרטיסי ממוצעים חודשיים ({customAverages.length})</span>
            </h3>
            <p className="text-xs text-dark-text-muted light:text-light-text-muted mt-0.5">
              בחר בדיוק לאילו קטגוריות לחשב ולהציג כרטיסי ממוצע חודשי וגרף התפלגות
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setCustomAverages(PRESET_AVERAGE_CATS.slice(0, 7));
              handleSave({ customAverages: PRESET_AVERAGE_CATS.slice(0, 7) });
            }}
            className="text-xs text-brand-primary hover:underline flex items-center gap-1 font-semibold self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>שחזר קטגוריות ממוצע לברירת מחדל</span>
          </button>
        </div>

        {/* Add Category row */}
        <div className="flex items-center gap-2 text-xs">
          <select
            value={selectedCatToAdd}
            onChange={(e) => setSelectedCatToAdd(e.target.value)}
            className="flex-1 px-3 py-2 text-xs rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text focus:outline-none focus:border-brand-primary"
          >
            <option value="">בחר קטגוריה נוספת להצגת ממוצע...</option>
            {PRESET_AVERAGE_CATS.filter(p => !customAverages.some(a => a.name === p.name)).map(p => (
              <option key={p.key} value={p.name}>
                {p.name} (מומלץ)
              </option>
            ))}
            {availableCategories
              .filter(c => !customAverages.some(a => a.name === c.name) && !PRESET_AVERAGE_CATS.some(p => p.name === c.name))
              .map(c => (
                <option key={c.id || c.name} value={c.name}>
                  {c.name}
                </option>
              ))
            }
          </select>

          <button
            type="button"
            onClick={handleAddAverageCat}
            disabled={!selectedCatToAdd}
            className="px-4 py-2 rounded-xl bg-brand-primary text-white font-semibold hover:bg-brand-primary-hover disabled:opacity-40 transition-colors flex items-center gap-1.5 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>הוסף</span>
          </button>
        </div>

        {/* List of active average cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {customAverages.map((item, idx) => (
            <div
              key={item.key || idx}
              className="p-3 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <CategoryBadge category={item.name} size={18} />
                <span className="font-bold text-dark-text light:text-light-text truncate">{item.name}</span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleMoveAverageCat(idx, 'up')}
                  disabled={idx === 0}
                  className="p-1 rounded-lg text-dark-text-muted hover:text-dark-text disabled:opacity-30"
                  title="הזז למעלה"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveAverageCat(idx, 'down')}
                  disabled={idx === customAverages.length - 1}
                  className="p-1 rounded-lg text-dark-text-muted hover:text-dark-text disabled:opacity-30"
                  title="הזז למטה"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveAverageCat(idx)}
                  className="p-1 rounded-lg text-dark-text-muted hover:text-rose-500"
                  title="הסר"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 4: Manage Pinned Custom AI Widgets */}
      {customAiWidgets.length > 0 && (
        <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-base flex items-center gap-2 text-dark-text light:text-light-text">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <span>וידג׳טים מותאמים אישית של AI ({customAiWidgets.length})</span>
            </h3>
            <span className="text-xs text-dark-text-muted">וידג׳טים שנוצרו בפרומפט והוצמדו ללוח</span>
          </div>

          <div className="space-y-2">
            {customAiWidgets.map((cw) => (
              <div
                key={cw.id}
                className="p-3.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-bold text-dark-text light:text-light-text">
                    {cw.spec?.title || cw.prompt}
                  </div>
                  <div className="text-[11px] text-dark-text-muted mt-0.5">
                    פרומפט: "{cw.prompt}" • {cw.spec?.timeRangeMonths} חודשים
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeletePinnedAiWidget(cw.id)}
                  className="p-2 rounded-lg hover:bg-rose-500/10 text-dark-text-muted hover:text-rose-500 transition-colors flex items-center gap-1 font-semibold"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>הסר מהלוח</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
