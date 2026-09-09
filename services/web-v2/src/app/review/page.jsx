'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  CheckCircle2, 
  Flag, 
  Tag, 
  Undo2, 
  RefreshCw, 
  AlertCircle, 
  Sparkles,
  ArrowRight,
  Split,
  ChevronDown
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatILS, formatDate } from '@/lib/formatters';
import { useApp } from '@/lib/app-context';
import CategoryBadge from '@/components/common/CategoryBadge';
import CategoryPicker from '@/components/common/CategoryPicker';
import InstitutionLogo from '@/components/common/InstitutionLogo';

export default function ReviewPage() {
  const { t, lang } = useApp();
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Inline Category Picker State
  const [editingCatId, setEditingCatId] = useState(null);

  // Undo Toast State
  const [undoItem, setUndoItem] = useState(null);
  const undoTimeoutRef = useRef(null);

  const loadReviewQueue = async () => {
    setLoading(true);
    try {
      const res = await api.getReviewQueue();
      if (res.data) {
        setQueue(res.data.data || []);
      }
    } catch (err) {
      console.error('Failed to load review queue:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReviewQueue();
    return () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    };
  }, []);

  const handleAction = async (tx, action, category = null) => {
    setActionLoadingId(tx.id);

    // Save previous state for Undo
    const previousQueueItem = { ...tx };

    // Optimistic removal / update
    setQueue((prev) => prev.filter((item) => item.id !== tx.id));

    // Show Undo Toast
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setUndoItem({
      tx: previousQueueItem,
      actionName: action === 'approve' ? 'אושרה' : action === 'flag' ? 'סומנה בדגל' : 'עודכנה',
    });

    undoTimeoutRef.current = setTimeout(() => {
      setUndoItem(null);
    }, 6000); // 6 seconds to undo

    try {
      await api.reviewTransaction(tx.id, {
        action,
        category: category || tx.category,
      });
    } catch (err) {
      console.error('Failed to submit review action:', err);
      // Rollback if error
      setQueue((prev) => [previousQueueItem, ...prev]);
      setUndoItem(null);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleUndo = async () => {
    if (!undoItem) return;
    const { tx } = undoItem;
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setUndoItem(null);

    // Restore to queue locally
    setQueue((prev) => [tx, ...prev]);

    // Call backend to revert review
    try {
      await api.reviewTransaction(tx.id, {
        action: 'unflag',
        category: tx.category,
      });
    } catch (err) {
      console.error('Failed to undo transaction review:', err);
    }
  };

  const handleApproveAll = async () => {
    if (queue.length === 0) return;
    const count = queue.length;
    const currentQueue = [...queue];
    setQueue([]);

    try {
      await Promise.all(
        currentQueue.map((tx) => api.reviewTransaction(tx.id, { action: 'approve' }))
      );
    } catch (err) {
      console.error('Failed to approve all:', err);
      loadReviewQueue();
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1 flex items-center gap-2.5">
            <span>אישור וסיווג תנועות</span>
            {queue.length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-brand-primary text-white text-xs font-bold">
                {queue.length}
              </span>
            )}
          </h1>
          <p className="text-xs text-dark-text-muted light:text-light-text-muted">
            תור תנועות הממתינות לאימות שלך: משיכות מזומן, עסקאות חדשות או תנועות שדורשות סיווג
          </p>
        </div>

        <div className="flex items-center gap-2">
          {queue.length > 1 && (
            <button
              onClick={handleApproveAll}
              className="px-4 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-primary-hover shadow-sm transition-all"
            >
              אשר את כל {queue.length} התנועות
            </button>
          )}

          <button
            onClick={loadReviewQueue}
            disabled={loading}
            className="p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text-muted hover:text-dark-text shadow-sm transition-colors"
            title="רענן"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-brand-primary' : ''}`} />
          </button>
        </div>
      </div>

      {/* Queue List */}
      {loading ? (
        <div className="p-16 text-center text-dark-text-muted">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-brand-primary mb-2" />
          <p className="text-sm font-medium">טוען תנועות לבדיקה...</p>
        </div>
      ) : queue.length === 0 ? (
        <div className="py-20 text-center rounded-3xl border border-dashed border-dark-border light:border-light-border bg-dark-surface/50 light:bg-light-surface/50 space-y-3">
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-dark-text light:text-light-text">
            כל הכבוד! אין תנועות הממתינות לבדיקה
          </h3>
          <p className="text-xs text-dark-text-muted max-w-sm mx-auto">
            כל העסקאות מסווגות ומאושרות. כשתבצע סנכרון חדש או משיכת מזומן, תנועות חדשות יופיעו כאן.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {queue.map((tx) => {
            const isIncome = parseFloat(tx.amount) > 0;
            const isAtm = Boolean(
              tx.isCashWithdrawal ||
              (tx.merchantName && tx.merchantName.includes('משיכת מזומן')) ||
              (tx.description && tx.description.includes('משיכת מזומן')) ||
              (tx.merchantName && tx.merchantName.includes('כספומט'))
            );
            const isEditingCategory = editingCatId === tx.id;

            return (
              <div
                key={tx.id}
                className={`p-4 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-1 duration-200 ${
                  tx.isFlagged ? 'border-amber-500/40 bg-amber-500/5' : ''
                }`}
              >
                {/* Right: Info */}
                <div className="flex items-center gap-3.5 min-w-0">
                  <CategoryBadge category={tx.category} size={24} />

                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-dark-text light:text-light-text truncate">
                        {tx.userDescription || tx.merchantName || tx.description || 'ללא תיאור'}
                      </span>

                      {isAtm && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-500 text-[10px] font-bold inline-flex items-center gap-1">
                          <span>💵</span>
                          <span>משיכת מזומן</span>
                        </span>
                      )}

                      {tx.isFlagged && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-400 text-[10px] font-semibold">
                          מסומנת בדגל
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-dark-text-muted light:text-light-text-muted flex-wrap">
                      <span>{formatDate(tx.date, lang)}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-mono text-[11px]">
                        <span>{tx.accountDisplayName || tx.bankCompany}</span>
                        {tx.accountNumber && <span>(•••• {tx.accountNumber.slice(-4)})</span>}
                      </span>
                      <span>•</span>
                      <span className="px-2 py-0.5 rounded-lg bg-dark-surface-elevated light:bg-light-surface-elevated font-semibold text-[11px] text-brand-primary">
                        סיווג נוכחי: {tx.category || 'ללא סיווג'}
                      </span>
                    </div>

                    {isEditingCategory && (
                      <div className="pt-2 max-w-xs animate-in fade-in duration-150">
                        <CategoryPicker
                          value={tx.category}
                          onChange={(newCat) => {
                            handleAction(tx, 'change_category', newCat);
                            setEditingCatId(null);
                          }}
                          placeholder="בחר קטגוריה חדשה..."
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Left: Amount & Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                  <div className="text-left rtl:text-right">
                    <div
                      className={`text-base sm:text-lg font-bold font-mono ${
                        isIncome ? 'text-emerald-500' : 'text-dark-text light:text-light-text'
                      }`}
                      dir="ltr"
                    >
                      {formatILS(tx.amount, { showSign: true })}
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center gap-2">
                    {/* Approve Button */}
                    <button
                      type="button"
                      onClick={() => handleAction(tx, 'approve')}
                      disabled={actionLoadingId === tx.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition-all active:scale-95"
                      title="אשר סיווג"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>אשר</span>
                    </button>

                    {/* Change Category Button */}
                    <button
                      type="button"
                      onClick={() => setEditingCatId(editingCatId === tx.id ? null : tx.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-dark-border light:border-light-border hover:border-brand-primary text-xs font-semibold transition-colors"
                      title="שנה קטגוריה"
                    >
                      <Tag className="w-3.5 h-3.5 text-pink-400" />
                      <span>סיווג</span>
                      <ChevronDown className="w-3 h-3 opacity-60" />
                    </button>

                    {/* Flag Button */}
                    <button
                      type="button"
                      onClick={() => handleAction(tx, tx.isFlagged ? 'unflag' : 'flag')}
                      className={`p-2 rounded-xl border transition-colors ${
                        tx.isFlagged
                          ? 'border-amber-500/50 bg-amber-500/15 text-amber-400'
                          : 'border-dark-border light:border-light-border hover:bg-dark-surface-elevated text-dark-text-muted hover:text-amber-400'
                      }`}
                      title={tx.isFlagged ? 'הסר דגל' : 'סמן בדגל לטיפול מאוחר יותר'}
                    >
                      <Flag className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Undo Toast */}
      {undoItem && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-dark-surface-elevated light:bg-light-surface-elevated border border-brand-primary/50 text-dark-text light:text-light-text px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-2.5 text-xs font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              תנועה <b>"{undoItem.tx.userDescription || undoItem.tx.merchantName || undoItem.tx.description}"</b> {undoItem.actionName}.
            </span>
          </div>

          <button
            type="button"
            onClick={handleUndo}
            className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-primary-hover shadow-sm transition-all active:scale-95"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>בטל</span>
          </button>
        </div>
      )}
    </div>
  );
}
