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
  CheckCircle2
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatILS, formatDate, cleanSpacedHebrew } from '@/lib/formatters';
import { useApp } from '@/lib/app-context';
import CategoryBadge from '@/components/common/CategoryBadge';
import CategoryPicker from '@/components/common/CategoryPicker';
import { CATEGORIES_DATA } from '@/lib/categories';

export default function TransactionDrawer({ tx, onClose, onUpdate }) {
  const { lang, t } = useApp();
  const [activeTab, setActiveTab] = useState('details'); // details, splits, links, notes, scraper
  const [merchantName, setMerchantName] = useState(tx?.merchantName || '');
  const [description, setDescription] = useState(tx?.description || '');
  const [amount, setAmount] = useState(tx?.amount ?? '');
  const [txDate, setTxDate] = useState(tx?.date ? String(tx.date).slice(0, 10) : '');
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
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateTxs, setCandidateTxs] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [linkType, setLinkType] = useState('refund'); // 'refund' | 'related' | 'correction'

  useEffect(() => {
    if (!tx) return;

    setMerchantName(tx.merchantName || '');
    setDescription(tx.description || '');
    setAmount(tx.amount ?? '');
    setTxDate(tx.date ? String(tx.date).slice(0, 10) : '');
    setCategory(tx.category || '');
    setUserDesc(tx.userDescription || '');
    setIsIgnored(tx.isIgnored || false);
    setApplyToSimilar(false);

    // Fetch similar transactions sharing merchant name or description
    setLoadingSimilar(true);
    api.getSimilarTransactions(tx.id)
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
    api.getSplits(tx.id).then((res) => {
      if (res.data) setSplits(res.data.data || []);
    });

    // Fetch notes
    api.getNotes(tx.id).then((res) => {
      if (res.data) setNotes(res.data.data || []);
    });

    // Fetch links
    api.getLinks(tx.id).then((res) => {
      if (res.data) setLinks(res.data.data || []);
    });
  }, [tx]);

  // Fetch candidate transactions for linking
  useEffect(() => {
    if (activeTab !== 'links' || !tx) return;
    setLoadingCandidates(true);
    const timeoutId = setTimeout(() => {
      api.getTransactionsV2({
        search: candidateSearch.trim() || undefined,
        limit: 25,
      }).then((res) => {
        if (res.data) {
          const linkedIds = new Set(links.map((l) => l.id));
          const list = (res.data.data || []).filter((t) => t.id !== tx.id && !linkedIds.has(t.id));
          setCandidateTxs(list);
        }
      }).finally(() => {
        setLoadingCandidates(false);
      });
    }, candidateSearch ? 300 : 0);

    return () => clearTimeout(timeoutId);
  }, [activeTab, candidateSearch, links, tx]);

  if (!tx) return null;

  const parentAmount = Math.abs(parseFloat(tx.amount));
  const splitsTotal = splits.reduce((acc, s) => acc + (parseFloat(s.amount) || 0), 0);
  const splitsBalanced = Math.abs(parentAmount - splitsTotal) <= 0.01;
  const remainingAmount = Number((parentAmount - splitsTotal).toFixed(2));

  const isAtmWithdrawal = Boolean(
    tx.isCashWithdrawal ||
    (tx.merchantName && tx.merchantName.includes('משיכת מזומן')) ||
    (tx.description && tx.description.includes('משיכת מזומן')) ||
    (tx.merchantName && tx.merchantName.includes('כספומט'))
  );

  const handleSetupAtmSplit = () => {
    setActiveTab('splits');
    const total = Math.abs(parseFloat(tx.amount) || 0);
    if (splits.length === 0) {
      setSplits([
        { amount: total, category: tx.category && tx.category !== 'ללא סיווג' ? tx.category : '', description: '' },
      ]);
    }
  };

  const handleSaveDetails = async () => {
    setSavingTx(true);
    try {
      const parsedAmount = parseFloat(amount);
      const res = await api.updateTransaction(tx.id, {
        merchantName: merchantName.trim() || undefined,
        description: description.trim() || undefined,
        amount: !isNaN(parsedAmount) ? parsedAmount : undefined,
        date: txDate || undefined,
        category,
        userDescription: userDesc,
        isIgnored,
        applyToSimilar,
      });
      if (res.data) {
        onUpdate?.({
          ...tx,
          merchantName: merchantName.trim() || tx.merchantName,
          description: description.trim() || tx.description,
          amount: !isNaN(parsedAmount) ? parsedAmount : tx.amount,
          date: txDate || tx.date,
          category,
          userDescription: userDesc,
          isIgnored,
        });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('fintrack_tx_updated'));
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
      { amount: 0, category: tx.category || 'אחר', description: '' },
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
      const res = await api.saveSplits(tx.id, splits);
      if (res.error) {
        setSplitError(res.error);
      } else {
        onUpdate?.({ ...tx, isSplit: true });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('fintrack_tx_updated'));
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
    const res = await api.addNote(tx.id, newNote.trim());
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
      const res = await api.linkTransaction(tx.id, {
        targetTransactionId: targetTxId,
        linkType,
      });
      if (res.data) {
        const updated = await api.getLinks(tx.id);
        if (updated.data) setLinks(updated.data.data || []);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('fintrack_tx_updated'));
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
        window.dispatchEvent(new Event('fintrack_tx_updated'));
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
            <CategoryBadge category={category || tx.category} size={22} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-brand-primary/15 text-brand-primary">
                  {tx.accountDisplayName || tx.bankCompany?.toUpperCase()}
                </span>
                {tx.status === 'pending' && (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium">
                    ממתין
                  </span>
                )}
              </div>
              <div className="text-lg font-bold mt-0.5 truncate max-w-sm text-dark-text light:text-light-text">
                {userDesc || cleanSpacedHebrew(tx.merchantName || tx.description)}
              </div>
              <div className="text-xs text-dark-text-muted light:text-light-text-muted">
                {formatDate(tx.date, lang)} • {formatILS(tx.amount, { showSign: true })}
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
              {/* Merchant Name Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
                  שם בית העסק
                </label>
                <input
                  type="text"
                  value={merchantName}
                  onChange={(e) => setMerchantName(e.target.value)}
                  placeholder="שם בית העסק..."
                  className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text font-semibold text-sm focus:outline-none focus:border-brand-primary"
                />
              </div>

              {/* Amount & Date Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
                    סכום העסקה (₪)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-sm font-mono focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
                    תאריך עסקה
                  </label>
                  <input
                    type="date"
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-sm focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>

              {/* Transaction Description / Memo */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
                  פירוט מקורי (מהבנק / חברת האשראי)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="פירוט מקורי מהבנק..."
                  className="w-full p-2.5 rounded-xl border border-dark-border/60 light:border-light-border/60 bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs opacity-90 font-mono focus:outline-none focus:border-brand-primary"
                />
              </div>

              {/* User Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
                  כינוי מותאם אישית (יוצג ככותרת)
                </label>
                <input
                  type="text"
                  value={userDesc}
                  onChange={(e) => setUserDesc(e.target.value)}
                  placeholder={cleanSpacedHebrew(merchantName || description)}
                  className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-sm focus:outline-none focus:border-brand-primary"
                />
              </div>

              {tx.status === 'pending' && (
                <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-start gap-2.5 text-xs text-amber-300">
                  <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-amber-400">עסקה זמנית (Pending)</div>
                    <div className="text-[11px] text-dark-text-muted light:text-light-text-muted mt-0.5">
                      הסכום המוצג ({formatILS(tx.amount)}) מבוסס על סכום העסקה המקורי עד למועד החיוב הסופי.
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

              {/* Ignore Checkbox */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="ignore-tx"
                  checked={isIgnored}
                  onChange={(e) => setIsIgnored(e.target.checked)}
                  className="w-4 h-4 rounded text-brand-primary focus:ring-brand-primary cursor-pointer"
                />
                <label htmlFor="ignore-tx" className="text-xs font-medium cursor-pointer text-dark-text light:text-light-text">
                  {lang === 'he' ? 'התעלם מתנועה זו בחישובי דשבורד ותקציבים' : 'Ignore this transaction in dashboard calculations'}
                </label>
              </div>

              {/* Apply to All Similar Transactions & Preview */}
              <div className="space-y-2">
                <div 
                  onClick={() => setApplyToSimilar(!applyToSimilar)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none space-y-1 ${
                    applyToSimilar 
                      ? 'border-brand-primary bg-brand-primary/15 shadow-sm ring-1 ring-brand-primary/30' 
                      : 'border-brand-primary/30 bg-brand-primary/5 hover:bg-brand-primary/10'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={applyToSimilar}
                      onChange={(e) => setApplyToSimilar(e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 rounded text-brand-primary focus:ring-brand-primary cursor-pointer shrink-0"
                    />
                    <div className="text-xs font-bold text-dark-text light:text-light-text flex items-center gap-1.5 flex-1">
                      <span>⚡</span>
                      <span>החל את השינויים על כל התנועות הדומות</span>
                      {applyToSimilar && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-primary text-white font-bold mr-auto">
                          פעיל
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-dark-text-muted light:text-light-text-muted mr-6 leading-relaxed">
                    {applyToSimilar
                      ? `השינויים יוחלו על כל ${similarTxs.length + 1} התנועות הדומות ויילמדו לתנועות הבאות.`
                      : 'כאשר אינו פעיל, השינויים יישמרו רק על תנועה ספציפית זו בלבד ללא שינוי תנועות אחרות.'}
                  </p>
                </div>

                {/* Similar transactions list preview */}
                {similarTxs.length > 0 && (
                  <div className="p-3 rounded-xl border border-dark-border/60 light:border-light-border/60 bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-dark-text-muted font-medium">
                      <span>תנועות דומות במערכת ({similarTxs.length})</span>
                      <span className="text-[10px]">
                        {applyToSimilar ? 'יעודכנו יחד' : 'לא יושפעו'}
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {similarTxs.slice(0, 8).map((stx) => (
                        <div key={stx.id} className="flex items-center justify-between text-[11px] p-1.5 rounded-lg bg-dark-surface/50 border border-dark-border/30">
                          <div className="flex items-center gap-2 truncate">
                            <span className="text-dark-text-muted font-mono">{formatDate(stx.date, lang)}</span>
                            <span className="truncate">{cleanSpacedHebrew(stx.userDescription || stx.merchantName || stx.description)}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-dark-text-muted">{stx.category || 'ללא סיווג'}</span>
                            <span className={`font-medium ${parseFloat(stx.amount) < 0 ? 'text-brand-expense' : 'text-brand-income'}`}>
                              {formatILS(stx.amount)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={handleSaveDetails}
                disabled={savingTx}
                className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-primary text-white font-medium text-sm hover:bg-brand-primary-hover transition-all cursor-pointer shadow-md shadow-brand-primary/20"
              >
                <Save className="w-4 h-4" />
                <span>{savingTx ? (lang === 'he' ? 'שומר...' : 'Saving...') : t('save')}</span>
              </button>
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
                    אין תנועות מקושרות כרגע. בחר תנועה מהרשימה מטה כדי לקשר.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {links.map((lnk) => (
                      <div key={lnk.linkId} className="p-3 rounded-xl border border-brand-primary/30 bg-brand-primary/5 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Link2 className="w-4 h-4 text-brand-primary shrink-0" />
                          <div className="min-w-0">
                            <div className="font-semibold text-dark-text light:text-light-text truncate">
                              {cleanSpacedHebrew(lnk.description || 'ללא תיאור')}
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
                            className="p-1.5 text-rose-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
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

              {/* Link Type & Search Controls */}
              <div className="pt-2 space-y-2.5 border-t border-dark-border/40 light:border-light-border/40">
                <div className="flex items-center justify-between px-1">
                  <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
                    קשר תנועה חדשה
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowFullLinkerModal(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-primary text-white text-[11px] font-bold shadow-xs hover:bg-brand-primary-hover transition-colors cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>פתח מסך תנועות מלא</span>
                  </button>
                </div>

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

                {/* Search candidate transactions */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute right-3 rtl:right-3 ltr:left-3 top-2.5 text-dark-text-muted light:text-light-text-muted pointer-events-none" />
                  <input
                    type="text"
                    placeholder="חפש לפי שם בית עסק, פירוט, או סכום..."
                    value={candidateSearch}
                    onChange={(e) => setCandidateSearch(e.target.value)}
                    className="w-full py-2 pr-9 pl-3 rtl:pr-9 rtl:pl-3 ltr:pl-9 ltr:pr-3 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>

              {/* Candidate Transactions Scrollable List */}
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {loadingCandidates ? (
                  <div className="text-center py-6 text-xs text-dark-text-muted light:text-light-text-muted">
                    מחפש תנועות...
                  </div>
                ) : candidateTxs.length === 0 ? (
                  <div className="text-center py-6 text-xs text-dark-text-muted light:text-light-text-muted">
                    לא נמצאו תנועות מתאימות לקישור
                  </div>
                ) : (
                  candidateTxs.map((c) => {
                    const cAmount = parseFloat(c.amount);
                    return (
                      <div
                        key={c.id}
                        className="p-2.5 rounded-xl border border-dark-border/70 light:border-light-border/70 bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 hover:border-brand-primary/50 hover:bg-dark-surface-elevated transition-all flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-dark-text light:text-light-text truncate">
                              {cleanSpacedHebrew(c.userDescription || c.merchantName || c.description || 'ללא תיאור')}
                            </span>
                            {c.accountDisplayName && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-dark-surface light:bg-light-surface text-dark-text-muted light:text-light-text-muted shrink-0">
                                {c.accountDisplayName}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-dark-text-muted light:text-light-text-muted flex items-center gap-2 mt-0.5">
                            <span>{formatDate(c.date, lang)}</span>
                            <span>•</span>
                            <span className={cAmount < 0 ? 'text-brand-expense font-medium' : 'text-brand-income font-medium'}>
                              {formatILS(c.amount, { showSign: true })}
                            </span>
                            {c.category && (
                              <>
                                <span>•</span>
                                <span className="truncate">{c.category}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleLinkDirect(c.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-primary/10 hover:bg-brand-primary text-brand-primary hover:text-white font-medium text-[11px] transition-all shrink-0"
                          title="קשר לתנועה זו"
                        >
                          <Link2 className="w-3 h-3" />
                          <span>קשר</span>
                        </button>
                      </div>
                    );
                  })
                )}
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
            let parsedRaw = tx.rawData;
            if (typeof parsedRaw === 'string') {
              try { parsedRaw = JSON.parse(parsedRaw); } catch (e) { parsedRaw = null; }
            }
            const rawObj = parsedRaw || {};
            const rawJsonString = JSON.stringify(tx.rawData ? (typeof tx.rawData === 'string' ? JSON.parse(tx.rawData) : tx.rawData) : {
              id: tx.id,
              identifier: tx.identifier,
              date: tx.date,
              processedDate: tx.processedDate,
              originalAmount: tx.originalAmount,
              originalCurrency: tx.originalCurrency,
              chargedAmount: tx.chargedAmount,
              description: tx.description,
              memo: tx.memo,
              category: tx.category,
              status: tx.status,
              type: tx.type,
              installments: tx.installments
            }, null, 2);

            const handleCopyJson = () => {
              navigator.clipboard.writeText(rawJsonString);
              setCopiedRaw(true);
              setTimeout(() => setCopiedRaw(false), 2000);
            };

            const scraperFields = [
              { label: 'מזהה תנועה (Identifier)', value: tx.identifier || rawObj.identifier || tx.id, icon: <Hash className="w-3.5 h-3.5 text-brand-primary" /> },
              { label: 'סטטוס תנועה (Status)', value: tx.status || rawObj.status || 'completed', badge: tx.status === 'pending' ? 'bg-amber-500/20 text-amber-500' : 'bg-emerald-500/20 text-emerald-500' },
              { label: 'סוג תנועה (Type)', value: tx.type || rawObj.type || (parseFloat(tx.amount) < 0 ? 'expense' : 'income') },
              { label: 'סכום מקורי (Original Amount)', value: rawObj.originalAmount != null ? `${rawObj.originalAmount} ${rawObj.originalCurrency || tx.originalCurrency || 'ILS'}` : (tx.originalAmount ? `${tx.originalAmount} ${tx.originalCurrency || 'ILS'}` : 'לא צוין') },
              { label: 'סכום חיוב (Charged Amount)', value: rawObj.chargedAmount != null ? `${rawObj.chargedAmount} ILS` : (tx.chargedAmount ? `${tx.chargedAmount} ILS` : formatILS(tx.amount)) },
              { label: 'תאריך עסקה (Tx Date)', value: formatDate(tx.date, lang) },
              { label: 'תאריך עיבוד/חיוב (Processed Date)', value: tx.processedDate || rawObj.processedDate ? formatDate(tx.processedDate || rawObj.processedDate, lang) : 'לא זמין' },
              { label: 'תיאור מקורי מלא (Original Description)', value: tx.description || rawObj.description || 'ללא תיאור' },
              { label: 'הערות ספק (Memo)', value: tx.memo || rawObj.memo || 'אין' },
              { label: 'סיווג ראשוני מהסקריפר (Scraper Category)', value: rawObj.category || 'לא סווג ע״י המקור' },
              { 
                label: 'תשלומי קרדיט/תשלומים (Installments)', 
                value: rawObj.installments 
                  ? `תשלום ${rawObj.installments.number || 1} מתוך ${rawObj.installments.total || 1}` 
                  : (tx.installments ? JSON.stringify(tx.installments) : 'תשלום רגיל (תשלום יחיד)') 
              },
              { label: 'חשבון / כרטיס מקור', value: `${tx.accountDisplayName || tx.bankCompany || ''} (${tx.accountNumber || 'ראשי'})` }
            ];

            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-brand-primary" />
                    <span>כל המידע הגולמי שנשלף מסקריפר הבנק/האשראי</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyJson}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-xs font-medium hover:border-brand-primary transition-colors text-dark-text light:text-light-text"
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
          currentTx={tx}
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
