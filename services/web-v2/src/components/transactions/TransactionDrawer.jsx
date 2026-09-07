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
  Tag
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatILS, formatDate } from '@/lib/formatters';
import { useApp } from '@/lib/app-context';

export default function TransactionDrawer({ tx, onClose, onUpdate }) {
  const { lang, t } = useApp();
  const [activeTab, setActiveTab] = useState('details'); // details, splits, links, notes
  const [category, setCategory] = useState(tx?.category || '');
  const [userDesc, setUserDesc] = useState(tx?.userDescription || '');
  const [isIgnored, setIsIgnored] = useState(tx?.isIgnored || false);
  const [savingTx, setSavingTx] = useState(false);

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
  const [linkCandidateId, setLinkCandidateId] = useState('');

  useEffect(() => {
    if (!tx) return;

    setCategory(tx.category || '');
    setUserDesc(tx.userDescription || '');
    setIsIgnored(tx.isIgnored || false);

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

  if (!tx) return null;

  const parentAmount = Math.abs(parseFloat(tx.amount));
  const splitsTotal = splits.reduce((acc, s) => acc + (parseFloat(s.amount) || 0), 0);
  const splitsBalanced = Math.abs(parentAmount - splitsTotal) <= 0.01;

  const handleSaveDetails = async () => {
    setSavingTx(true);
    try {
      const res = await api.updateTransaction(tx.id, {
        category,
        userDescription: userDesc,
        isIgnored,
      });
      if (res.data) {
        onUpdate?.({ ...tx, category, userDescription: userDesc, isIgnored });
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
    if (!splitsBalanced) {
      setSplitError(lang === 'he' ? 'סכום הפיצולים חייב להיות שווה במדויק לסכום התנועה המקורית' : 'Total splits must strictly equal the original transaction amount');
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

  const handleLinkTransaction = async (e) => {
    e.preventDefault();
    if (!linkCandidateId.trim()) return;
    const res = await api.linkTransaction(tx.id, {
      targetTransactionId: linkCandidateId.trim(),
      linkType: 'refund',
    });
    if (res.data) {
      const updated = await api.getLinks(tx.id);
      if (updated.data) setLinks(updated.data.data || []);
      setLinkCandidateId('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-lg bg-dark-surface light:bg-light-surface h-full border-l border-dark-border light:border-light-border shadow-2xl flex flex-col justify-between overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-dark-border light:border-light-border flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-brand-primary/15 text-brand-primary">
              {tx.bankCompany?.toUpperCase()}
            </span>
            <div className="text-lg font-bold mt-1 truncate max-w-sm">
              {userDesc || tx.merchantName || tx.description}
            </div>
            <div className="text-xs text-dark-text-muted light:text-light-text-muted">
              {formatDate(tx.date, lang)} • {formatILS(tx.amount, { showSign: true })}
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
        <div className="flex border-b border-dark-border light:border-light-border px-4 gap-2 text-xs font-medium">
          <button
            onClick={() => setActiveTab('details')}
            className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'details'
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-dark-text-muted light:text-light-text-muted hover:text-dark-text'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>{lang === 'he' ? 'פרטים' : 'Details'}</span>
          </button>

          <button
            onClick={() => setActiveTab('splits')}
            className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'splits'
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-dark-text-muted light:text-light-text-muted hover:text-dark-text'
            }`}
          >
            <Split className="w-4 h-4" />
            <span>{t('splitTransaction')} ({splits.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('links')}
            className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'links'
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-dark-text-muted light:text-light-text-muted hover:text-dark-text'
            }`}
          >
            <Link2 className="w-4 h-4" />
            <span>{t('linkTransaction')} ({links.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('notes')}
            className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'notes'
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-dark-text-muted light:text-light-text-muted hover:text-dark-text'
            }`}
          >
            <span>💬</span>
            <span>{t('notes')} ({notes.length})</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 p-5 overflow-y-auto space-y-5">
          {/* 1. Details Tab */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              {/* Category Picker */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
                  {t('category')}
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-sm focus:outline-none focus:border-brand-primary"
                >
                  <option value="">{lang === 'he' ? 'בחר קטגוריה...' : 'Select category...'}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name} {c.nameEn ? `(${c.nameEn})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* User Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
                  {t('userDescription')}
                </label>
                <input
                  type="text"
                  value={userDesc}
                  onChange={(e) => setUserDesc(e.target.value)}
                  placeholder={tx.merchantName || tx.description}
                  className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-sm focus:outline-none focus:border-brand-primary"
                />
              </div>

              {/* Ignore Checkbox */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="ignore-tx"
                  checked={isIgnored}
                  onChange={(e) => setIsIgnored(e.target.checked)}
                  className="w-4 h-4 rounded text-brand-primary focus:ring-brand-primary"
                />
                <label htmlFor="ignore-tx" className="text-xs font-medium cursor-pointer">
                  {lang === 'he' ? 'התעלם מתנועה זו בחישובי דשבורד ותקציבים' : 'Ignore this transaction in dashboard calculations'}
                </label>
              </div>

              <button
                onClick={handleSaveDetails}
                disabled={savingTx}
                className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-primary text-white font-medium text-sm hover:bg-brand-primary-hover transition-all"
              >
                <Save className="w-4 h-4" />
                <span>{savingTx ? (lang === 'he' ? 'שומר...' : 'Saving...') : t('save')}</span>
              </button>
            </div>
          )}

          {/* 2. Splits Tab */}
          {activeTab === 'splits' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-xs space-y-1">
                <div className="flex justify-between font-semibold">
                  <span>{lang === 'he' ? 'סכום מקורי:' : 'Original Amount:'}</span>
                  <span>{formatILS(parentAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{lang === 'he' ? 'סכום פיצולים נוכחי:' : 'Current Splits Sum:'}</span>
                  <span className={splitsBalanced ? 'text-brand-income font-bold' : 'text-brand-expense font-bold'}>
                    {formatILS(splitsTotal)}
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
                  <div key={idx} className="p-3 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated/40 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        value={s.amount || ''}
                        onChange={(e) => handleSplitChange(idx, 'amount', e.target.value)}
                        placeholder="סכום (₪)"
                        className="w-28 p-2 rounded-lg border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-xs"
                      />
                      <select
                        value={s.category}
                        onChange={(e) => handleSplitChange(idx, 'category', e.target.value)}
                        className="flex-1 p-2 rounded-lg border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-xs"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleRemoveSplitRow(idx)}
                        className="p-2 text-brand-expense hover:bg-dark-surface-elevated rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={s.description || ''}
                      onChange={(e) => handleSplitChange(idx, 'description', e.target.value)}
                      placeholder={lang === 'he' ? 'תיאור לפיצול (אופציונלי)...' : 'Split note (optional)...'}
                      className="w-full p-2 rounded-lg border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-xs"
                    />
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleAddSplitRow}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dark-border light:border-light-border hover:border-brand-primary text-xs font-semibold"
                >
                  <Plus className="w-4 h-4" />
                  <span>{lang === 'he' ? 'הוסף שורת פיצול' : 'Add Split Row'}</span>
                </button>
                <button
                  onClick={handleSaveSplits}
                  disabled={savingSplits || splits.length === 0}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-white text-xs font-semibold ${
                    splitsBalanced ? 'bg-brand-primary hover:bg-brand-primary-hover' : 'bg-gray-600 opacity-60 cursor-not-allowed'
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
              <form onSubmit={handleLinkTransaction} className="flex gap-2">
                <input
                  type="text"
                  placeholder="UUID תנועה לקישור (זיכוי/חיוב מקביל)"
                  value={linkCandidateId}
                  onChange={(e) => setLinkCandidateId(e.target.value)}
                  className="flex-1 p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated text-xs focus:outline-none focus:border-brand-primary"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-semibold"
                >
                  קשר
                </button>
              </form>

              <div className="space-y-2">
                {links.length === 0 ? (
                  <div className="text-center py-8 text-xs text-dark-text-muted light:text-light-text-muted">
                    אין תנועות מקושרות לתנועה זו
                  </div>
                ) : (
                  links.map((lnk) => (
                    <div key={lnk.linkId} className="p-3 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold">{lnk.description}</div>
                        <div className="text-dark-text-muted">{formatDate(lnk.date, lang)} • {formatILS(lnk.amount)}</div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-brand-cyan/20 text-brand-cyan text-[10px]">
                        {lnk.linkType}
                      </span>
                    </div>
                  ))
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
                  className="flex-1 p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated text-xs focus:outline-none focus:border-brand-primary"
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
                    <div key={n.id} className="p-3 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated flex items-center justify-between text-xs">
                      <span>{n.note}</span>
                      <button
                        onClick={() => handleDeleteNote(n.id)}
                        className="text-brand-expense p-1 hover:bg-dark-surface rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
