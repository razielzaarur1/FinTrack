'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Split, 
  Link2, 
  FileText, 
  Plus, 
  Trash2, 
  Save, 
  Check, 
  AlertCircle,
  Tag,
  Database,
  Copy,
  Info,
  Layers,
  Calendar,
  CreditCard,
  Hash,
  Search,
  Unlink,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatILS, formatDate, cleanSpacedHebrew } from '@/lib/formatters';
import { useApp } from '@/lib/app-context';
import CategoryBadge from '@/components/common/CategoryBadge';
import CategoryPicker from '@/components/common/CategoryPicker';
import { CATEGORIES_DATA } from '@/lib/categories';

export default function TransactionDrawer({ tx, onClose, onUpdate }) {
  const { lang, t } = useApp();
  const [activeTx, setActiveTx] = useState(tx);
  const [activeTab, setActiveTab] = useState('details'); // details, similar, splits, links, notes, scraper
  const [category, setCategory] = useState(tx?.category || '');
  const [userDesc, setUserDesc] = useState(tx?.userDescription || '');
  const [isIgnored, setIsIgnored] = useState(tx?.isIgnored || false);
  const [applyToSimilar, setApplyToSimilar] = useState(false);
  const [similarTxs, setSimilarTxs] = useState([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [showFullLinkerModal, setShowFullLinkerModal] = useState(false);
  const [savingTx, setSavingTx] = useState(false);
  const [copiedRaw, setCopiedRaw] = useState(false);

  // Prevent background page scrolling when drawer is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow || 'unset';
    };
  }, []);

  // Synchronize activeTx with prop
  useEffect(() => {
    if (tx) setActiveTx(tx);
  }, [tx]);

  // Categories list
  const [categories, setCategories] = useState([]);

  // Splits state
  const [splits, setSplits] = useState([]);
  const [savingSplits, setSavingSplits] = useState(false);
  const [splitError, setSplitError] = useState('');

  // Notes state
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');

  // Links state
  const [links, setLinks] = useState([]);
  const [linkType, setLinkType] = useState('refund'); // 'refund' | 'related' | 'correction'

  useEffect(() => {
    if (!activeTx) return;

    setCategory(activeTx.category || '');
    setUserDesc(activeTx.userDescription || '');
    setIsIgnored(activeTx.isIgnored || false);
    setApplyToSimilar(false);

    // Fetch similar transactions sharing merchant name
    setLoadingSimilar(true);
    api.getSimilarTransactions(activeTx.id)
      .then((res) => {
        if (res.data) setSimilarTxs(res.data.data || []);
      })
      .catch(() => {})
      .finally(() => setLoadingSimilar(false));

    // Fetch categories
    api.getCategories().then((res) => {
      if (res.data) setCategories(res.data.data || []);
    });

    // Fetch splits
    api.getSplits(activeTx.id).then((res) => {
      if (res.data) setSplits(res.data.data || []);
    });

    // Fetch notes
    api.getNotes(activeTx.id).then((res) => {
      if (res.data) setNotes(res.data.data || []);
    });

    // Fetch links
    api.getLinks(activeTx.id).then((res) => {
      if (res.data) setLinks(res.data.data || []);
    });
  }, [activeTx]);

  if (!tx || !activeTx) return null;

  const currentAmountNum = parseFloat(activeTx.amount) || 0;
  const parentAmount = Math.abs(currentAmountNum);
  const splitsTotal = splits.reduce((acc, s) => acc + (parseFloat(s.amount) || 0), 0);
  const splitsBalanced = Math.abs(parentAmount - splitsTotal) <= 0.01;
  const remainingAmount = Number((parentAmount - splitsTotal).toFixed(2));

  const isAtmWithdrawal = Boolean(
    activeTx.isCashWithdrawal ||
    activeTx?.raw_data?.isAtm ||
    (activeTx.merchantName && activeTx.merchantName.includes('משיכת מזומן')) ||
    (activeTx.description && activeTx.description.includes('משיכת מזומן')) ||
    (activeTx.merchantName && activeTx.merchantName.includes('כספומט')) ||
    (activeTx.description && activeTx.description.includes('כספומט'))
  );

  const handleSetupAtmSplit = () => {
    setActiveTab('splits');
    if (splits.length === 0) {
      setSplits([
        { amount: parentAmount, category: activeTx.category && activeTx.category !== 'ללא סיווג' ? activeTx.category : '', description: '' },
      ]);
    }
  };

  const handleSaveDetails = async () => {
    setSavingTx(true);
    try {
      const res = await api.updateTransaction(activeTx.id, {
        category,
        userDescription: userDesc.trim(),
        isIgnored,
        applyToSimilar,
      });
      if (res.data) {
        onUpdate?.({
          ...activeTx,
          category,
          userDescription: userDesc.trim(),
          isIgnored,
        });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('fintrack_tx_updated'));
        }
        onClose?.(); // Automatically close drawer on save
      }
    } finally {
      setSavingTx(false);
    }
  };

  const handleAddSplitRow = () => {
    setSplits([
      ...splits,
      { amount: 0, category: activeTx.category || 'אחר', description: '' },
    ]);
  };

  const handleSplitChange = (index, field, value) => {
    const updated = [...splits];
    updated[index][field] = field === 'amount' ? parseFloat(value) || 0 : value;
    setSplits(updated);
  };

  const handleRemoveSplitRow = (index) => {
    setSplits(splits.filter((_, idx) => idx !== index));
  };

  const handleSaveSplits = async () => {
    if (splitsTotal > parentAmount + 0.01) {
      setSplitError(lang === 'he' ? 'סכום הפיצולים אינו יכול לעלות על סכום התנועה המקורית' : 'Total splits cannot exceed the original transaction amount');
      return;
    }
    if (!splitsBalanced) {
      setSplitError(lang === 'he' ? `סכום הפיצולים חייב להיות שווה במדויק לסכום התנועה המקורית (נותרה יתרה לחלוקה: ${formatILS(remainingAmount)})` : 'Total splits must strictly equal the original transaction amount');
      return;
    }
    setSplitError('');
    setSavingSplits(true);
    try {
      const res = await api.saveSplits(activeTx.id, splits);
      if (res.error) {
        setSplitError(res.error);
      } else {
        onUpdate?.({ ...activeTx, isSplit: true });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('fintrack_tx_updated'));
        }
        onClose?.(); // Automatically close drawer on save
      }
    } finally {
      setSavingSplits(false);
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    const res = await api.addNote(activeTx.id, newNote.trim());
    if (res.data) {
      setNotes([res.data.data, ...notes]);
      setNewNote('');
    }
  };

  const handleDeleteNote = async (noteId) => {
    await api.deleteNote(noteId);
    setNotes(notes.filter((n) => n.id !== noteId));
  };

  const handleLinkDirect = async (targetTxId) => {
    try {
      const res = await api.linkTransaction(activeTx.id, {
        targetTransactionId: targetTxId,
        linkType,
      });
      if (res.data) {
        const updated = await api.getLinks(activeTx.id);
        if (updated.data) setLinks(updated.data.data || []);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('fintrack_tx_updated'));
        }
      }
    } catch (err) {
      console.error('Failed to link transaction:', err);
    }
  };

  const handleUnlink = async (linkId) => {
    try {
      await api.deleteLink(linkId);
      setLinks((prev) => prev.filter((l) => l.linkId !== linkId));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fintrack_tx_updated'));
      }
    } catch (err) {
      console.error('Failed to unlink transaction:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-lg bg-dark-surface light:bg-light-surface h-full border-l border-dark-border light:border-light-border shadow-2xl flex flex-col justify-between overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-dark-border light:border-light-border flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <CategoryBadge category={category || activeTx.category} size={22} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-brand-primary/15 text-brand-primary">
                  {activeTx.accountDisplayName || activeTx.bankCompany?.toUpperCase()}
                </span>
                {activeTx.status === 'pending' && (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium">
                    ממתין
                  </span>
                )}
              </div>
              <div className="text-lg font-bold mt-0.5 truncate max-w-sm text-dark-text light:text-light-text">
                {userDesc || cleanSpacedHebrew(activeTx.merchantName || activeTx.description)}
              </div>
              <div className="text-xs text-dark-text-muted light:text-light-text-muted">
                {formatDate(activeTx.date, lang)} • {formatILS(activeTx.amount, { showSign: true })}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-dark-border light:border-light-border px-4 gap-1.5 sm:gap-2 text-xs font-medium overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('details')}
            className={`py-3 px-2.5 sm:px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'details'
                ? 'border-brand-primary text-brand-primary font-semibold'
                : 'border-transparent text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{lang === 'he' ? 'פרטים' : 'Details'}</span>
          </button>

          <button
            onClick={() => setActiveTab('similar')}
            className={`py-3 px-2.5 sm:px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'similar'
                ? 'border-brand-primary text-brand-primary font-semibold'
                : 'border-transparent text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>תנועות דומות ({similarTxs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('splits')}
            className={`py-3 px-2.5 sm:px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'splits'
                ? 'border-brand-primary text-brand-primary font-semibold'
                : 'border-transparent text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
            }`}
          >
            <Split className="w-3.5 h-3.5" />
            <span>{t('splitTransaction')} ({splits.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('notes')}
            className={`py-3 px-2.5 sm:px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'notes'
                ? 'border-brand-primary text-brand-primary font-semibold'
                : 'border-transparent text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
            }`}
          >
            <span>💬</span>
            <span>{t('notes')} ({notes.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('links')}
            className={`py-3 px-2.5 sm:px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'links'
                ? 'border-brand-primary text-brand-primary font-semibold'
                : 'border-transparent text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>{t('linkTransaction')} ({links.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('scraper')}
            className={`py-3 px-2.5 sm:px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'scraper'
                ? 'border-brand-primary text-brand-primary font-semibold'
                : 'border-transparent text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>נתוני סקריפר</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 min-h-0 p-5 overflow-y-auto overscroll-contain space-y-5 pb-52">
          {/* 1. Details Tab */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              {/* Custom Name / Nickname (Editable at top) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted flex items-center justify-between">
                  <span>כינוי מותאם אישית (יוצג ככותרת)</span>
                  <span className="text-[10px] text-dark-text-muted">ניתן לעריכה</span>
                </label>
                <input
                  type="text"
                  value={userDesc}
                  onChange={(e) => setUserDesc(e.target.value)}
                  placeholder={cleanSpacedHebrew(activeTx.merchantName || activeTx.description || 'ללא שם')}
                  className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-sm font-semibold focus:outline-none focus:border-brand-primary"
                />
              </div>

              {/* Read-Only Bank Merchant Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted flex items-center justify-between">
                  <span>שם בית העסק (מקור הבנק / כרטיס)</span>
                  <span className="text-[10px] text-dark-text-muted">לקריאה בלבד</span>
                </label>
                <div className="w-full p-2.5 rounded-xl border border-dark-border/60 light:border-light-border/60 bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 text-dark-text light:text-light-text font-medium text-sm flex items-center justify-between">
                  <span className="truncate">{cleanSpacedHebrew(activeTx.merchantName || 'לא צוין בית עסק')}</span>
                  {activeTx.merchantName && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('similar')}
                      className="text-[11px] text-brand-primary hover:underline shrink-0 mr-2 cursor-pointer font-semibold"
                    >
                      הצג דומות ({similarTxs.length})
                    </button>
                  )}
                </div>
              </div>

              {/* Read-Only Financial Metadata Chips */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-2.5 rounded-xl border border-dark-border/60 light:border-light-border/60 bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 space-y-1">
                  <div className="text-[10px] font-medium text-dark-text-muted light:text-light-text-muted">סכום חיוב</div>
                  <div className={`text-sm font-bold font-mono ${currentAmountNum < 0 ? 'text-brand-expense' : 'text-brand-income'}`}>
                    {formatILS(activeTx.amount, { showSign: true })}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl border border-dark-border/60 light:border-light-border/60 bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 space-y-1">
                  <div className="text-[10px] font-medium text-dark-text-muted light:text-light-text-muted">תאריך עסקה</div>
                  <div className="text-xs font-semibold text-dark-text light:text-light-text font-mono mt-0.5">
                    {formatDate(activeTx.date, lang)}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl border border-dark-border/60 light:border-light-border/60 bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 space-y-1">
                  <div className="text-[10px] font-medium text-dark-text-muted light:text-light-text-muted">חשבון / כרטיס</div>
                  <div className="text-xs font-semibold text-dark-text light:text-light-text truncate mt-0.5" title={activeTx.accountDisplayName || activeTx.bankCompany}>
                    {activeTx.accountDisplayName || activeTx.bankCompany?.toUpperCase() || 'ראשי'}
                  </div>
                </div>
              </div>

              {activeTx.status === 'pending' && (
                <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-start gap-2.5 text-xs text-amber-300">
                  <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-amber-400">עסקה זמנית (Pending)</div>
                    <div className="text-[11px] text-dark-text-muted light:text-light-text-muted mt-0.5">
                      הסכום המוצג ({formatILS(activeTx.amount)}) מבוסס על סכום העסקה המקורי עד למועד החיוב הסופי.
                    </div>
                  </div>
                </div>
              )}

              {isAtmWithdrawal && (
                <div className="p-3.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">💵</span>
                    <div>
                      <div className="text-xs font-bold text-amber-500 dark:text-amber-400">
                        זוהתה משיכת מזומן מכספומט
                      </div>
                      <div className="text-[11px] text-dark-text-muted light:text-light-text-muted">
                        אינה נספרת כבית עסק. נדרש סיווג או פיצול לארנק
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSetupAtmSplit}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 text-black text-xs font-bold hover:bg-amber-400 transition-colors shrink-0 shadow-sm"
                  >
                    פצל לארנק/הוצאה
                  </button>
                </div>
              )}

              {/* Category Picker with Badges & Subcategories */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
                  {t('category')}
                </label>
                <CategoryPicker
                  value={category}
                  onChange={setCategory}
                  placeholder={lang === 'he' ? 'בחר קטגוריה או תת-קטגוריה...' : 'Select category...'}
                />
              </div>

              {/* Checkboxes: Uniform Clean Cards (Ignore & ApplyToSimilar) */}
              <div className="space-y-2 pt-1">
                {/* 1. Ignore Toggle */}
                <div 
                  onClick={() => setIsIgnored(!isIgnored)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer select-none flex items-start gap-3 ${
                    isIgnored
                      ? 'border-brand-primary/60 bg-brand-primary/10'
                      : 'border-dark-border/70 light:border-light-border/70 bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 hover:bg-dark-surface-elevated'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isIgnored}
                    onChange={(e) => setIsIgnored(e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 mt-0.5 rounded text-brand-primary focus:ring-brand-primary cursor-pointer shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-dark-text light:text-light-text">
                      התעלם מתנועה זו בחישובי דשבורד ותקציבים
                    </div>
                    <div className="text-[11px] text-dark-text-muted light:text-light-text-muted mt-0.5">
                      התנועה תישמר בהיסטוריה אך לא תיכלל בסך ההוצאות והחישובים החודשיים.
                    </div>
                  </div>
                </div>

                {/* 2. Apply to Similar Toggle - Exactly same styling, no flashy lightning/yellow */}
                <div 
                  onClick={() => setApplyToSimilar(!applyToSimilar)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer select-none flex items-start gap-3 ${
                    applyToSimilar
                      ? 'border-brand-primary/60 bg-brand-primary/10'
                      : 'border-dark-border/70 light:border-light-border/70 bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 hover:bg-dark-surface-elevated'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={applyToSimilar}
                    onChange={(e) => setApplyToSimilar(e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 mt-0.5 rounded text-brand-primary focus:ring-brand-primary cursor-pointer shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-dark-text light:text-light-text flex items-center justify-between">
                      <span>החל על כל התנועות הדומות</span>
                      {similarTxs.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-dark-surface light:bg-light-surface border border-dark-border/40 text-dark-text-muted">
                          {similarTxs.length} תנועות נוספות
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-dark-text-muted light:text-light-text-muted mt-0.5">
                      {applyToSimilar
                        ? `הסיווג וההגדרות יוחלו על כל ${similarTxs.length + 1} התנועות של אותו בית עסק ויילמדו להבא.`
                        : 'השינויים יישמרו רק על תנועה ספציפית זו.'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sub-records Quick Access Indicators */}
              {(splits.length > 0 || notes.length > 0 || links.length > 0 || similarTxs.length > 0) && (
                <div className="pt-2 border-t border-dark-border/40 light:border-light-border/40 space-y-1.5">
                  <div className="text-[11px] font-semibold text-dark-text-muted light:text-light-text-muted">
                    רשומות מקושרות לתנועה:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {similarTxs.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('similar')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-dark-surface-elevated light:bg-light-surface-elevated border border-dark-border/70 light:border-light-border/70 text-dark-text light:text-light-text text-xs hover:border-brand-primary transition-colors cursor-pointer"
                      >
                        <Layers className="w-3 h-3 text-brand-primary" />
                        <span>{similarTxs.length} תנועות דומות</span>
                      </button>
                    )}
                    {splits.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('splits')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-dark-surface-elevated light:bg-light-surface-elevated border border-dark-border/70 light:border-light-border/70 text-dark-text light:text-light-text text-xs hover:border-brand-primary transition-colors cursor-pointer"
                      >
                        <Split className="w-3 h-3 text-brand-primary" />
                        <span>{splits.length} פיצולים</span>
                      </button>
                    )}
                    {notes.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('notes')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-dark-surface-elevated light:bg-light-surface-elevated border border-dark-border/70 light:border-light-border/70 text-dark-text light:text-light-text text-xs hover:border-brand-primary transition-colors cursor-pointer"
                      >
                        <span>💬</span>
                        <span>{notes.length} הערות</span>
                      </button>
                    )}
                    {links.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('links')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-dark-surface-elevated light:bg-light-surface-elevated border border-dark-border/70 light:border-light-border/70 text-dark-text light:text-light-text text-xs hover:border-brand-primary transition-colors cursor-pointer"
                      >
                        <Link2 className="w-3 h-3 text-brand-primary" />
                        <span>{links.length} תנועות מקושרות</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Save Button */}
              <button
                onClick={handleSaveDetails}
                disabled={savingTx}
                className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-primary text-white font-medium text-sm hover:bg-brand-primary-hover transition-all cursor-pointer shadow-md shadow-brand-primary/20 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{savingTx ? (lang === 'he' ? 'שומר...' : 'Saving...') : t('save')}</span>
              </button>
            </div>
          )}

          {/* Dedicated Similar Transactions Tab */}
          {activeTab === 'similar' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl border border-dark-border/70 light:border-light-border/70 bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 text-xs space-y-1">
                <div className="font-semibold text-dark-text light:text-light-text flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-brand-primary" />
                  <span>תנועות נוספות עבור אותו בית עסק</span>
                </div>
                <div className="text-dark-text-muted light:text-light-text-muted">
                  בית עסק:{' '}
                  <span className="font-bold text-dark-text light:text-light-text">
                    {cleanSpacedHebrew(activeTx.merchantName || activeTx.description || 'ללא שם')}
                  </span>{' '}
                  ({similarTxs.length} תנועות נוספות במערכת)
                </div>
              </div>

              {loadingSimilar ? (
                <div className="py-16 text-center text-xs text-dark-text-muted flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-brand-primary" />
                  <span>טוען תנועות דומות...</span>
                </div>
              ) : similarTxs.length === 0 ? (
                <div className="py-14 text-center text-xs text-dark-text-muted border border-dashed border-dark-border light:border-light-border rounded-xl p-6 bg-dark-surface-elevated/20 light:bg-light-surface-elevated/20">
                  <Layers className="w-8 h-8 mx-auto text-dark-text-muted/40 mb-2" />
                  <div className="font-semibold">לא נמצאו תנועות נוספות עבור בית עסק זה</div>
                  <div className="text-[11px] text-dark-text-muted mt-1">
                    כל התנועות של אותו בית עסק יוצגו כאן.
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-[11px] text-dark-text-muted px-1">
                    לחץ על תנועה כדי לפתוח אותה ולערוך את פרטיה:
                  </div>
                  {similarTxs.map((stx) => {
                    const stxAmt = parseFloat(stx.amount);
                    return (
                      <div
                        key={stx.id}
                        onClick={() => {
                          setActiveTx(stx);
                          setActiveTab('details');
                        }}
                        className="p-3 rounded-xl border border-dark-border/70 light:border-light-border/70 bg-dark-surface-elevated/50 light:bg-light-surface-elevated/50 hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated hover:border-brand-primary/50 transition-all cursor-pointer flex items-center justify-between gap-3 text-xs group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <CategoryBadge category={stx.category} size={18} />
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-dark-text light:text-light-text truncate group-hover:text-brand-primary transition-colors">
                              {cleanSpacedHebrew(stx.userDescription || stx.merchantName || stx.description || 'ללא תיאור')}
                            </div>
                            <div className="text-[11px] text-dark-text-muted light:text-light-text-muted flex items-center gap-2 mt-0.5">
                              <span className="font-mono">{formatDate(stx.date, lang)}</span>
                              <span>•</span>
                              <span className={stxAmt < 0 ? 'text-brand-expense font-bold' : 'text-brand-income font-bold'}>
                                {formatILS(stx.amount, { showSign: true })}
                              </span>
                              {stx.accountDisplayName && (
                                <>
                                  <span>•</span>
                                  <span className="truncate">{stx.accountDisplayName}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-dark-surface light:bg-light-surface border border-dark-border/40 text-dark-text-muted">
                            {stx.category || 'ללא סיווג'}
                          </span>
                          <span className="text-dark-text-muted group-hover:text-brand-primary transition-colors text-xs font-bold">
                            ←
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 2. Splits Tab */}
          {activeTab === 'splits' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-xs space-y-2">
                <div className="flex justify-between font-semibold">
                  <span className="text-dark-text-muted light:text-light-text-muted">{lang === 'he' ? 'סכום מקורי:' : 'Original Amount:'}</span>
                  <span className="font-bold text-sm">{formatILS(parentAmount)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-dark-text-muted light:text-light-text-muted">{lang === 'he' ? 'סכום פיצולים נוכחי:' : 'Current Splits Sum:'}</span>
                  <span className={splitsBalanced ? 'text-brand-income font-bold text-sm' : 'text-brand-expense font-bold text-sm'}>
                    {formatILS(splitsTotal)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-dark-border/40 light:border-light-border/40">
                  <span className="font-semibold text-dark-text light:text-light-text">{lang === 'he' ? 'יתרה לחלוקה:' : 'Remaining to split:'}</span>
                  <span className={`font-bold text-sm ${Math.abs(remainingAmount) < 0.01 ? 'text-emerald-400' : remainingAmount > 0 ? 'text-amber-400' : 'text-rose-500'}`}>
                    {formatILS(remainingAmount)}
                    {remainingAmount < -0.01 && <span className="text-[11px] font-normal mr-1 text-rose-400">({lang === 'he' ? 'חריגה מהסכום המקורי!' : 'Exceeds original!'})</span>}
                  </span>
                </div>
              </div>

              {splitError && (
                <div className="p-3 rounded-xl bg-brand-expense-bg border border-brand-expense/20 text-brand-expense text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{splitError}</span>
                </div>
              )}

              <div className="space-y-2.5">
                {splits.map((s, idx) => (
                  <div key={idx} className="p-3 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 space-y-2">
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                      <div className="relative w-32 shrink-0">
                        <input
                          type="number"
                          step="0.01"
                          value={s.amount || ''}
                          onChange={(e) => handleSplitChange(idx, 'amount', e.target.value)}
                          placeholder="0.00"
                          className={`w-full p-2 rtl:pr-7 ltr:pl-7 rounded-lg border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-xs font-mono text-left rtl:text-right ${
                            parseFloat(tx.amount) < 0 ? 'text-rose-500 font-semibold' : 'text-emerald-500 font-semibold'
                          }`}
                        />
                        <span className="absolute left-2 rtl:left-auto rtl:right-2 top-2 text-xs font-mono text-dark-text-muted light:text-light-text-muted pointer-events-none">
                          {parseFloat(tx.amount) < 0 ? '-₪' : '+₪'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-[140px]">
                        <CategoryPicker
                          className="w-full"
                          value={s.category}
                          onChange={(val) => handleSplitChange(idx, 'category', val)}
                          placeholder="בחר קטגוריה..."
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSplitRow(idx)}
                        className="p-2 text-brand-expense hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated rounded-lg transition-colors shrink-0"
                        title="הסר שורה"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={s.description || ''}
                      onChange={(e) => handleSplitChange(idx, 'description', e.target.value)}
                      placeholder={lang === 'he' ? 'תיאור לפיצול (אופציונלי)...' : 'Split note (optional)...'}
                      className="w-full p-2 rounded-lg border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text text-xs"
                    />
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleAddSplitRow}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface hover:border-brand-primary text-xs font-semibold text-dark-text light:text-light-text transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>{lang === 'he' ? 'הוסף שורת פיצול' : 'Add Split Row'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveSplits}
                  disabled={savingSplits || splits.length === 0 || !splitsBalanced || splitsTotal > parentAmount + 0.001}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-xs font-semibold transition-all ${
                    splitsBalanced && splitsTotal <= parentAmount + 0.001
                      ? 'bg-brand-primary hover:bg-brand-primary-hover shadow-md shadow-brand-primary/20'
                      : 'bg-gray-600 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  <span>{savingSplits ? 'שומר...' : 'שמור פיצולים'}</span>
                </button>
              </div>
            </div>
          )}

          {/* 3. Links Tab */}
          {activeTab === 'links' && (
            <div className="space-y-4">
              {/* Currently Linked Transactions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-dark-text-muted light:text-light-text-muted px-1">
                  <span>תנועות מקושרות ({links.length})</span>
                </div>
                {links.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-dark-border light:border-light-border text-center text-xs text-dark-text-muted light:text-light-text-muted bg-dark-surface-elevated/30 light:bg-light-surface-elevated/30">
                    אין תנועות מקושרות כרגע לתנועה זו.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {links.map((lnk) => (
                      <div key={lnk.linkId} className="p-3 rounded-xl border border-brand-primary/30 bg-brand-primary/5 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Link2 className="w-4 h-4 text-brand-primary shrink-0" />
                          <div className="min-w-0">
                            <div className="font-semibold text-dark-text light:text-light-text truncate">
                              {cleanSpacedHebrew(lnk.userDescription || lnk.merchantName || lnk.description || 'ללא תיאור')}
                            </div>
                            <div className="text-[11px] text-dark-text-muted light:text-light-text-muted flex items-center gap-2">
                              <span>{formatDate(lnk.date, lang)}</span>
                              <span>•</span>
                              <span className={Number(lnk.amount) < 0 ? 'text-brand-expense' : 'text-brand-income font-medium'}>
                                {formatILS(lnk.amount)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="px-2 py-0.5 rounded-full bg-brand-primary/20 text-brand-primary font-medium text-[10px]">
                            {lnk.linkType === 'refund' ? 'זיכוי' : lnk.linkType === 'correction' ? 'תיקון' : 'קשורה'}
                          </span>
                          <button
                            onClick={() => handleUnlink(lnk.linkId)}
                            className="p-1.5 text-rose-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                            title="בטל קישור"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Clean Link Action Section */}
              <div className="pt-3 space-y-3 border-t border-dark-border/40 light:border-light-border/40">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
                    סוג הקשר לחיבור
                  </label>
                  {/* Link Type Selector */}
                  <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-dark-surface-elevated light:bg-light-surface-elevated border border-dark-border light:border-light-border text-xs">
                    <button
                      type="button"
                      onClick={() => setLinkType('refund')}
                      className={`py-1.5 px-2 rounded-lg font-medium transition-all ${
                        linkType === 'refund'
                          ? 'bg-brand-primary text-white shadow-sm'
                          : 'text-dark-text-muted light:text-light-text-muted hover:text-dark-text'
                      }`}
                    >
                      זיכוי / ביטול
                    </button>
                    <button
                      type="button"
                      onClick={() => setLinkType('related')}
                      className={`py-1.5 px-2 rounded-lg font-medium transition-all ${
                        linkType === 'related'
                          ? 'bg-brand-primary text-white shadow-sm'
                          : 'text-dark-text-muted light:text-light-text-muted hover:text-dark-text'
                      }`}
                    >
                      תנועה קשורה
                    </button>
                    <button
                      type="button"
                      onClick={() => setLinkType('correction')}
                      className={`py-1.5 px-2 rounded-lg font-medium transition-all ${
                        linkType === 'correction'
                          ? 'bg-brand-primary text-white shadow-sm'
                          : 'text-dark-text-muted light:text-light-text-muted hover:text-dark-text'
                      }`}
                    >
                      תיקון / התאמה
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowFullLinkerModal(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white font-bold text-xs shadow-md shadow-brand-primary/20 transition-all cursor-pointer"
                >
                  <Link2 className="w-4 h-4" />
                  <span>קשר תנועה (פתח רשימת תנועות מלאה)</span>
                </button>
              </div>
            </div>
          )}

          {/* 4. Notes Tab */}
          {activeTab === 'notes' && (
            <div className="space-y-4">
              <form onSubmit={handleAddNote} className="flex gap-2">
                <input
                  type="text"
                  placeholder="הוסף הערה..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="flex-1 p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs focus:outline-none focus:border-brand-primary"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-semibold"
                >
                  הוסף
                </button>
              </form>

              <div className="space-y-2">
                {notes.length === 0 ? (
                  <div className="text-center py-8 text-xs text-dark-text-muted light:text-light-text-muted">
                    אין הערות עדיין
                  </div>
                ) : (
                  notes.map((n) => (
                    <div key={n.id} className="p-3 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text flex items-center justify-between text-xs">
                      <span>{n.note}</span>
                      <button
                        onClick={() => handleDeleteNote(n.id)}
                        className="text-brand-expense p-1 hover:bg-dark-surface light:hover:bg-light-surface rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 5. Scraper Raw Data Tab */}
          {activeTab === 'scraper' && (() => {
            let parsedRaw = activeTx.rawData;
            if (typeof parsedRaw === 'string') {
              try { parsedRaw = JSON.parse(parsedRaw); } catch (e) { parsedRaw = null; }
            }
            const rawObj = parsedRaw || {};
            const rawJsonString = JSON.stringify(activeTx.rawData ? (typeof activeTx.rawData === 'string' ? JSON.parse(activeTx.rawData) : activeTx.rawData) : {
              id: activeTx.id,
              identifier: activeTx.identifier,
              date: activeTx.date,
              processedDate: activeTx.processedDate,
              originalAmount: activeTx.originalAmount,
              originalCurrency: activeTx.originalCurrency,
              chargedAmount: activeTx.chargedAmount,
              description: activeTx.description,
              memo: activeTx.memo,
              category: activeTx.category,
              status: activeTx.status,
              type: activeTx.type,
              installments: activeTx.installments
            }, null, 2);

            const handleCopyJson = () => {
              navigator.clipboard.writeText(rawJsonString);
              setCopiedRaw(true);
              setTimeout(() => setCopiedRaw(false), 2000);
            };

            const scraperFields = [
              { label: 'מזהה תנועה (Identifier)', value: activeTx.identifier || rawObj.identifier || activeTx.id, icon: <Hash className="w-3.5 h-3.5 text-brand-primary" /> },
              { label: 'סטטוס תנועה (Status)', value: activeTx.status || rawObj.status || 'completed', badge: activeTx.status === 'pending' ? 'bg-amber-500/20 text-amber-500' : 'bg-emerald-500/20 text-emerald-500' },
              { label: 'סוג תנועה (Type)', value: activeTx.type || rawObj.type || (parseFloat(activeTx.amount) < 0 ? 'expense' : 'income') },
              { label: 'סכום מקורי (Original Amount)', value: rawObj.originalAmount != null ? `${rawObj.originalAmount} ${rawObj.originalCurrency || activeTx.originalCurrency || 'ILS'}` : (activeTx.originalAmount ? `${activeTx.originalAmount} ${activeTx.originalCurrency || 'ILS'}` : 'לא צוין') },
              { label: 'סכום חיוב (Charged Amount)', value: rawObj.chargedAmount != null ? `${rawObj.chargedAmount} ILS` : (activeTx.chargedAmount ? `${activeTx.chargedAmount} ILS` : formatILS(activeTx.amount)) },
              { label: 'תאריך עסקה (Tx Date)', value: formatDate(activeTx.date, lang) },
              { label: 'תאריך עיבוד/חיוב (Processed Date)', value: activeTx.processedDate || rawObj.processedDate ? formatDate(activeTx.processedDate || rawObj.processedDate, lang) : 'לא זמין' },
              { label: 'סיווג ראשוני מהסקריפר (Scraper Category)', value: rawObj.category || 'לא סווג ע״י המקור' },
              { 
                label: 'תשלומי קרדיט/תשלומים (Installments)', 
                value: rawObj.installments 
                  ? `תשלום ${rawObj.installments.number || 1} מתוך ${rawObj.installments.total || 1}` 
                  : (activeTx.installments ? JSON.stringify(activeTx.installments) : 'תשלום רגיל (תשלום יחיד)') 
              },
              { label: 'חשבון / כרטיס מקור', value: `${activeTx.accountDisplayName || activeTx.bankCompany || ''} (${activeTx.accountNumber || 'ראשי'})` }
            ];

            return (
              <div className="space-y-4">
                {/* Prominent Original Description & Memo Card */}
                <div className="p-3.5 rounded-xl border border-brand-primary/30 bg-brand-primary/5 space-y-2">
                  <div className="text-[11px] font-bold text-brand-primary">
                    פירוט מקורי מהבנק / כרטיס אשראי (Original Description):
                  </div>
                  <div className="text-sm font-semibold text-dark-text light:text-light-text select-all">
                    {cleanSpacedHebrew(activeTx.description) || 'ללא תיאור נוסף'}
                  </div>
                  {activeTx.memo && (
                    <div className="text-xs text-dark-text-muted light:text-light-text-muted pt-1.5 border-t border-brand-primary/20">
                      <span className="font-semibold">הערות ספק (Memo):</span> {cleanSpacedHebrew(activeTx.memo)}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-brand-primary" />
                    <span>כל המידע הגולמי שנשלף מסקריפר הבנק/האשראי</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyJson}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-xs font-medium hover:border-brand-primary transition-colors text-dark-text light:text-light-text cursor-pointer"
                  >
                    {copiedRaw ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-dark-text-muted" />}
                    <span>{copiedRaw ? 'הועתק!' : 'העתק JSON'}</span>
                  </button>
                </div>

                {/* Structured Fields Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {scraperFields.map((field, idx) => (
                    <div key={idx} className="p-3 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 space-y-1">
                      <div className="text-[11px] font-medium text-dark-text-muted light:text-light-text-muted flex items-center gap-1">
                        {field.icon}
                        <span>{field.label}</span>
                      </div>
                      <div className="text-xs font-semibold break-all text-dark-text light:text-light-text">
                        {field.badge ? (
                          <span className={`px-2 py-0.5 rounded text-[11px] ${field.badge}`}>{field.value}</span>
                        ) : (
                          field.value
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Raw JSON Code Block */}
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
                    JSON גולמי מלא (Full Raw Scraper Object):
                  </div>
                  <pre className="p-3 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated/90 light:bg-light-surface-elevated/90 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 overflow-x-auto max-h-60 leading-relaxed text-left" dir="ltr">
                    {rawJsonString}
                  </pre>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Full Interactive Transaction Linker Modal */}
      {showFullLinkerModal && (
        <FullTransactionLinkerModal
          currentTx={activeTx}
          linkType={linkType}
          onSelectTx={async (targetId) => {
            await handleLinkDirect(targetId);
            setShowFullLinkerModal(false);
          }}
          onClose={() => setShowFullLinkerModal(false)}
          lang={lang}
        />
      )}
    </div>
  );
}

function FullTransactionLinkerModal({
  currentTx,
  linkType,
  onSelectTx,
  onClose,
  lang,
}) {
  const [search, setSearch] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [linkingId, setLinkingId] = useState(null);

  const fetchCandidates = (searchTerm = '') => {
    setLoading(true);
    api.getTransactionsV2({
      search: searchTerm.trim() || undefined,
      limit: 60,
    })
      .then((res) => {
        if (res.data) {
          const list = (res.data.data || []).filter((t) => t.id !== currentTx.id);
          setTransactions(list);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchCandidates(search);
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchCandidates(search);
  };

  const handlePick = async (targetId) => {
    setLinkingId(targetId);
    try {
      await onSelectTx(targetId);
    } finally {
      setLinkingId(null);
    }
  };

  const currentAmt = parseFloat(currentTx.amount);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-4xl h-[85vh] rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-dark-border light:border-light-border flex items-center justify-between bg-dark-surface-elevated/50 light:bg-light-surface-elevated/50 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-brand-primary/15 text-brand-primary">
                <Link2 className="w-5 h-5" />
              </span>
              <h2 className="text-base sm:text-lg font-bold text-dark-text light:text-light-text">
                {lang === 'he' ? 'בחר תנועה לקישור' : 'Link Transaction'}
              </h2>
            </div>
            <p className="text-xs text-dark-text-muted light:text-light-text-muted mt-1">
              {lang === 'he' ? 'מקשר עבור:' : 'Linking for:'}{' '}
              <span className="font-semibold text-dark-text light:text-light-text">
                {cleanSpacedHebrew(currentTx.userDescription || currentTx.merchantName || currentTx.description)}
              </span>{' '}
              ({formatDate(currentTx.date, lang)} •{' '}
              <span className={currentAmt < 0 ? 'text-brand-expense font-bold' : 'text-brand-income font-bold'}>
                {formatILS(currentTx.amount, { showSign: true })}
              </span>
              )
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated text-dark-text-muted hover:text-dark-text cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 sm:p-4 border-b border-dark-border/70 light:border-light-border/70 bg-dark-surface light:bg-light-surface shrink-0">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute right-3 rtl:right-3 ltr:left-3 top-2.5 text-dark-text-muted pointer-events-none" />
              <input
                type="text"
                placeholder={lang === 'he' ? 'חפש לפי בית עסק, פירוט, תאריך או סכום...' : 'Search by merchant, memo, date or amount...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full py-2 pr-9 pl-3 rtl:pr-9 rtl:pl-3 ltr:pl-9 ltr:pr-3 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs focus:outline-none focus:border-brand-primary"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-semibold transition-colors cursor-pointer shadow-sm"
            >
              {lang === 'he' ? 'חיפוש' : 'Search'}
            </button>
          </form>
        </div>

        {/* Scrollable Candidates List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="py-20 text-center text-xs text-dark-text-muted flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-brand-primary" />
              <span>{lang === 'he' ? 'טוען תנועות זמינות...' : 'Loading candidate transactions...'}</span>
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-20 text-center text-xs text-dark-text-muted">
              {lang === 'he' ? 'לא נמצאו תנועות התואמות לחיפוש' : 'No matching transactions found'}
            </div>
          ) : (
            transactions.map((item) => {
              const itemAmt = parseFloat(item.amount);
              const isItemLinking = linkingId === item.id;

              return (
                <div
                  key={item.id}
                  className="p-3 sm:p-4 rounded-xl border border-dark-border/80 light:border-light-border/80 bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 hover:bg-dark-surface-elevated hover:border-brand-primary/50 transition-all flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <CategoryBadge category={item.category} size={20} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-dark-text light:text-light-text truncate">
                          {cleanSpacedHebrew(item.userDescription || item.merchantName || item.description || 'ללא שם')}
                        </span>
                        {item.accountDisplayName && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-surface light:bg-light-surface border border-dark-border/40 text-dark-text-muted shrink-0">
                            {item.accountDisplayName}
                          </span>
                        )}
                        {item.category && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary font-medium shrink-0">
                            {item.category}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-dark-text-muted light:text-light-text-muted flex items-center gap-2 mt-0.5">
                        <span>{formatDate(item.date, lang)}</span>
                        <span>•</span>
                        <span className={itemAmt < 0 ? 'text-brand-expense font-bold' : 'text-brand-income font-bold'}>
                          {formatILS(item.amount, { showSign: true })}
                        </span>
                        {item.description && item.description !== item.merchantName && (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-sm">{cleanSpacedHebrew(item.description)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isItemLinking}
                    onClick={() => handlePick(item.id)}
                    className="px-3.5 py-2 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white font-bold text-xs transition-all shrink-0 flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {isItemLinking ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Link2 className="w-3.5 h-3.5" />
                    )}
                    <span>{lang === 'he' ? 'קשר לתנועה זו' : 'Link This'}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
