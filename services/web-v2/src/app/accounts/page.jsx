'use client';

import React, { useState, useEffect } from 'react';
import { 
  Landmark, 
  Plus, 
  RefreshCw, 
  Trash2, 
  Lock, 
  CheckCircle2, 
  AlertTriangle,
  X,
  ShieldCheck
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatILS, formatRelativeTime } from '@/lib/formatters';
import { ISRAELI_INSTITUTIONS, getInstitutionById } from '@/lib/institutions';
import { useApp } from '@/lib/app-context';

export default function AccountsPage() {
  const { lang, t } = useApp();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState(null);

  // Add Account Flow
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState(1); // 1: choose institution, 2: credentials, 3: success
  const [selectedInst, setSelectedInst] = useState(null);
  const [credentials, setCredentials] = useState({});
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await api.getAccounts();
      if (res.data) setAccounts(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleSyncAccount = async (id) => {
    setSyncingId(id);
    try {
      const triggerRes = await api.triggerScrape(id);
      if (triggerRes.error) {
        alert(`שגיאה בהפעלת הסריקה: ${triggerRes.error}`);
        setSyncingId(null);
        return;
      }

      // Record current account state to detect when update completes
      const targetAccount = accounts.find((a) => a.id === id);
      const initialScrapedAt = targetAccount?.lastScrapedAt || null;

      // Poll status every 3 seconds for up to 90 seconds (30 attempts)
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        try {
          const res = await api.getAccounts();
          if (res.data) {
            setAccounts(res.data);
            const current = res.data.find((a) => a.id === id);
            if (
              current &&
              (
                (current.lastScrapedAt && current.lastScrapedAt !== initialScrapedAt) ||
                current.lastScrapeError ||
                attempts >= 30
              )
            ) {
              clearInterval(interval);
              setSyncingId(null);
            }
          }
        } catch (_) {}
      }, 3000);
    } catch (_) {
      setSyncingId(null);
    }
  };

  const handleDeleteAccount = async (id) => {
    if (!confirm(lang === 'he' ? 'האם להסיר חשבון זה?' : 'Are you sure you want to remove this account?')) return;
    await api.deleteAccount(id);
    setAccounts(accounts.filter((a) => a.id !== id));
  };

  const handleOpenModal = () => {
    setSelectedInst(null);
    setCredentials({});
    setDisplayName('');
    setFormError('');
    setStep(1);
    setModalOpen(true);
  };

  const handleSelectInstitution = (inst) => {
    setSelectedInst(inst);
    setStep(2);
  };

  const handleCredentialChange = (field, value) => {
    setCredentials((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmitAccount = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');

    try {
      const res = await api.createAccount({
        bankCompany: selectedInst.id,
        displayName: displayName.trim() || undefined,
        credentials,
      });

      if (res.error) {
        setFormError(res.error);
      } else {
        setStep(3);
        loadAccounts();
        if (res.data?.id) {
          handleSyncAccount(res.data.id);
        }
      }
    } catch (err) {
      setFormError(err.message || 'Failed to connect account');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">
            {t('accounts')}
          </h1>
          <p className="text-xs text-dark-text-muted light:text-light-text-muted">
            {lang === 'he' ? 'כל המוסדות והכרטיסים שלך במקום אחד, מוצפנים ומאובטחים' : 'All your banking and credit accounts, encrypted and secured'}
          </p>
        </div>

        <button
          onClick={handleOpenModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-primary text-white font-semibold text-xs shadow-md shadow-brand-primary/25 hover:bg-brand-primary-hover transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>{t('addAccount')}</span>
        </button>
      </div>

      {/* Accounts Grid */}
      {accounts.length === 0 && !loading ? (
        <div className="p-12 rounded-2xl border border-dashed border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-center space-y-3">
          <Landmark className="w-12 h-12 mx-auto text-dark-text-muted opacity-40" />
          <div className="font-semibold text-base">{t('noData')}</div>
          <p className="text-xs text-dark-text-muted max-w-sm mx-auto">
            {t('connectFirstAccount')}
          </p>
          <button
            onClick={handleOpenModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-primary text-white text-xs font-semibold"
          >
            <Plus className="w-4 h-4" />
            <span>{t('addAccount')}</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((acc) => {
            const inst = getInstitutionById(acc.bankCompany);
            const isSyncing = syncingId === acc.id;

            return (
              <div
                key={acc.id}
                className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4 hover:border-brand-primary/40 transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span
                      className="px-2.5 py-1 rounded-lg text-xs font-bold"
                      style={{ backgroundColor: inst.badgeBg, color: inst.color }}
                    >
                      {inst.name}
                    </span>

                    <div className="flex items-center gap-1.5 text-xs">
                      {acc.lastScrapeError ? (
                        <span className="flex items-center gap-1 text-brand-expense" title={acc.lastScrapeError}>
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>{t('error')}</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-brand-income">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t('active')}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-bold text-base truncate">
                      {acc.displayName || inst.name}
                    </h3>
                    <div className="text-xs text-dark-text-muted light:text-light-text-muted">
                      ••••{acc.accountNumber || '0000'}
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <div className="text-[11px] font-medium text-dark-text-muted light:text-light-text-muted">
                      {inst.type === 'credit'
                        ? (lang === 'he' ? 'חיוב חודשי צפוי' : 'Monthly Charge')
                        : (lang === 'he' ? 'יתרה בעו״ש' : 'Current Balance')}
                    </div>
                    <div className={`text-2xl font-bold tracking-tight ${inst.type === 'credit' ? 'text-brand-amber' : ''}`}>
                      {formatILS(acc.balance)}
                    </div>
                  </div>

                  {isSyncing && (
                    <div className="p-2.5 rounded-xl bg-brand-primary/10 border border-brand-primary/20 text-[11px] text-brand-primary flex items-center gap-2 animate-pulse">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                      <span>{lang === 'he' ? 'מתחבר למוסד ומסנכרן כרטיסים ועסקאות...' : 'Connecting to institution and syncing cards & transactions...'}</span>
                    </div>
                  )}

                  {acc.lastScrapeError && !isSyncing && (
                    <div className="p-2.5 rounded-xl bg-brand-expense/10 border border-brand-expense/20 text-[11px] text-brand-expense flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <div className="space-y-0.5 overflow-hidden">
                        <div className="font-semibold">{lang === 'he' ? 'שגיאה בהתחברות לבנק:' : 'Bank Connection Error:'}</div>
                        <div className="opacity-90 break-words line-clamp-2" title={acc.lastScrapeError}>{acc.lastScrapeError}</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-dark-border/60 light:border-light-border/60 flex items-center justify-between text-xs">
                  <span className="text-dark-text-muted light:text-light-text-muted">
                    {acc.lastScrapedAt ? formatRelativeTime(acc.lastScrapedAt, lang) : (lang === 'he' ? 'טרם סונכרן' : 'Never synced')}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleSyncAccount(acc.id)}
                      disabled={isSyncing}
                      className="p-2 rounded-lg hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated text-dark-text-muted hover:text-dark-text"
                      title={t('syncNow')}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-brand-primary' : ''}`} />
                    </button>
                    <button
                      onClick={() => handleDeleteAccount(acc.id)}
                      className="p-2 rounded-lg hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated text-brand-expense"
                      title={t('delete')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Account Modal (3 Steps) */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl bg-dark-surface light:bg-light-surface rounded-2xl border border-dark-border light:border-light-border p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-dark-border light:border-light-border pb-4">
              <div className="flex items-center gap-2 font-bold text-lg">
                <Landmark className="w-5 h-5 text-brand-primary" />
                <span>{t('addAccount')}</span>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg hover:bg-dark-surface-elevated text-dark-text-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step 1: Choose Institution */}
            {step === 1 && (
              <div className="space-y-4">
                <p className="text-xs text-dark-text-muted">
                  {lang === 'he' ? 'בחר בנק או חברת אשראי מרשימת המוסדות הנתמכים:' : 'Choose a bank or credit company from supported institutions:'}
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {ISRAELI_INSTITUTIONS.map((inst) => (
                    <button
                      key={inst.id}
                      onClick={() => handleSelectInstitution(inst)}
                      className="p-3 rounded-xl border border-dark-border light:border-light-border hover:border-brand-primary bg-dark-surface-elevated light:bg-light-surface-elevated text-center space-y-1.5 transition-all group"
                    >
                      <div
                        className="w-10 h-10 rounded-lg mx-auto flex items-center justify-center font-bold text-xs shadow-sm"
                        style={{ backgroundColor: inst.badgeBg, color: inst.color }}
                      >
                        {inst.logoText}
                      </div>
                      <div className="font-semibold text-xs group-hover:text-brand-primary truncate">
                        {lang === 'he' ? inst.name : inst.nameEn}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Credentials Form */}
            {step === 2 && selectedInst && (
              <form onSubmit={handleSubmitAccount} className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs"
                    style={{ backgroundColor: selectedInst.badgeBg, color: selectedInst.color }}
                  >
                    {selectedInst.logoText}
                  </div>
                  <div>
                    <div className="font-bold text-sm">{selectedInst.name}</div>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="text-[11px] text-brand-primary hover:underline"
                    >
                      {lang === 'he' ? '← שנה מוסד' : '← Change institution'}
                    </button>
                  </div>
                </div>

                {formError && (
                  <div className="p-3 rounded-xl bg-brand-expense-bg border border-brand-expense/20 text-brand-expense text-xs">
                    {formError}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-dark-text-muted">
                    {lang === 'he' ? 'כינוי לחשבון (אופציונלי)' : 'Account Nickname (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={selectedInst.name}
                    className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated text-sm"
                  />
                </div>

                {selectedInst.fields.map((fld) => (
                  <div key={fld} className="space-y-1.5">
                    <label className="text-xs font-semibold text-dark-text-muted">
                      {selectedInst.labels[fld] || fld}
                    </label>
                    <input
                      type={fld.toLowerCase().includes('password') ? 'password' : 'text'}
                      required
                      value={credentials[fld] || ''}
                      onChange={(e) => handleCredentialChange(fld, e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated text-sm"
                    />
                  </div>
                ))}

                <div className="p-3 rounded-xl bg-brand-primary/10 border border-brand-primary/20 text-[11px] text-dark-text-muted flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-brand-primary shrink-0" />
                  <span>
                    {lang === 'he' 
                      ? 'הפרטים מוצפנים ישירות באמצעות HashiCorp Vault Transit ואינם נשמרים בטקסט פשוט.' 
                      : 'Credentials are encrypted via HashiCorp Vault Transit and never stored in plaintext.'}
                  </span>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="px-4 py-2.5 rounded-xl border border-dark-border light:border-light-border text-xs font-semibold"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-2.5 rounded-xl bg-brand-primary text-white font-semibold text-xs hover:bg-brand-primary-hover shadow-md shadow-brand-primary/20"
                  >
                    {submitting ? (lang === 'he' ? 'מצפין ומחבר...' : 'Encrypting & Connecting...') : (lang === 'he' ? 'חבר חשבון מאובטח' : 'Connect Secure Account')}
                  </button>
                </div>
              </form>
            )}

            {/* Step 3: Success */}
            {step === 3 && (
              <div className="text-center py-6 space-y-4">
                <div className="w-16 h-16 rounded-full bg-brand-income/20 text-brand-income mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <h3 className="font-bold text-lg">
                  {lang === 'he' ? 'החשבון חובר בהצלחה!' : 'Account Connected Successfully!'}
                </h3>
                <p className="text-xs text-dark-text-muted max-w-sm mx-auto">
                  {lang === 'he' 
                    ? 'הפרטים נשמרו בצורה מוצפנת ב-Vault. הסנכרון יתחיל ברקע.' 
                    : 'Credentials securely stored in Vault. Scrape sync will start in background.'}
                </p>
                <button
                  onClick={() => setModalOpen(false)}
                  className="px-6 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-semibold"
                >
                  {lang === 'he' ? 'סגור וחזור' : 'Close & Done'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
