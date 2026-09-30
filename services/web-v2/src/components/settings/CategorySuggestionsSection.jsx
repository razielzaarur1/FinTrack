'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Check,
  X,
  Search,
  RefreshCw,
  FolderPlus,
  History,
  Layers,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  HelpCircle,
  Edit2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import CategoryBadge from '@/components/common/CategoryBadge';

export default function CategorySuggestionsSection({ categories = [], onCategoryCreated = () => {} }) {
  const [suggestions, setSuggestions] = useState({ pending: [], history: [] });
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  // Approval Modal State
  const [approvingSuggestion, setApprovingSuggestion] = useState(null);
  const [editName, setEditName] = useState('');
  const [editNameEn, setEditNameEn] = useState('');
  const [editParentId, setEditParentId] = useState('');
  const [editColor, setEditColor] = useState('#6366f1');
  const [editIcon, setEditIcon] = useState('tag');
  const [submitting, setSubmitting] = useState(false);

  const fetchSuggestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getCategorySuggestions();
      const payload = res?.data?.data || res?.data || {};
      setSuggestions({
        pending: Array.isArray(payload.pending) ? payload.pending : [],
        history: Array.isArray(payload.history) ? payload.history : [],
      });
    } catch (err) {
      console.error('Error fetching suggestions:', err);
      setError('לא ניתן לטעון את המלצות הקטגוריות');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    try {
      const res = await api.scanCategorySuggestions();
      if (res && res.success) {
        await fetchSuggestions();
      }
    } catch (err) {
      console.error('Scan error:', err);
      setError('שגיאה במהלך סריקת פערים סמנטיים לקטגוריות');
    } finally {
      setScanning(false);
    }
  };

  const openApproveModal = (sugg) => {
    setApprovingSuggestion(sugg);
    setEditName(sugg.name || '');
    setEditNameEn(sugg.nameEn || '');
    setEditParentId(sugg.parentId || (categories[0] ? categories[0].id : ''));
    setEditColor(sugg.color || '#6366f1');
    setEditIcon(sugg.icon || 'tag');
  };

  const handleConfirmApproval = async () => {
    if (!approvingSuggestion || !editName.trim()) return;

    setSubmitting(true);
    try {
      await api.approveCategorySuggestion(approvingSuggestion.id, {
        name: editName.trim(),
        nameEn: editNameEn.trim() || null,
        parentId: editParentId || null,
        color: editColor,
        icon: editIcon,
      });

      setApprovingSuggestion(null);
      await fetchSuggestions();
      onCategoryCreated();
    } catch (err) {
      console.error('Approval failed:', err);
      setError('שגיאה באישור ההמלצה: ' + (err.message || ''));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismiss = async (suggId) => {
    try {
      await api.dismissCategorySuggestion(suggId);
      // Move to history locally
      setSuggestions((prev) => {
        const item = prev.pending.find((p) => p.id === suggId);
        return {
          pending: prev.pending.filter((p) => p.id !== suggId),
          history: item ? [{ ...item, status: 'dismissed' }, ...prev.history] : prev.history,
        };
      });
    } catch (err) {
      console.error('Dismiss failed:', err);
      setError('שגיאה בדחיית ההמלצה');
    }
  };

  const rootCategories = categories.filter((c) => !c.parentId);

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              המלצות AI לתתי-קטגוריות חדשות
              {suggestions.pending.length > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {suggestions.pending.length} ממתינות
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              ה-AI מזהה עסקאות שנדחסות לקטגוריות כלליות וממליץ לפתוח עבורן תת-קטגוריה ייעודית.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleScan}
            disabled={scanning || loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-sm transition-colors disabled:opacity-50"
          >
            <Search className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'סורק פערים...' : 'סרוק תנועות להמלצות 🔍'}
          </button>

          <button
            onClick={fetchSuggestions}
            disabled={loading}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-slate-800/80 border border-slate-700/60"
            title="רענן"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-xs text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Pending Suggestions Grid */}
      <div className="mt-5">
        {loading ? (
          <div className="py-10 flex flex-col items-center justify-center text-slate-400 gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
            <span className="text-sm">טוען המלצות קטגוריה...</span>
          </div>
        ) : suggestions.pending.length === 0 ? (
          <div className="py-8 text-center bg-slate-800/20 rounded-xl border border-slate-800/60 p-6">
            <FolderPlus className="w-10 h-10 mx-auto text-slate-600 mb-2 opacity-60" />
            <p className="text-sm font-medium text-slate-300">אין כרגע המלצות ממתינות</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              עץ הקטגוריות שלך מכסה היטב את התנועות הנוכחיות. לחץ על "סרוק תנועות להמלצות" כדי לבדוק שוב בכל עת.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {suggestions.pending.map((sugg) => {
              const merchants = Array.isArray(sugg.sampleMerchants) ? sugg.sampleMerchants : [];
              const txCount = Array.isArray(sugg.sampleTransactionIds) ? sugg.sampleTransactionIds.length : 0;

              return (
                <div
                  key={sugg.id}
                  className="bg-slate-800/40 border border-indigo-500/20 rounded-xl p-4 flex flex-col justify-between hover:border-indigo-500/40 transition-all shadow-sm"
                >
                  <div>
                    {/* Top Row: Icon + Name + Parent Badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border"
                          style={{
                            backgroundColor: `${sugg.color || '#6366f1'}20`,
                            borderColor: `${sugg.color || '#6366f1'}40`,
                            color: sugg.color || '#6366f1',
                          }}
                        >
                          <CategoryBadge category={sugg.name} size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-white text-base">{sugg.name}</h4>
                            {sugg.nameEn && (
                              <span className="text-xs text-slate-400 font-mono">({sugg.nameEn})</span>
                            )}
                          </div>
                          {sugg.parentName && (
                            <div className="flex items-center gap-1 text-xs text-indigo-300 mt-0.5">
                              <span className="text-slate-500">תחת קטגוריית אב:</span>
                              <span className="font-semibold">{sugg.parentName}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {txCount > 0 && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                          {txCount} תנועות יסווגו
                        </span>
                      )}
                    </div>

                    {/* Rationale */}
                    {sugg.reason && (
                      <p className="text-xs text-slate-300 bg-slate-900/50 p-2.5 rounded-lg border border-slate-800 mt-3 leading-relaxed">
                        💡 {sugg.reason}
                      </p>
                    )}

                    {/* Sample Merchants */}
                    {merchants.length > 0 && (
                      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] text-slate-400">עסקים מזוהים:</span>
                        {merchants.slice(0, 5).map((m, idx) => (
                          <span
                            key={idx}
                            className="text-[11px] font-medium bg-slate-800 px-2 py-0.5 rounded-md text-slate-300 border border-slate-700/60"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-4 pt-3 border-t border-slate-700/50 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleDismiss(sugg.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      התעלם
                    </button>

                    <button
                      onClick={() => openApproveModal(sugg)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      אשר והחל על התנועות ✨
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* History Accordion */}
      {suggestions.history.length > 0 && (
        <div className="mt-6 pt-5 border-t border-slate-800">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center justify-between w-full text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-slate-500" />
              <span>היסטוריית הצעות ({suggestions.history.length})</span>
            </div>
            {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showHistory && (
            <div className="mt-3 space-y-2 max-h-60 overflow-y-auto pr-1">
              {suggestions.history.map((h) => {
                const isApproved = h.status === 'approved';
                return (
                  <div
                    key={h.id}
                    className="p-3 bg-slate-800/30 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      {isApproved ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-slate-500 shrink-0" />
                      )}
                      <span className="font-semibold text-slate-200">{h.name}</span>
                      {h.parentName && <span className="text-slate-500">תחת {h.parentName}</span>}
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        isApproved
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-slate-700/40 text-slate-400'
                      }`}
                    >
                      {isApproved ? 'אושר והוחל' : 'נדחה'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Approval & Customization Modal */}
      {approvingSuggestion && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">אישור והוספת תת-קטגוריה</h3>
              </div>
              <button
                onClick={() => setApprovingSuggestion(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  שם תת-הקטגוריה (עברית)
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  שם באנגלית (אופציונלי)
                </label>
                <input
                  type="text"
                  value={editNameEn}
                  onChange={(e) => setEditNameEn(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  קטגוריית אב
                </label>
                <select
                  value={editParentId}
                  onChange={(e) => setEditParentId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">ללא אב (קטגוריה ראשית)</option>
                  {rootCategories.map((rc) => (
                    <option key={rc.id} value={rc.id}>
                      {rc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">צבע</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      className="w-9 h-9 rounded-lg border border-slate-700 cursor-pointer bg-transparent"
                    />
                    <input
                      type="text"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">אייקון (Lucide)</label>
                  <input
                    type="text"
                    value={editIcon}
                    onChange={(e) => setEditIcon(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>
              </div>

              {approvingSuggestion.sampleTransactionIds?.length > 0 && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>
                    אישור ייצור את הקטגוריה ויסווג אוטומטית {approvingSuggestion.sampleTransactionIds.length} תנועות תואמות!
                  </span>
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                onClick={() => setApprovingSuggestion(null)}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-xl transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={handleConfirmApproval}
                disabled={submitting || !editName.trim()}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {submitting ? 'שומר ומחיל...' : 'אשר והחל עכשיו ✨'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
