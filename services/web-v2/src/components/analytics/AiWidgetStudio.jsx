'use client';

import React, { useState } from 'react';
import { 
  Sparkles, 
  Send, 
  Pin, 
  Trash2, 
  Edit3, 
  BarChart3, 
  RefreshCw, 
  Calendar, 
  TrendingUp, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle,
  HelpCircle,
  Layers,
  Award,
  Receipt,
  Check
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  ReferenceLine,
  Cell 
} from 'recharts';
import { api } from '@/lib/api';
import { formatILS, formatDate } from '@/lib/formatters';
import { useApp } from '@/lib/app-context';
import CategoryBadge from '@/components/common/CategoryBadge';

const SAMPLE_PROMPTS = [
  'גרף דו שנתי עם ממוצע ורשימה של החודשים הכי עמוסים של הוצאות על דלק בלבד',
  'השוואת הוצאות על אוכל בחוץ ומשלוחים מול סופר ומכולת בשנה האחרונה',
  'הוצאות בסופי שבוע לעומת אמצע שבוע על קניות ובילויים',
  'ניתוח משק בית וחשבונות בשנתיים האחרונות עם חודשי השיא',
];

export default function AiWidgetStudio({ pinnedWidgets = [], onPinnedWidgetsUpdated }) {
  const { lang, theme } = useApp();
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [currentWidget, setCurrentWidget] = useState(null);
  const [refinementText, setRefinementText] = useState('');
  const [pinSuccess, setPinSuccess] = useState(false);
  const [error, setError] = useState('');
  const [showPromptHelp, setShowPromptHelp] = useState(false);

  const handleGenerate = async (queryText = prompt) => {
    if (!queryText.trim()) return;
    setGenerating(true);
    setError('');
    setPinSuccess(false);

    try {
      const res = await api.generateAiWidget({
        prompt: queryText.trim(),
        existingWidget: currentWidget,
      });

      if (res.data?.widget) {
        setCurrentWidget(res.data.widget);
        setRefinementText('');
      } else {
        throw new Error(res.error || 'שגיאה ביצירת הוידג׳ט');
      }
    } catch (err) {
      console.error('Error generating AI widget:', err);
      setError(err.message || 'שגיאה ביצירת הוידג׳ט');
    } finally {
      setGenerating(false);
    }
  };

  const handlePinWidget = async () => {
    if (!currentWidget) return;
    try {
      const settingsRes = await api.getSystemSettings();
      const current = settingsRes.data?.settings || {};
      const existingPinned = Array.isArray(current.customAiWidgets) ? current.customAiWidgets : [];
      
      // Add or update widget
      const updated = [currentWidget, ...existingPinned.filter(w => w.id !== currentWidget.id)];
      await api.updateSystemSettings({ ...current, customAiWidgets: updated });

      setPinSuccess(true);
      if (onPinnedWidgetsUpdated) onPinnedWidgetsUpdated(updated);
      window.dispatchEvent(new CustomEvent('fintrack_settings_updated'));
      setTimeout(() => setPinSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to pin widget:', err);
    }
  };

  const handleUnpinWidget = async (widgetId) => {
    try {
      const settingsRes = await api.getSystemSettings();
      const current = settingsRes.data?.settings || {};
      const existingPinned = Array.isArray(current.customAiWidgets) ? current.customAiWidgets : [];
      const updated = existingPinned.filter(w => w.id !== widgetId);
      
      await api.updateSystemSettings({ ...current, customAiWidgets: updated });
      if (onPinnedWidgetsUpdated) onPinnedWidgetsUpdated(updated);
      window.dispatchEvent(new CustomEvent('fintrack_settings_updated'));
    } catch (err) {
      console.error('Failed to unpin widget:', err);
    }
  };

  return (
    <div className="p-5 sm:p-6 rounded-3xl border border-brand-primary/20 bg-dark-surface light:bg-light-surface space-y-6 shadow-sm">
      
      {/* Studio Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-dark-text light:text-light-text flex items-center gap-2">
              <span>מחולל גרפים ותובנות AI דינמי בלייב</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-primary/15 text-brand-primary">
                PROMPT TO WIDGET
              </span>
            </h2>
            <p className="text-xs text-dark-text-muted light:text-light-text-muted mt-0.5">
              בקש כל גרף או חתך בשפה חופשית, וה-AI יבנה, יחשב ויציג לך וידג׳ט מלא ומדויק בלייב
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowPromptHelp(!showPromptHelp)}
          className="text-xs text-dark-text-muted hover:text-brand-primary flex items-center gap-1 shrink-0 self-start sm:self-auto font-medium"
        >
          <HelpCircle className="w-4 h-4" />
          <span>רעיונות ודוגמאות</span>
        </button>
      </div>

      {/* Suggested prompts chips */}
      {showPromptHelp && (
        <div className="p-4 rounded-2xl border border-dark-border/80 bg-dark-surface-elevated/40 space-y-2 animate-in fade-in duration-150">
          <div className="text-xs font-bold text-dark-text light:text-light-text">
            לחץ על דוגמה לניסוי מיידי:
          </div>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_PROMPTS.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setPrompt(p);
                  handleGenerate(p);
                }}
                className="text-[11px] px-3 py-1.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text-muted hover:text-dark-text hover:border-brand-primary transition-all text-right"
              >
                ✨ {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Prompt Input Box */}
      <div className="space-y-2">
        <div className="relative">
          <textarea
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleGenerate();
              }
            }}
            placeholder="למשל: תעשה לי גרף דו שנתי עם ממוצע ורשימה של החודשים הכי עמוסים של הוצאות על דלק בלבד..."
            className="w-full pr-4 pl-24 py-3 text-xs sm:text-sm rounded-2xl border border-dark-border light:border-light-border bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 text-dark-text light:text-light-text placeholder:text-dark-text-muted focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 transition-all resize-none"
          />

          <button
            type="button"
            onClick={() => handleGenerate()}
            disabled={generating || !prompt.trim()}
            className="absolute left-3 top-1/2 -translate-y-1/2 px-4 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-primary-hover disabled:opacity-40 transition-all flex items-center gap-1.5 shadow-sm"
          >
            {generating ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>{generating ? 'בונה...' : 'בנה וידג׳ט'}</span>
          </button>
        </div>

        {error && (
          <div className="text-xs text-rose-400 flex items-center gap-1.5 mt-1">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Live Generated Widget Display */}
      {currentWidget && (
        <div className="p-5 sm:p-6 rounded-2xl border border-brand-primary/30 bg-dark-surface-elevated/20 light:bg-light-surface-elevated/20 space-y-5 animate-in fade-in duration-200">
          
          {/* Widget Card Header & Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-dark-border/60 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-primary animate-pulse" />
                <h3 className="text-base sm:text-lg font-bold text-dark-text light:text-light-text">
                  {currentWidget.spec?.title || 'וידג׳ט מותאם אישית'}
                </h3>
              </div>
              <p className="text-xs text-dark-text-muted light:text-light-text-muted mt-0.5">
                {currentWidget.spec?.subtitle || currentWidget.prompt}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePinWidget}
                disabled={pinSuccess}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs ${
                  pinSuccess
                    ? 'bg-emerald-500 text-white'
                    : 'bg-brand-primary text-white hover:bg-brand-primary-hover'
                }`}
                title="הצמד את הוידג׳ט ללוח הסטטיסטיקות הראשי"
              >
                {pinSuccess ? <Check className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                <span>{pinSuccess ? 'הוצמד ללוח!' : 'הצמד ללוח'}</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentWidget(null)}
                className="p-1.5 rounded-xl hover:bg-dark-surface light:hover:bg-light-surface text-dark-text-muted hover:text-dark-text transition-colors"
                title="סגור תצוגה מקדימה"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* AI Commentary Insight Box */}
          {currentWidget.data?.insightText && (
            <div className="p-3.5 rounded-xl bg-brand-primary/5 border border-brand-primary/15 text-xs text-dark-text light:text-light-text leading-relaxed flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-brand-primary">תובנת AI: </span>
                <span>{currentWidget.data.insightText}</span>
              </div>
            </div>
          )}

          {/* KPI metrics bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl border border-dark-border/60 bg-dark-surface space-y-1">
              <div className="text-dark-text-muted font-medium">סך הכל בתקופה</div>
              <div className="text-base sm:text-lg font-bold text-rose-500 font-mono" dir="ltr">
                {formatILS(currentWidget.data?.totalAmount || 0)}
              </div>
              <div className="text-[10px] text-dark-text-muted">בכל {currentWidget.data?.timeRangeMonths} החודשים</div>
            </div>

            <div className="p-3 rounded-xl border border-dark-border/60 bg-dark-surface space-y-1">
              <div className="text-dark-text-muted font-medium">ממוצע חודשי</div>
              <div className="text-base sm:text-lg font-bold text-brand-primary font-mono" dir="ltr">
                {formatILS(currentWidget.data?.monthlyAverage || 0)}
              </div>
              <div className="text-[10px] text-dark-text-muted">לחודש</div>
            </div>

            <div className="p-3 rounded-xl border border-dark-border/60 bg-dark-surface space-y-1">
              <div className="text-dark-text-muted font-medium">חודש שיא</div>
              <div className="text-base sm:text-lg font-bold text-amber-400 truncate">
                {currentWidget.data?.highestMonth?.label || 'ללא'}
              </div>
              <div className="text-[10px] text-dark-text-muted font-mono" dir="ltr">
                {currentWidget.data?.highestMonth?.amount ? formatILS(currentWidget.data.highestMonth.amount) : '-'}
              </div>
            </div>

            <div className="p-3 rounded-xl border border-dark-border/60 bg-dark-surface space-y-1">
              <div className="text-dark-text-muted font-medium">כמות עסקאות</div>
              <div className="text-base sm:text-lg font-bold text-dark-text light:text-light-text font-mono">
                {currentWidget.data?.transactionCount || 0}
              </div>
              <div className="text-[10px] text-dark-text-muted">עסקאות תואמות</div>
            </div>
          </div>

          {/* Interactive Chart */}
          {currentWidget.data?.distribution && currentWidget.data.distribution.length > 0 && (
            <div className="p-4 rounded-xl border border-dark-border/60 bg-dark-surface space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-dark-text light:text-light-text">
                <span>מגמה חודשית לאורך זמן</span>
                <span className="text-[11px] text-emerald-400 font-semibold font-mono">
                  קו ממוצע: {formatILS(currentWidget.data?.monthlyAverage || 0)}
                </span>
              </div>

              <div className="h-60 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={currentWidget.data.distribution} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme === 'light' ? '#e2e8f0' : '#1e293b'} vertical={false} />
                    <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(v) => `₪${v}`} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: theme === 'light' ? '#ffffff' : '#0f172a',
                        borderColor: theme === 'light' ? '#e2e8f0' : '#1e293b',
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                      }}
                      formatter={(val, name, item) => [
                        <span key="val" className="font-bold font-mono text-brand-primary">{formatILS(val)} ({item.payload.txCount} עסקאות)</span>,
                        'סך הכל בחודש'
                      ]}
                    />
                    {currentWidget.data?.monthlyAverage > 0 && (
                      <ReferenceLine 
                        y={currentWidget.data.monthlyAverage} 
                        stroke="#10b981" 
                        strokeDasharray="4 4" 
                        strokeWidth={1.5} 
                      />
                    )}
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]} fill="#6366f1" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Peak Months Ranking Leaderboard */}
          {currentWidget.data?.peakMonthsRanking && currentWidget.data.peakMonthsRanking.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-dark-text light:text-light-text flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-400" />
                <span>דירוג החודשים העמוסים ביותר:</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {currentWidget.data.peakMonthsRanking.map((pm, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-dark-border/60 bg-dark-surface flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-400 font-bold flex items-center justify-center text-[11px]">
                        #{idx + 1}
                      </div>
                      <div>
                        <div className="font-bold text-dark-text light:text-light-text">{pm.label}</div>
                        <div className="text-[10px] text-dark-text-muted">{pm.txCount} עסקאות</div>
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-rose-500 font-mono" dir="ltr">{formatILS(pm.amount)}</div>
                      {pm.diffFromAvgPercent !== 0 && (
                        <div className="text-[10px] text-amber-400 font-semibold">
                          {pm.diffFromAvgPercent > 0 ? `+${pm.diffFromAvgPercent}%` : `${pm.diffFromAvgPercent}%`}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interactive Refinement / Conversation Box */}
          <div className="p-3.5 rounded-xl border border-dark-border/80 bg-dark-surface space-y-2">
            <label className="text-xs font-bold text-dark-text light:text-light-text flex items-center gap-1.5">
              <Edit3 className="w-3.5 h-3.5 text-brand-primary" />
              <span>הערות לתיקון, כוונון ושיפור הוידג׳ט (דינמי):</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={refinementText}
                onChange={(e) => setRefinementText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (refinementText.trim()) {
                      handleGenerate(`${prompt} [תיקון: ${refinementText.trim()}]`);
                    }
                  }
                }}
                placeholder="למשל: שנה את הטווח ל-3 שנים / הצג רק עסקאות מעל 200 ש״ח / הוסף גם סופרמרקטים..."
                className="flex-1 px-3 py-2 text-xs rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text focus:outline-none focus:border-brand-primary"
              />
              <button
                type="button"
                onClick={() => {
                  if (refinementText.trim()) {
                    handleGenerate(`${prompt} [תיקון: ${refinementText.trim()}]`);
                  }
                }}
                disabled={generating || !refinementText.trim()}
                className="px-4 py-2 rounded-xl bg-dark-surface-elevated hover:bg-dark-border text-dark-text text-xs font-semibold disabled:opacity-40 transition-colors"
              >
                עדכן
              </button>
            </div>
          </div>

        </div>
      )}

      {/* Pinned AI Widgets List */}
      {pinnedWidgets.length > 0 && (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-dark-text light:text-light-text flex items-center gap-2">
              <Pin className="w-4 h-4 text-brand-primary" />
              <span>וידג׳טים מוצמדים ללוח ({pinnedWidgets.length})</span>
            </h3>
            <span className="text-[11px] text-dark-text-muted">
              מוצגים כחלק קבוע מדשבורד הסטטיסטיקות
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pinnedWidgets.map((pw) => (
              <div
                key={pw.id}
                className="p-4 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface-elevated/30 light:bg-light-surface-elevated/30 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm text-dark-text light:text-light-text truncate">
                      {pw.spec?.title || pw.prompt}
                    </div>
                    <div className="text-[11px] text-dark-text-muted truncate">
                      {pw.spec?.subtitle || pw.prompt}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleUnpinWidget(pw.id)}
                    className="p-1.5 rounded-lg hover:bg-rose-500/10 text-dark-text-muted hover:text-rose-500 transition-colors"
                    title="הסר מהלוח"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-dark-surface border border-dark-border/40">
                    <div className="text-[10px] text-dark-text-muted">סה״כ</div>
                    <div className="font-bold text-rose-500 font-mono" dir="ltr">
                      {formatILS(pw.data?.totalAmount || 0)}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-dark-surface border border-dark-border/40">
                    <div className="text-[10px] text-dark-text-muted">ממוצע</div>
                    <div className="font-bold text-brand-primary font-mono" dir="ltr">
                      {formatILS(pw.data?.monthlyAverage || 0)}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-dark-surface border border-dark-border/40">
                    <div className="text-[10px] text-dark-text-muted">עסקאות</div>
                    <div className="font-bold text-dark-text font-mono">
                      {pw.data?.transactionCount || 0}
                    </div>
                  </div>
                </div>

                {pw.data?.distribution && (
                  <div className="h-28 w-full pt-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={pw.data.distribution.slice(-12)}>
                        <XAxis dataKey="label" fontSize={9} tickLine={false} stroke="#64748b" />
                        <Tooltip formatter={(v) => formatILS(v)} />
                        <Bar dataKey="amount" fill="#6366f1" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
