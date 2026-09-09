'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Landmark, 
  Plus, 
  RefreshCw, 
  Trash2, 
  Lock, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  ShieldCheck, 
  Edit2, 
  Calendar, 
  ArrowLeftRight,
  ExternalLink,
  CreditCard,
  Wallet,
  Banknote,
  Coins,
  Copy,
  Search,
  Zap,
  PiggyBank,
  Utensils
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatILS, formatDate, formatRelativeTime } from '@/lib/formatters';
import { ISRAELI_INSTITUTIONS, getInstitutionById, INSTITUTION_CATEGORIES } from '@/lib/institutions';
import InstitutionLogo from '@/components/common/InstitutionLogo';
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
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [credentials, setCredentials] = useState({});
  const [displayName, setDisplayName] = useState('');
  const [billingDay, setBillingDay] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState('');
  const [formError, setFormError] = useState('');
  const [errorDetails, setErrorDetails] = useState(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticsRunning, setDiagnosticsRunning] = useState(false);
  const [diagnosticsResult, setDiagnosticsResult] = useState(null);
  const [copiedReport, setCopiedReport] = useState(false);

  // Edit Account Flow
  const [editingAccount, setEditingAccount] = useState(null);
  const [editName, setEditName] = useState('');
  const [editBillingDay, setEditBillingDay] = useState(10);
  const [editBalance, setEditBalance] = useState(0);
  const [savingEdit, setSavingEdit] = useState(false);

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
        console.warn('הפעלת הסריקה ברקע:', triggerRes.error);
        setSyncingId(null);
        return;
      }

      const targetAccount = accounts.find((a) => a.id === id);
      const initialScrapedAt = targetAccount?.lastScrapedAt || null;

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
    setSelectedCategory('all');
    setSearchQuery('');
    setCredentials({});
    setDisplayName('');
    setBillingDay(10);
    setFormError('');
    setErrorDetails(null);
    setShowDiagnostics(false);
    setDiagnosticsResult(null);
    setCopiedReport(false);
    setStep(1);
    setModalOpen(true);
  };

  const handleSelectInstitution = (inst) => {
    setSelectedInst(inst);
    setFormError('');
    setErrorDetails(null);
    setStep(2);
  };

  const handleCredentialChange = (field, value) => {
    setCredentials((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmitAccount = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    setErrorDetails(null);
    setSubmitStage('validating');

    const stageTimer1 = setTimeout(() => setSubmitStage('encrypting'), 350);
    const stageTimer2 = setTimeout(() => setSubmitStage('saving'), 850);

    try {
      const res = await api.createAccount({
        bankCompany: selectedInst.id,
        displayName: displayName.trim() || undefined,
        billingDay: parseInt(billingDay, 10) || 10,
        credentials,
      });

      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);

      if (res.error) {
        setFormError(res.error);
        setErrorDetails(
          res.diagnostic || {
            error: res.error,
            status: res.status,
            stage: res.stage || 'ACCOUNT_CREATION_FAILED',
            details: res.details || null,
          }
        );
      } else {
        setStep(3);
        loadAccounts();
        if (res.data?.id && selectedInst?.id !== 'wallet') {
          handleSyncAccount(res.data.id);
        }
      }
    } catch (err) {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      setFormError(err.message || 'שגיאה בלתי צפויה בחיבור החשבון');
      setErrorDetails({
        stage: 'CLIENT_EXCEPTION',
        error: err.message,
        stack: err.stack,
      });
    } finally {
      setSubmitting(false);
      setSubmitStage('');
    }
  };

  const handleRunDiagnostics = async () => {
    setDiagnosticsRunning(true);
    setDiagnosticsResult(null);
    try {
      const res = await api.getAccountDiagnostics();
      setDiagnosticsResult(res.data || res.diagnostic || { error: res.error, status: res.status });
    } catch (err) {
      setDiagnosticsResult({ error: err.message });
    } finally {
      setDiagnosticsRunning(false);
    }
  };

  const handleCopyReport = () => {
    const reportText = JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        institution: selectedInst?.id,
        error: formError,
        diagnostic: errorDetails,
        liveDiagnostics: diagnosticsResult,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      },
      null,
      2
    );
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(reportText);
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 3000);
    }
  };

  const handleOpenEdit = (acc) => {
    setEditingAccount(acc);
    setEditName(acc.displayName || '');
    setEditBillingDay(acc.billingDay || 10);
    setEditBalance(acc.balance !== undefined ? acc.balance : 0);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingAccount) return;
    setSavingEdit(true);
    try {
      const isWallet = editingAccount.bankCompany === 'wallet' || editingAccount.accountType === 'wallet';
      const payload = {
        displayName: editName.trim() || undefined,
      };
      if (isWallet) {
        payload.balance = parseFloat(editBalance) || 0;
      } else {
        payload.billingDay = parseInt(editBillingDay, 10) || 10;
      }

      await api.updateAccount(editingAccount.id, payload);
      setEditingAccount(null);
      await loadAccounts();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">
            {t('accounts')}
          </h1>
          <p className="text-xs text-dark-text-muted light:text-light-text-muted">
            {lang === 'he' ? 'כל המוסדות והכרטיסים שלך במקום אחד, מעודכנים בזמן אמת' : 'All your banking and credit accounts, tracked in real-time'}
          </p>
        </div>

        <button
          onClick={handleOpenModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-primary text-white font-semibold text-xs shadow-md shadow-brand-primary/25 hover:bg-brand-primary-hover transition-all shrink-0"
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {accounts.map((acc) => {
            const inst = getInstitutionById(acc.bankCompany);
            const isSyncing = syncingId === acc.id;
            const isWallet = acc.bankCompany === 'wallet' || acc.accountType === 'wallet';
            const isCredit = !isWallet && (acc.accountType === 'credit' || inst.type === 'credit');
            const isRefund = isCredit && (acc.upcomingCharge ?? acc.balance ?? 0) < 0;

            return (
              <div
                key={acc.id}
                className="group relative rounded-2xl border border-dark-border/80 light:border-light-border/80 bg-dark-surface light:bg-light-surface p-5 shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col justify-between overflow-hidden"
              >
                {/* Background decorative glow on card hover */}
                <div 
                  className="absolute -top-12 -left-12 w-32 h-32 rounded-full blur-2xl opacity-15 transition-opacity group-hover:opacity-30 pointer-events-none"
                  style={{ backgroundColor: isWallet ? '#10b981' : inst.color || '#3b82f6' }}
                />

                <div className="space-y-4 relative z-10">
                  {/* Top Row: Institution Logo + Status + Edit Action */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <InstitutionLogo bankCompany={acc.bankCompany} size={42} />
                      <div>
                        <div className="text-xs font-bold" style={{ color: isWallet ? '#10b981' : inst.color }}>
                          {isWallet ? 'ארנק מזומנים' : inst.name}
                        </div>
                        {!isWallet && (
                          <div className="text-[11px] text-dark-text-muted light:text-light-text-muted flex items-center gap-1 font-mono">
                            <span>••••</span>
                            <span>{acc.accountNumber || '0000'}</span>
                          </div>
                        )}
                        {isWallet && (
                          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                            מזומן פיזי
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenEdit(acc)}
                        className="p-1.5 rounded-lg text-dark-text-muted hover:text-dark-text hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated transition-colors"
                        title={isWallet ? 'עדכן יתרת מזומן ושם' : 'ערוך שם ומועד חיוב'}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {isWallet ? (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md font-medium">
                          <Wallet className="w-3 h-3" />
                          <span>מקומי</span>
                        </span>
                      ) : acc.lastScrapeError ? (
                        <span className="flex items-center gap-1 text-[11px] text-brand-expense bg-brand-expense/10 px-2 py-0.5 rounded-md font-medium" title={acc.lastScrapeError}>
                          <AlertTriangle className="w-3 h-3" />
                          <span>{t('error')}</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] text-brand-income bg-brand-income/10 px-2 py-0.5 rounded-md font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{t('active')}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Display Name & Billing Cycle Badge */}
                  <div>
                    <h3 className="font-bold text-lg text-dark-text light:text-light-text tracking-tight truncate">
                      {acc.displayName || (isWallet ? 'ארנק מזומנים' : inst.name)}
                    </h3>
                    {isCredit && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[11px] px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 dark:text-indigo-300 font-medium flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>חיוב בכל {acc.billingDay || 10} לחודש</span>
                        </span>
                      </div>
                    )}
                    {isWallet && (
                      <p className="text-[11px] text-dark-text-muted mt-1">
                        משיכות מזומן שיפוצלו לארנק יתווספו אוטומטית ליתרה זו.
                      </p>
                    )}
                  </div>

                  {/* Primary Amount / Balance Box */}
                  <div className="p-3 rounded-xl bg-dark-surface-elevated/70 light:bg-light-surface-elevated/70 border border-dark-border/50 light:border-light-border/50 space-y-1">
                    <div className="text-[11px] font-medium text-dark-text-muted light:text-light-text-muted flex items-center justify-between">
                      <span>
                        {isWallet 
                          ? 'יתרת מזומנים נוכחית'
                          : isCredit 
                          ? (isRefund ? 'זיכוי צפוי במחזור הקרוב' : 'חיוב צפוי במחזור הקרוב')
                          : (lang === 'he' ? 'יתרה בעו״ש' : 'Current Balance')}
                      </span>
                      {isCredit && acc.nextBillingDate && (
                        <span className="text-[10px] font-medium text-dark-text-muted font-mono">
                          {formatDate(acc.nextBillingDate)}
                        </span>
                      )}
                      {isRefund && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-500">
                          זיכוי
                        </span>
                      )}
                    </div>

                    <div 
                      className={`text-2xl md:text-3xl font-bold tracking-tight ${
                        isWallet
                          ? 'text-emerald-500 dark:text-emerald-400'
                          : isRefund 
                          ? 'text-emerald-500 dark:text-emerald-400' 
                          : isCredit 
                          ? 'text-brand-amber' 
                          : (acc.balance < 0 ? 'text-rose-500' : 'text-emerald-500')
                      }`}
                      dir="ltr"
                    >
                      {formatILS(
                        isCredit ? (acc.upcomingCharge ?? acc.balance) : acc.balance, 
                        { showSign: isRefund || (!isCredit && !isWallet && acc.balance < 0) }
                      )}
                    </div>
                  </div>

                  {/* Credit Card Cycle Information */}
                  {isCredit && (
                    <div className="p-3 rounded-xl bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 border border-dark-border/40 light:border-light-border/40 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-dark-text-muted text-[11px]">
                          סך שיצא במחזור הנוכחי:
                        </span>
                        <span className="font-bold text-dark-text font-mono" dir="ltr">
                          {formatILS(acc.periodSpend ?? acc.balance ?? 0)}
                        </span>
                      </div>

                      {acc.nextBillingDate && (
                        <div className="flex items-center justify-between text-xs pt-1 border-t border-dark-border/20 light:border-light-border/20">
                          <span className="text-dark-text-muted text-[11px]">
                            מועד החיוב הקרוב:
                          </span>
                          <span className="font-semibold text-dark-text font-mono">
                            {formatDate(acc.nextBillingDate)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {isSyncing && (
                    <div className="p-2.5 rounded-xl bg-brand-primary/10 border border-brand-primary/20 text-[11px] text-brand-primary flex items-center gap-2 animate-pulse">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                      <span>{lang === 'he' ? 'מסנכרן כרטיסים ועסקאות...' : 'Syncing cards & transactions...'}</span>
                    </div>
                  )}

                  {acc.lastScrapeError && !isSyncing && !isWallet && (
                    <div className="p-2.5 rounded-xl bg-brand-expense/10 border border-brand-expense/20 text-[11px] text-brand-expense flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <div className="space-y-0.5 overflow-hidden">
                        <div className="font-semibold">{lang === 'he' ? 'שגיאה בהתחברות:' : 'Connection Error:'}</div>
                        <div className="opacity-90 break-words line-clamp-2" title={acc.lastScrapeError}>{acc.lastScrapeError}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Actions Bar */}
                <div className="pt-4 mt-4 border-t border-dark-border/60 light:border-light-border/60 flex items-center justify-between text-xs relative z-10">
                  <Link
                    href={`/transactions?accountId=${acc.id}`}
                    className="text-xs font-semibold text-brand-primary hover:underline flex items-center gap-1"
                  >
                    <span>{isWallet ? 'תנועות מזומן' : 'תנועות החשבון'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>

                  <div className="flex items-center gap-1">
                    {isWallet ? (
                      <button
                        onClick={() => handleOpenEdit(acc)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 text-xs font-semibold transition-colors"
                        title="עדכן יתרה"
                      >
                        <Banknote className="w-3.5 h-3.5" />
                        <span>עדכן יתרה</span>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleSyncAccount(acc.id)}
                          disabled={isSyncing}
                          className="p-2 rounded-lg hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated text-dark-text-muted hover:text-dark-text transition-colors"
                          title={t('syncNow')}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-brand-primary' : ''}`} />
                        </button>
                        <button
                          onClick={() => handleDeleteAccount(acc.id)}
                          className="p-2 rounded-lg hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated text-brand-expense transition-colors"
                          title={t('delete')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Account / Card / Wallet Modal */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-dark-surface light:bg-light-surface rounded-2xl border border-dark-border light:border-light-border p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-dark-border light:border-light-border pb-3">
              <div className="flex items-center gap-2 font-bold text-base">
                <Edit2 className="w-4 h-4 text-brand-primary" />
                <span>
                  {editingAccount.bankCompany === 'wallet' || editingAccount.accountType === 'wallet'
                    ? 'עריכת ארנק מזומנים'
                    : 'עריכת כרטיס / חשבון'}
                </span>
              </div>
              <button
                onClick={() => setEditingAccount(null)}
                className="p-1 rounded-lg hover:bg-dark-surface-elevated text-dark-text-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-dark-text-muted">
                  {editingAccount.bankCompany === 'wallet' || editingAccount.accountType === 'wallet'
                    ? 'שם הארנק'
                    : 'שם / כינוי הכרטיס'}
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="לדוגמה: ארנק מזומנים אישי"
                  className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-sm focus:outline-none focus:border-brand-primary"
                />
              </div>

              {editingAccount.bankCompany === 'wallet' || editingAccount.accountType === 'wallet' ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-dark-text-muted">
                    יתרת מזומן נוכחית בארנק (₪)
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={editBalance}
                    onChange={(e) => setEditBalance(e.target.value)}
                    placeholder="0.00"
                    className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-sm font-mono focus:outline-none focus:border-brand-primary"
                  />
                  <p className="text-[11px] text-dark-text-muted">
                    סכום המזומנים הפיזי שבידך. פיצול משיכות מזומן לארנק יעלה יתרה זו אוטומטית.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-dark-text-muted">
                    מועד חיוב חודשי
                  </label>
                  <select
                    value={editBillingDay}
                    onChange={(e) => setEditBillingDay(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-sm focus:outline-none focus:border-brand-primary cursor-pointer"
                  >
                    <option value="1">1 לחודש (תחילת חודש קלנדרי)</option>
                    <option value="2">2 לחודש</option>
                    <option value="10">10 לחודש (נפוץ באשראי)</option>
                    <option value="15">15 לחודש</option>
                    <option value="20">20 לחודש</option>
                    <option value="25">25 לחודש</option>
                  </select>
                  <p className="text-[11px] text-dark-text-muted">
                    החיוב החודשי יחושב עבור כל התנועות השייכות למחזור חיוב זה.
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingAccount(null)}
                  className="px-4 py-2.5 rounded-xl border border-dark-border light:border-light-border text-xs font-semibold"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="flex-1 py-2.5 rounded-xl bg-brand-primary text-white font-semibold text-xs hover:bg-brand-primary-hover shadow-md shadow-brand-primary/20"
                >
                  {savingEdit ? 'שומר שינויים...' : 'שמור עדכון'}
                </button>
              </div>
            </form>
          </div>
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
            {step === 1 && (() => {
              const filteredInstitutions = ISRAELI_INSTITUTIONS.filter((inst) => {
                if (selectedCategory !== 'all' && inst.category !== selectedCategory) return false;
                if (searchQuery.trim()) {
                  const q = searchQuery.toLowerCase();
                  const matchName = inst.name.toLowerCase().includes(q);
                  const matchNameEn = inst.nameEn?.toLowerCase().includes(q);
                  const matchDesc = inst.description?.toLowerCase().includes(q);
                  return matchName || matchNameEn || matchDesc;
                }
                return true;
              });

              return (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-bold text-base text-dark-text light:text-light-text mb-0.5">
                      {lang === 'he' ? 'בחר מוסד פיננסי לחיבור' : 'Choose Financial Institution'}
                    </h3>
                    <p className="text-xs text-dark-text-muted light:text-light-text-muted">
                      {lang === 'he' 
                        ? 'בנקים, כרטיסי אשראי, כרטיסי הסעדה וקופות גמל ופנסיה בישראל' 
                        : 'Israeli banks, credit cards, food cards, and provident funds'}
                    </p>
                  </div>

                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-dark-text-muted pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={lang === 'he' ? 'חיפוש מוסד, בנק, כרטיס או קופה...' : 'Search bank, card, or institution...'}
                      className="w-full ps-9 pe-8 py-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-xs text-dark-text light:text-light-text placeholder:text-dark-text-muted focus:outline-none focus:border-brand-primary"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute end-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-dark-text-muted hover:text-dark-text"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Category Filter Tabs */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    {INSTITUTION_CATEGORIES.map((cat) => {
                      const isActive = selectedCategory === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSelectedCategory(cat.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                            isActive
                              ? 'bg-brand-primary text-white shadow-sm'
                              : 'bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text-muted light:text-light-text-muted hover:text-dark-text hover:bg-dark-border/40'
                          }`}
                        >
                          {cat.id === 'all' && <Landmark className="w-3.5 h-3.5" />}
                          {cat.id === 'bank' && <Landmark className="w-3.5 h-3.5" />}
                          {cat.id === 'credit' && <CreditCard className="w-3.5 h-3.5" />}
                          {cat.id === 'food_perks' && <Utensils className="w-3.5 h-3.5" />}
                          {cat.id === 'savings' && <PiggyBank className="w-3.5 h-3.5" />}
                          {cat.id === 'wallet' && <Wallet className="w-3.5 h-3.5" />}
                          <span>{lang === 'he' ? cat.label : cat.labelEn}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Institutions Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[380px] overflow-y-auto pe-1">
                    {filteredInstitutions.map((inst) => (
                      <button
                        key={inst.id}
                        onClick={() => handleSelectInstitution(inst)}
                        className="p-3 rounded-2xl border border-dark-border/80 light:border-light-border/80 hover:border-brand-primary hover:shadow-md bg-dark-surface-elevated light:bg-light-surface-elevated text-center space-y-1.5 transition-all group flex flex-col items-center justify-between min-h-[110px]"
                      >
                        <div className="flex flex-col items-center gap-1.5 w-full pt-1">
                          <InstitutionLogo bankCompany={inst.id} size={38} />
                          <div className="font-bold text-xs group-hover:text-brand-primary transition-colors text-center truncate w-full">
                            {lang === 'he' ? inst.name : inst.nameEn}
                          </div>
                          {inst.description && (
                            <p className="text-[10px] text-dark-text-muted line-clamp-1 text-center w-full px-1">
                              {inst.description}
                            </p>
                          )}
                        </div>
                        
                        <div className="pt-1 w-full flex justify-center">
                          {inst.isScrapable ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                              <Zap className="w-2.5 h-2.5" />
                              <span>{lang === 'he' ? 'סנכרון אוטומטי' : 'Auto Sync'}</span>
                            </span>
                          ) : inst.id === 'wallet' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                              <Wallet className="w-2.5 h-2.5" />
                              <span>{lang === 'he' ? 'מזומן פיזי' : 'Cash'}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-400 dark:text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                              <ShieldCheck className="w-2.5 h-2.5" />
                              <span>{lang === 'he' ? 'חיסכון והטבות' : 'Perks & Savings'}</span>
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                    {filteredInstitutions.length === 0 && (
                      <div className="col-span-full py-10 text-center text-xs text-dark-text-muted space-y-1">
                        <div>לא נמצאו מוסדות תואמים לחיפוש</div>
                        <button
                          type="button"
                          onClick={() => { setSelectedCategory('all'); setSearchQuery(''); }}
                          className="text-brand-primary underline text-xs"
                        >
                          נקה סינונים
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Step 2: Credentials Form */}
            {step === 2 && selectedInst && (
              <form onSubmit={handleSubmitAccount} className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated">
                  <InstitutionLogo bankCompany={selectedInst.id} size={36} />
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

                {/* Progress stage feedback during submission */}
                {submitting && (
                  <div className="p-3.5 rounded-xl border border-brand-primary/30 bg-brand-primary/10 space-y-2 animate-pulse">
                    <div className="flex items-center justify-between text-xs font-semibold text-brand-primary">
                      <span>
                        {submitStage === 'validating' && 'שלב 1/3: אימות נתונים והכנת הבקשה...'}
                        {submitStage === 'encrypting' && 'שלב 2/3: הצפנת פרטי גישה (AES-256-GCM)...'}
                        {submitStage === 'saving' && 'שלב 3/3: שמירת חשבון מוסדי במסד הנתונים...'}
                        {!submitStage && 'מעבד בקשה...'}
                      </span>
                      <RefreshCw className="w-4 h-4 animate-spin text-brand-primary" />
                    </div>
                    <div className="w-full h-1.5 bg-brand-primary/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-primary transition-all duration-300 rounded-full"
                        style={{
                          width:
                            submitStage === 'validating'
                              ? '30%'
                              : submitStage === 'encrypting'
                              ? '65%'
                              : '90%',
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Comprehensive Failure & Diagnostic Drawer */}
                {formError && (
                  <div className="p-3.5 rounded-xl bg-brand-expense/10 border border-brand-expense/30 space-y-2.5">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-brand-expense shrink-0 mt-0.5" />
                      <div className="flex-1 text-xs">
                        <div className="font-bold text-brand-expense mb-0.5">
                          {lang === 'he' ? 'שגיאה ביצירת החשבון' : 'Account Connection Failed'}
                        </div>
                        <div className="text-dark-text-secondary light:text-light-text-secondary font-medium">
                          {formError}
                        </div>
                        {errorDetails?.stage && (
                          <div className="mt-1.5 inline-block px-2 py-0.5 rounded bg-brand-expense/20 text-brand-expense font-mono text-[11px]">
                            שלב כשל: {errorDetails.stage}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Diagnostic Actions */}
                    <div className="pt-2 border-t border-brand-expense/20 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setShowDiagnostics(!showDiagnostics)}
                        className="text-[11px] font-semibold text-brand-expense hover:underline"
                      >
                        {showDiagnostics
                          ? '▲ הסתר פרטי אבחון טכניים'
                          : '▼ הצג פרטי אבחון טכניים (Telemetry)'}
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleCopyReport}
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-dark-surface light:bg-light-surface border border-dark-border light:border-light-border text-dark-text-muted hover:text-white transition-colors flex items-center gap-1"
                        >
                          {copiedReport ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-brand-income" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedReport ? 'דוח הועתק!' : 'העתק דוח'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleRunDiagnostics}
                          disabled={diagnosticsRunning}
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-dark-surface light:bg-light-surface border border-dark-border light:border-light-border text-dark-text-muted hover:text-white transition-colors flex items-center gap-1"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${
                              diagnosticsRunning ? 'animate-spin' : ''
                            }`}
                          />
                          <span>{diagnosticsRunning ? 'בודק...' : 'בדיקת מערכת'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Technical Diagnostic Details */}
                    {showDiagnostics && (
                      <div className="mt-2 p-3 rounded-lg bg-black/60 text-[11px] font-mono text-zinc-300 space-y-1.5 overflow-x-auto max-h-52 border border-white/10">
                        <div>
                          <strong>HTTP Status:</strong> {errorDetails?.status || 'N/A'}
                        </div>
                        <div>
                          <strong>Failing Stage:</strong> {errorDetails?.stage || 'Unknown'}
                        </div>
                        {errorDetails?.transitDurationMs !== undefined && (
                          <div>
                            <strong>Transit Duration:</strong> {errorDetails.transitDurationMs}ms
                          </div>
                        )}
                        {errorDetails?.sqlCode && (
                          <div>
                            <strong>SQL Code:</strong> {errorDetails.sqlCode} (Table: {errorDetails.sqlTable || 'N/A'})
                          </div>
                        )}
                        {errorDetails?.targetUrl && (
                          <div>
                            <strong>Target URL:</strong> {errorDetails.targetUrl}
                          </div>
                        )}
                        {errorDetails?.details && (
                          <div>
                            <strong>Details:</strong>{' '}
                            {typeof errorDetails.details === 'object'
                              ? JSON.stringify(errorDetails.details)
                              : String(errorDetails.details)}
                          </div>
                        )}
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[10px] text-zinc-400 hover:text-white">
                            Raw Diagnostic JSON
                          </summary>
                          <pre className="mt-1 text-[10px] text-zinc-400 whitespace-pre-wrap">
                            {JSON.stringify(errorDetails, null, 2)}
                          </pre>
                        </details>
                      </div>
                    )}

                    {/* Live Health Check Result */}
                    {diagnosticsResult && (
                      <div className="mt-2 p-3 rounded-lg bg-dark-surface light:bg-light-surface border border-dark-border light:border-light-border text-[11px] space-y-2">
                        <div className="font-bold text-xs flex items-center justify-between">
                          <span>דוח תקינות מערכת (Live Diagnostic):</span>
                          <span
                            className={
                              diagnosticsResult?.gatewayLayer?.overallStatus === 'ok'
                                ? 'text-brand-income font-bold'
                                : 'text-brand-expense font-bold'
                            }
                          >
                            {diagnosticsResult?.gatewayLayer?.overallStatus === 'ok'
                              ? '✓ כל המערכות תקינות'
                              : '⚠ שגיאה בתשתיות'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1 font-mono text-[10px] pt-1">
                          <div>
                            PostgreSQL:{' '}
                            <span
                              className={
                                diagnosticsResult?.gatewayLayer?.checks?.database?.status === 'ok'
                                  ? 'text-brand-income'
                                  : 'text-brand-expense'
                              }
                            >
                              {diagnosticsResult?.gatewayLayer?.checks?.database?.status || 'offline'}
                            </span>
                          </div>
                          <div>
                            AES Crypto Engine:{' '}
                            <span
                              className={
                                diagnosticsResult?.gatewayLayer?.checks?.cryptoEngine?.status === 'ok'
                                  ? 'text-brand-income'
                                  : 'text-brand-expense'
                              }
                            >
                              {diagnosticsResult?.gatewayLayer?.checks?.cryptoEngine?.status || 'fail'}
                            </span>
                          </div>
                          <div>
                            Default User:{' '}
                            <span
                              className={
                                diagnosticsResult?.gatewayLayer?.checks?.defaultUser?.status === 'ok'
                                  ? 'text-brand-income'
                                  : 'text-brand-expense'
                              }
                            >
                              {diagnosticsResult?.gatewayLayer?.checks?.defaultUser?.status || 'missing'}
                            </span>
                          </div>
                          <div>
                            Accounts Table:{' '}
                            <span
                              className={
                                diagnosticsResult?.gatewayLayer?.checks?.bankAccountsTable?.status === 'ok'
                                  ? 'text-brand-income'
                                  : 'text-brand-expense'
                              }
                            >
                              {diagnosticsResult?.gatewayLayer?.checks?.bankAccountsTable?.status || 'missing'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
                    {lang === 'he' ? 'כינוי לחשבון (אופציונלי)' : 'Account Nickname (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={selectedInst.name}
                    className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-sm focus:outline-none focus:border-brand-primary"
                  />
                </div>

                {selectedInst.type === 'credit' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
                      מועד חיוב חודשי בכרטיס
                    </label>
                    <select
                      value={billingDay}
                      onChange={(e) => setBillingDay(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-sm cursor-pointer focus:outline-none focus:border-brand-primary"
                    >
                      <option value="10">10 לחודש</option>
                      <option value="1">1 לחודש</option>
                      <option value="2">2 לחודש</option>
                      <option value="15">15 לחודש</option>
                      <option value="20">20 לחודש</option>
                    </select>
                  </div>
                )}

                {selectedInst.fields.map((fld) => (
                  <div key={fld} className="space-y-1.5">
                    <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
                      {selectedInst.labels[fld] || fld}
                    </label>
                    <input
                      type={fld.toLowerCase().includes('password') ? 'password' : 'text'}
                      required
                      value={credentials[fld] || ''}
                      onChange={(e) => handleCredentialChange(fld, e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-sm focus:outline-none focus:border-brand-primary"
                    />
                  </div>
                ))}

                {selectedInst.description && (
                  <div className="p-3 rounded-xl bg-dark-surface-elevated/80 border border-dark-border/60 text-[11px] text-dark-text-secondary light:text-light-text-secondary space-y-1">
                    <div className="font-semibold text-dark-text light:text-light-text flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-brand-primary" />
                      <span>{selectedInst.name}</span>
                    </div>
                    <div>{selectedInst.description}</div>
                  </div>
                )}

                {selectedInst.fields.length === 0 && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400">
                    מוסד זה אינו דורש פרטי התחברות. תוכל לעדכן יתרה ולנהל תנועות באופן ידני בכל שלב.
                  </div>
                )}

                <div className="p-3 rounded-xl bg-brand-primary/10 border border-brand-primary/20 text-[11px] text-dark-text-muted light:text-light-text-muted flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-brand-primary shrink-0" />
                  <span>
                    {lang === 'he' 
                      ? 'הפרטים מוצפנים ישירות באמצעות מפתח AES-256-GCM מאובטח ואינם נשמרים בטקסט פשוט.' 
                      : 'Credentials are encrypted via AES-256-GCM and never stored in plaintext.'}
                  </span>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="px-4 py-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text text-xs font-semibold hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated transition-colors"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-2.5 rounded-xl bg-brand-primary text-white font-semibold text-xs hover:bg-brand-primary-hover shadow-md shadow-brand-primary/20 transition-colors"
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
                    ? 'הפרטים נשמרו בצורה מוצפנת ומאובטחת. הסנכרון התחיל ברקע.' 
                    : 'Credentials securely stored. Scrape sync has started in background.'}
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
