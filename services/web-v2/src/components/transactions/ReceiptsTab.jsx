'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  Link as LinkIcon, 
  Sparkles, 
  FileText, 
  Trash2, 
  RefreshCw, 
  Check, 
  AlertCircle, 
  ExternalLink,
  CheckSquare,
  Square,
  Split,
  Tag,
  ChevronDown,
  Layers,
  Image as ImageIcon,
  CheckCircle2,
  Calendar,
  DollarSign
} from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { formatILS } from '@/lib/formatters';
import CategoryBadge from '@/components/common/CategoryBadge';
import CategoryPicker from '@/components/common/CategoryPicker';

export default function ReceiptsTab({ tx, categories, onSplitsUpdated, onReceiptsCountChanged }) {
  const { lang, t } = useApp();
  const fileInputRef = useRef(null);

  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeReceiptIndex, setActiveReceiptIndex] = useState(0);

  // Upload & URL inputs
  const [uploadMode, setUploadMode] = useState('file'); // 'file' | 'url'
  const [digitalUrl, setDigitalUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null); // { type: 'error' | 'success', text: string }

  // Extracted items editing & multi-selection
  const [items, setItems] = useState([]);
  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const [bulkPickerOpen, setBulkPickerOpen] = useState(false);
  const [isApplyingSplits, setIsApplyingSplits] = useState(false);
  const [splitsSuccess, setSplitsSuccess] = useState(false);

  // Fetch receipts for this transaction
  const loadReceipts = async () => {
    if (!tx?.id) return;
    setLoading(true);
    try {
      const res = await api.getReceipts(tx.id);
      if (res.data?.data) {
        const list = res.data.data;
        setReceipts(list);
        onReceiptsCountChanged?.(list.length);
        if (list.length > 0) {
          setActiveReceiptIndex(0);
          syncItemsFromReceipt(list[0]);
        } else {
          setItems([]);
          setSelectedIndices(new Set());
        }
      }
    } catch (err) {
      console.error('Failed to load receipts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReceipts();
  }, [tx?.id]);

  // When switching active receipt
  const syncItemsFromReceipt = (receipt) => {
    if (!receipt) {
      setItems([]);
      setSelectedIndices(new Set());
      return;
    }
    const extracted = receipt.extracted_data || {};
    const parsedItems = Array.isArray(extracted.items) ? extracted.items : [];
    
    // Normalize items with a default category if none provided
    const normalized = parsedItems.map((item) => ({
      name: item.name || 'פריט ללא שם',
      qty: parseFloat(item.qty) || 1,
      price: parseFloat(item.price) || 0,
      category: item.category || tx?.category || 'סופר ומכולת',
    }));

    setItems(normalized);
    setSelectedIndices(new Set());
  };

  const handleSelectReceipt = (idx) => {
    setActiveReceiptIndex(idx);
    syncItemsFromReceipt(receipts[idx]);
    setStatusMessage(null);
    setSplitsSuccess(false);
  };

  // Upload file handler
  const handleFileUpload = async (file) => {
    if (!file || !tx?.id) return;
    setIsProcessing(true);
    setStatusMessage(null);
    setSplitsSuccess(false);

    try {
      const res = await api.uploadReceipt(tx.id, file);
      if (res.error) {
        setStatusMessage({ type: 'error', text: res.error });
      } else {
        setStatusMessage({ type: 'success', text: 'החשבונית נשמרה ונותחה בהצלחה!' });
        await loadReceipts();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('fintrack_tx_updated'));
        }
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message || 'שגיאה בהעלאת החשבונית' });
    } finally {
      setIsProcessing(false);
    }
  };

  // URL analysis handler
  const handleUrlSubmit = async (e) => {
    e.preventDefault();
    if (!digitalUrl.trim() || !tx?.id) return;
    setIsProcessing(true);
    setStatusMessage(null);
    setSplitsSuccess(false);

    try {
      const res = await api.analyzeReceiptUrl(tx.id, digitalUrl.trim());
      if (res.error) {
        setStatusMessage({ type: 'error', text: res.error });
      } else {
        setStatusMessage({ type: 'success', text: 'החשבונית הדיגיטלית נותחה בהצלחה!' });
        setDigitalUrl('');
        await loadReceipts();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('fintrack_tx_updated'));
        }
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message || 'שגיאה בניתוח הקישור' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Delete current receipt
  const handleDeleteReceipt = async (receiptId) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק חשבונית זו?')) return;
    try {
      await api.deleteReceipt(receiptId);
      await loadReceipts();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fintrack_tx_updated'));
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'נכשל במחיקת החשבונית' });
    }
  };

  // Reanalyze current receipt
  const handleReanalyze = async (receiptId) => {
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const res = await api.reanalyzeReceipt(receiptId);
      if (res.data?.data) {
        setStatusMessage({ type: 'success', text: 'החשבונית נותחה מחדש בהצלחה!' });
        await loadReceipts();
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'שגיאה בניתוח מחדש' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Multi-selection methods
  const toggleItemSelection = (idx) => {
    const next = new Set(selectedIndices);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    setSelectedIndices(next);
  };

  const toggleSelectAll = () => {
    if (selectedIndices.size === items.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(items.map((_, i) => i)));
    }
  };

  // Apply category to selected items
  const handleApplyCategoryToSelected = (newCategory) => {
    if (!newCategory || selectedIndices.size === 0) return;
    const updated = items.map((item, idx) => {
      if (selectedIndices.has(idx)) {
        return { ...item, category: newCategory };
      }
      return item;
    });
    setItems(updated);
    setSelectedIndices(new Set()); // deselect after bulk assignment
    setBulkPickerOpen(false);
    setStatusMessage({
      type: 'success',
      text: `הקטגוריה "${newCategory}" הוחלה על ${selectedIndices.size} פריטים`,
    });
    setTimeout(() => setStatusMessage(null), 3500);
  };

  // Calculate category totals from items
  const categoryTotals = items.reduce((acc, item) => {
    const cat = item.category || 'אחר';
    acc[cat] = (acc[cat] || 0) + (parseFloat(item.price) || 0);
    return acc;
  }, {});

  const currentReceipt = receipts[activeReceiptIndex];
  const itemsTotal = items.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);

  // Apply Splits to Transaction
  const handleApplySplits = async () => {
    if (items.length === 0 || !tx?.id) return;
    setIsApplyingSplits(true);
    setSplitsSuccess(false);
    setStatusMessage(null);

    try {
      // Group items by category
      const groups = {};
      items.forEach((item) => {
        const cat = item.category || tx.category || 'סופר ומכולת';
        if (!groups[cat]) {
          groups[cat] = { amount: 0, names: [] };
        }
        groups[cat].amount += parseFloat(item.price) || 0;
        if (item.name) groups[cat].names.push(item.name);
      });

      const splitsPayload = Object.entries(groups).map(([cat, data]) => ({
        category: cat,
        amount: parseFloat(data.amount.toFixed(2)),
        description: data.names.slice(0, 3).join(', ') + (data.names.length > 3 ? '...' : ''),
      }));

      const res = await api.applyReceiptSplits(tx.id, splitsPayload);
      if (res.error) {
        setStatusMessage({ type: 'error', text: res.error });
      } else {
        setSplitsSuccess(true);
        setStatusMessage({
          type: 'success',
          text: 'הפיצולים הוחלו בהצלחה על התנועה לפי חלוקת הפריטים! 🎉',
        });
        onSplitsUpdated?.();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('fintrack_tx_updated'));
        }
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message || 'שגיאה בהחלת הפיצולים' });
    } finally {
      setIsApplyingSplits(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Receipts Top Navigation (if multiple receipts exist) */}
      {receipts.length > 1 && (
        <div className="flex items-center gap-1.5 p-1 bg-dark-surface-elevated light:bg-light-surface-elevated rounded-xl border border-dark-border light:border-light-border overflow-x-auto">
          {receipts.map((r, idx) => (
            <button
              key={r.id}
              onClick={() => handleSelectReceipt(idx)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeReceiptIndex === idx
                  ? 'bg-brand-primary text-white shadow-sm'
                  : 'text-dark-text-muted light:text-light-text-muted hover:text-dark-text'
              }`}
            >
              <span>חשבונית {idx + 1}</span>
              {r.file_type === 'url' ? <LinkIcon className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
            </button>
          ))}
        </div>
      )}

      {/* Upload & Digital URL Box */}
      <div className="p-4 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs font-semibold text-dark-text light:text-light-text">
            <span>הוספת חשבונית חדשה</span>
          </div>

          <div className="flex items-center gap-1 p-0.5 bg-dark-surface light:bg-light-surface rounded-lg border border-dark-border light:border-light-border text-xs">
            <button
              type="button"
              onClick={() => setUploadMode('file')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                uploadMode === 'file'
                  ? 'bg-brand-primary text-white shadow-sm'
                  : 'text-dark-text-muted hover:text-dark-text'
              }`}
            >
              העלאת קובץ
            </button>
            <button
              type="button"
              onClick={() => setUploadMode('url')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                uploadMode === 'url'
                  ? 'bg-brand-primary text-white shadow-sm'
                  : 'text-dark-text-muted hover:text-dark-text'
              }`}
            >
              קישור דיגיטלי (URL)
            </button>
          </div>
        </div>

        {uploadMode === 'file' ? (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
            />

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.[0]) {
                  handleFileUpload(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                dragOver
                  ? 'border-brand-primary bg-brand-primary/10'
                  : 'border-dark-border light:border-light-border hover:border-brand-primary/60 bg-dark-surface light:bg-light-surface'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                <Upload className="w-5 h-5" />
              </div>
              <div className="text-xs font-semibold text-dark-text light:text-light-text">
                גרור לכאן חשבונית או לחץ לבחירה
              </div>
              <div className="text-[11px] text-dark-text-muted">
                תמיכה בתמונות (JPG, PNG, HEIC) וקובצי PDF עד 10MB
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleUrlSubmit} className="space-y-2">
            <div className="flex gap-2">
              <input
                type="url"
                value={digitalUrl}
                onChange={(e) => setDigitalUrl(e.target.value)}
                placeholder="למשל: https://digi.rami-levy.co.il/..."
                className="flex-1 p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text text-xs focus:ring-2 focus:ring-brand-primary"
              />
              <button
                type="submit"
                disabled={isProcessing || !digitalUrl.trim()}
                className="px-4 py-2.5 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-semibold shrink-0 disabled:opacity-50 flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>נתח קישור</span>
              </button>
            </div>
            <p className="text-[11px] text-dark-text-muted">
              תמיכה בחשבוניות דיגיטליות מרמי לוי, שופרסל, אתרי מסחר וקבלות מקוונות.
            </p>
          </form>
        )}
      </div>

      {/* Processing State Indicator */}
      {isProcessing && (
        <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400 flex items-center gap-3 animate-pulse">
          <RefreshCw className="w-5 h-5 animate-spin shrink-0" />
          <div className="text-xs">
            <div className="font-bold">מנתח חשבונית ומחלץ פריטים...</div>
            <div className="text-[11px] opacity-80">Google Gemini מפענח את המוצרים, הכמויות והסכומים.</div>
          </div>
        </div>
      )}

      {/* Status Messages */}
      {statusMessage && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            statusMessage.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
          }`}
        >
          {statusMessage.type === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : (
            <Check className="w-4 h-4 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Current Active Receipt Details */}
      {currentReceipt && !isProcessing && (
        <div className="space-y-4">
          {/* Header Card with Vendor and Meta */}
          <div className="p-4 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-dark-text light:text-light-text">
                    {currentReceipt.extracted_data?.vendor || currentReceipt.file_name || 'חשבונית'}
                  </span>
                  {currentReceipt.ai_analyzed && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5" />
                      <span>נותח ב-Gemini AI</span>
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[11px] text-dark-text-muted mt-1">
                  {currentReceipt.extracted_data?.date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>{currentReceipt.extracted_data.date}</span>
                    </span>
                  )}
                  {currentReceipt.extracted_data?.total && (
                    <span className="flex items-center gap-1 font-semibold text-dark-text light:text-light-text">
                      <DollarSign className="w-3 h-3" />
                      <span>סכום חשבונית: {formatILS(currentReceipt.extracted_data.total)}</span>
                    </span>
                  )}
                  {currentReceipt.extracted_data?.invoice_number && (
                    <span>מס' חשבונית: {currentReceipt.extracted_data.invoice_number}</span>
                  )}
                </div>
              </div>

              {/* Actions: View Original, Reanalyze, Delete */}
              <div className="flex items-center gap-1">
                {currentReceipt.file_type === 'url' && currentReceipt.source_url ? (
                  <a
                    href={currentReceipt.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-lg border border-dark-border light:border-light-border hover:bg-dark-surface-elevated text-dark-text-muted hover:text-dark-text"
                    title="פתח קישור מקור"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ) : currentReceipt.file_path ? (
                  <a
                    href={api.getReceiptFileUrl(currentReceipt.file_path)}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-lg border border-dark-border light:border-light-border hover:bg-dark-surface-elevated text-dark-text-muted hover:text-dark-text"
                    title="הצג קובץ מקורי"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ) : null}

                <button
                  type="button"
                  onClick={() => handleReanalyze(currentReceipt.id)}
                  className="p-1.5 rounded-lg border border-dark-border light:border-light-border hover:bg-dark-surface-elevated text-dark-text-muted hover:text-dark-text"
                  title="נתח מחדש"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteReceipt(currentReceipt.id)}
                  className="p-1.5 rounded-lg border border-dark-border light:border-light-border hover:bg-rose-500/10 text-dark-text-muted hover:text-rose-400"
                  title="מחק חשבונית"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Note that original transaction details remain untouched */}
            <div className="text-[11px] text-dark-text-muted bg-dark-surface-elevated light:bg-light-surface-elevated p-2 rounded-xl border border-dark-border light:border-light-border">
              💡 שם העסק והסכום מהחשבונית מוצגים כהשוואה בלבד ואינם דורסים את נתוני התנועה המקורית בבנק.
            </div>
          </div>

          {/* Interactive Items List with Multi-Select */}
          {items.length > 0 ? (
            <div className="p-4 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="p-1 rounded text-dark-text-muted hover:text-dark-text"
                    title={selectedIndices.size === items.length ? 'בטל בחירת הכל' : 'בחר הכל'}
                  >
                    {selectedIndices.size === items.length && items.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-brand-primary" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                  <span className="text-xs font-bold text-dark-text light:text-light-text">
                    פריטי החשבונית ({items.length})
                  </span>
                </div>

                <div className="text-xs font-semibold text-brand-primary">
                  סה"כ פריטים: {formatILS(itemsTotal)}
                </div>
              </div>

              {/* Floating/Sticky Bulk Category Bar */}
              {selectedIndices.size > 0 && (
                <div className="p-3 rounded-xl bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-between gap-3 animate-in fade-in">
                  <div className="text-xs font-bold text-brand-primary flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>נבחרו {selectedIndices.size} פריטים</span>
                  </div>

                  <div className="flex items-center gap-2 relative">
                    <button
                      type="button"
                      onClick={() => setBulkPickerOpen(!bulkPickerOpen)}
                      className="px-3 py-1.5 rounded-lg bg-brand-primary hover:bg-brand-primary/90 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                    >
                      <Tag className="w-3.5 h-3.5" />
                      <span>החל קטגוריה</span>
                      <ChevronDown className="w-3 h-3" />
                    </button>

                    {bulkPickerOpen && (
                      <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-dark-surface light:bg-light-surface rounded-xl border border-dark-border light:border-light-border shadow-2xl p-2 max-h-60 overflow-y-auto">
                        <div className="text-[11px] font-semibold text-dark-text-muted p-1 border-b border-dark-border light:border-light-border mb-1">
                          בחר קטגוריה להחלה:
                        </div>
                        {categories.map((c) => (
                          <div key={c.id || c.name}>
                            <button
                              type="button"
                              onClick={() => handleApplyCategoryToSelected(c.name)}
                              className="w-full text-right p-1.5 rounded-lg hover:bg-dark-surface-elevated text-xs flex items-center gap-2 font-medium"
                            >
                              <CategoryBadge category={c.name} size={16} />
                              <span>{c.name}</span>
                            </button>
                            {/* Subcategories */}
                            {c.subs?.map((sub) => (
                              <button
                                key={sub.name}
                                type="button"
                                onClick={() => handleApplyCategoryToSelected(sub.name)}
                                className="w-full text-right p-1.5 pr-6 rounded-lg hover:bg-dark-surface-elevated text-xs flex items-center gap-2 text-dark-text-muted"
                              >
                                <CategoryBadge category={sub.name} size={14} />
                                <span>{sub.name}</span>
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Items List Rows */}
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {items.map((item, idx) => {
                  const isSelected = selectedIndices.has(idx);
                  return (
                    <div
                      key={idx}
                      onClick={() => toggleItemSelection(idx)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'border-brand-primary bg-brand-primary/5'
                          : 'border-dark-border light:border-light-border bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 hover:border-brand-primary/40'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="text-dark-text-muted hover:text-dark-text shrink-0">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-brand-primary" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-dark-text light:text-light-text truncate">
                            {item.name}
                          </div>
                          {item.qty > 1 && (
                            <div className="text-[10px] text-dark-text-muted">
                              כמות: {item.qty}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <CategoryBadge category={item.category} size={16} />
                        <span className="text-xs font-bold text-dark-text light:text-light-text">
                          {formatILS(item.price)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Category Breakdown Aggregation Pills */}
              <div className="pt-3 border-t border-dark-border light:border-light-border space-y-2">
                <div className="text-xs font-bold text-dark-text-muted">
                  סיכום חלוקה לפי קטגוריות:
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(categoryTotals).map(([catName, total]) => (
                    <div
                      key={catName}
                      className="px-2.5 py-1 rounded-xl bg-dark-surface-elevated light:bg-light-surface-elevated border border-dark-border light:border-light-border flex items-center gap-2 text-xs font-semibold"
                    >
                      <CategoryBadge category={catName} size={16} />
                      <span>{catName}:</span>
                      <span className="text-brand-primary">{formatILS(total)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Button: Create Transaction Splits */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleApplySplits}
                  disabled={isApplyingSplits}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-brand-primary to-indigo-600 hover:from-brand-primary/90 hover:to-indigo-600/90 text-white font-bold text-xs shadow-lg shadow-brand-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Split className="w-4 h-4" />
                  <span>
                    {isApplyingSplits ? 'מחיל פיצולים...' : '🪄 הפוך חלוקה זו לפיצול תנועה'}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-2xl border border-dashed border-dark-border light:border-light-border text-center text-xs text-dark-text-muted">
              לא זוהו פריטים בחשבונית זו. ניתן לבצע ניתוח מחדש או להעלות קובץ ברור יותר.
            </div>
          )}
        </div>
      )}

      {/* Empty State when no receipts at all */}
      {receipts.length === 0 && !loading && !isProcessing && (
        <div className="p-8 text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 text-brand-primary mx-auto flex items-center justify-center">
            <FileText className="w-6 h-6" />
          </div>
          <div className="text-xs font-bold text-dark-text light:text-light-text">
            אין עדיין חשבוניות לתנועה זו
          </div>
          <div className="text-[11px] text-dark-text-muted max-w-xs mx-auto">
            העלה תמונה, קובץ PDF או הזן קישור לחשבונית דיגיטלית כדי לחלץ את הפריטים ולפצל לפי קטגוריות.
          </div>
        </div>
      )}
    </div>
  );
}
