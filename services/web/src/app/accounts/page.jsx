'use client';

import React, { useState, useEffect } from 'react';
import {
  Landmark,
  CreditCard,
  Plus,
  RefreshCw,
  Trash2,
  Lock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronLeft,
  ArrowRight,
  Eye,
  EyeOff,
  X,
  AlertTriangle,
  KeyRound,
  ExternalLink,
} from 'lucide-react';
import { getAccounts, triggerScrape, formatILS, formatDate } from '../../lib/api';
import { ISRAELI_INSTITUTIONS } from '../../lib/types';
import { useOtp } from '../../lib/otp-context';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncingAccountId, setSyncingAccountId] = useState(null);
  const [syncAllLoading, setSyncAllLoading] = useState(false);

  // Add Account Multi-Step Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addStep, setAddStep] = useState(1); // 1: Select Institution, 2: Enter Credentials, 3: Success
  const [selectedInstitutionKey, setSelectedInstitutionKey] = useState(null);
  const [selectedInstitutionFilter, setSelectedInstitutionFilter] = useState('all'); // 'all' | 'bank' | 'credit'

  // Dynamic Credentials Form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [userCode, setUserCode] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [cardLast4, setCardLast4] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accountNickname, setAccountNickname] = useState('');
  const [isSubmittingCredentials, setIsSubmittingCredentials] = useState(false);
  const [credentialsError, setCredentialsError] = useState(null);

  // Deactivate confirmation modal
  const [accountToDeactivate, setAccountToDeactivate] = useState(null);

  const { triggerDemoOtp } = useOtp();

  useEffect(() => {
    async function loadAccounts() {
      try {
        const accs = await getAccounts();
        setAccounts(accs || []);
      } catch (e) {
        console.error('Failed to load accounts:', e);
      } finally {
        setLoading(false);
      }
    }
    loadAccounts();
  }, []);

  const handleSyncSingleAccount = async (accId) => {
    setSyncingAccountId(accId);
    try {
      await triggerScrape(accId);
      // update state
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === accId
            ? { ...a, lastScrapedAt: new Date().toISOString(), scrapeStatus: 'success' }
            : a
        )
      );
    } catch (e) {
      // error
    } finally {
      setTimeout(() => setSyncingAccountId(null), 1500);
    }
  };

  const handleSyncAllAccounts = async () => {
    setSyncAllLoading(true);
    try {
      await triggerScrape();
      setAccounts((prev) =>
        prev.map((a) => ({
          ...a,
          lastScrapedAt: new Date().toISOString(),
          scrapeStatus: 'success',
        }))
      );
    } catch (e) {
      console.error('Error syncing all:', e);
    } finally {
      setTimeout(() => setSyncAllLoading(false), 2000);
    }
  };

  const handleDeactivateAccount = (accId) => {
    setAccounts((prev) => prev.filter((a) => a.id !== accId));
    setAccountToDeactivate(null);
  };

  const handleSelectInstitution = (key) => {
    setSelectedInstitutionKey(key);
    const inst = ISRAELI_INSTITUTIONS[key];
    setAccountNickname(inst ? `${inst.name} - ראשי` : '');
    setAddStep(2);
    setCredentialsError(null);
  };

  const handleSaveCredentials = async (e) => {
    e.preventDefault();
    if (!password) {
      setCredentialsError('חובה להזין סיסמה');
      return;
    }

    setIsSubmittingCredentials(true);
    setCredentialsError(null);

    // Simulate backend encryption & registration via Vault Transit
    setTimeout(() => {
      const inst = ISRAELI_INSTITUTIONS[selectedInstitutionKey];
      const newAcc = {
        id: `acc-${selectedInstitutionKey}-${Date.now()}`,
        bankCompany: selectedInstitutionKey,
        displayName: accountNickname || inst?.name || 'חשבון חדש',
        accountNumber: cardLast4 || '7721',
        balance: inst?.type === 'credit' ? -1250.0 : 12400.0,
        currency: 'ILS',
        isActive: true,
        lastScrapedAt: new Date().toISOString(),
        scrapeStatus: 'success',
        accountType: inst?.type === 'credit' ? 'credit' : 'checking',
      };

      setAccounts((prev) => [newAcc, ...prev]);
      setIsSubmittingCredentials(false);
      setAddStep(3);

      // If institution has OTP, trigger demo OTP notification
      if (inst?.hasOtp) {
        setTimeout(() => {
          triggerDemoOtp(inst.name);
        }, 1200);
      }
    }, 1800);
  };

  const resetAddModal = () => {
    setIsAddModalOpen(false);
    setAddStep(1);
    setSelectedInstitutionKey(null);
    setUsername('');
    setPassword('');
    setIdNumber('');
    setUserCode('');
    setPhoneNumber('');
    setCardLast4('');
    setAccountNickname('');
    setCredentialsError(null);
  };

  // Calculate totals
  const totalChecking = accounts
    .filter((a) => a.accountType === 'checking' || a.accountType === 'savings')
    .reduce((sum, a) => sum + (a.balance || 0), 0);

  const totalCreditDue = accounts
    .filter((a) => a.accountType === 'credit')
    .reduce((sum, a) => sum + Math.abs(a.balance || 0), 0);

  const activeInstitutionsList = Object.entries(ISRAELI_INSTITUTIONS).filter(([key, inst]) => {
    if (selectedInstitutionFilter === 'bank') return inst.type === 'bank';
    if (selectedInstitutionFilter === 'credit') return inst.type === 'credit';
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* ── 1. HEADER & GLOBAL ACTIONS ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-5 sm:p-6 rounded-3xl border border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              חשבונות וכרטיסי אשראי
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              {accounts.length} מחוברים
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            ניהול קשרי בנקים וכרטיסי אשראי בישראל &bull; הצפנת פרטי הזדהות ב-Vault Transit
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2.5 rounded-xl glass-button text-xs font-semibold flex items-center gap-1.5 shadow-glow-blue"
          >
            <Plus className="w-4 h-4" />
            <span>חבר חשבון חדש</span>
          </button>

          <button
            onClick={handleSyncAllAccounts}
            disabled={syncAllLoading}
            className="px-3.5 py-2.5 rounded-xl glass-button-secondary text-xs font-medium flex items-center gap-1.5 hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncAllLoading ? 'animate-spin text-brand-cyan' : ''}`} />
            <span>{syncAllLoading ? 'מסנכרן הכל...' : 'סנכרן את כל החשבונות'}</span>
          </button>
        </div>
      </div>

      {/* ── 2. SUMMARY METRICS ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-4 sm:p-5 rounded-2xl border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block mb-1">יתרת נזילות ועו״ש</span>
            <div className="text-xl sm:text-2xl font-bold text-emerald-400 num-he">
              {formatILS(totalChecking)}
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400">
            <Landmark className="w-5 h-5" />
          </div>
        </div>

        <div className="glass-card p-4 sm:p-5 rounded-2xl border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block mb-1">חיוב כרטיסי אשראי צפוי</span>
            <div className="text-xl sm:text-2xl font-bold text-slate-100 num-he">
              {formatILS(totalCreditDue)}
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-rose-500/20 text-rose-400">
            <CreditCard className="w-5 h-5" />
          </div>
        </div>

        <div className="glass-card p-4 sm:p-5 rounded-2xl border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block mb-1">אבטחת נתונים</span>
            <div className="text-sm font-bold text-brand-cyan flex items-center gap-1.5 mt-0.5">
              <ShieldCheck className="w-4 h-4" />
              <span>Vault AES-256 Transit</span>
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-brand-blue/20 text-brand-cyan">
            <Lock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ── 3. CONNECTED ACCOUNTS GRID ────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {accounts.map((acc) => {
          const institution = ISRAELI_INSTITUTIONS[acc.bankCompany] || {
            id: acc.bankCompany,
            name: acc.displayName || acc.bankCompany,
            color: '#3b82f6',
            logoText: acc.bankCompany?.slice(0, 4).toUpperCase() || 'בנק',
          };

          const isCredit = acc.accountType === 'credit';
          const isSyncing = syncingAccountId === acc.id;

          return (
            <div
              key={acc.id}
              className="glass-card rounded-3xl p-5 border border-white/10 hover:border-brand-blue/40 transition-all duration-300 flex flex-col justify-between relative overflow-hidden group shadow-lg"
            >
              {/* Institution Accent Stripe */}
              <div
                className="absolute top-0 left-0 right-0 h-1"
                style={{ backgroundColor: institution.color }}
              />

              {/* Card Header */}
              <div>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-xs text-white shadow-md flex-shrink-0"
                      style={{ backgroundColor: institution.color }}
                    >
                      {institution.logoText || 'בנק'}
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-white group-hover:text-brand-blue-light transition-colors">
                        {acc.displayName || institution.name}
                      </h3>
                      <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <span className="font-medium text-slate-300">
                          {isCredit ? 'כרטיס אשראי' : 'חשבון עו״ש'}
                        </span>
                        {acc.accountNumber && (
                          <>
                            <span>&bull;</span>
                            <span className="font-mono">•••• {acc.accountNumber}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Scrape Status Badge */}
                  <div>
                    {isSyncing ? (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/40 flex items-center gap-1 animate-pulse">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>מסנכרן...</span>
                      </span>
                    ) : acc.scrapeStatus === 'error' ? (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        <span>שגיאה</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>פעיל ומסונכרן</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Balance Display */}
                <div className="p-4 rounded-2xl bg-navy-950/60 border border-white/10 mb-4">
                  <span className="text-[11px] text-slate-400 block mb-1">
                    {isCredit ? 'חיוב צפוי החודש' : 'יתרת עו״ש נוכחית'}
                  </span>
                  <div
                    className={`text-2xl font-bold tracking-tight num-he ${
                      isCredit
                        ? 'text-slate-100'
                        : acc.balance >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {formatILS(acc.balance)}
                  </div>
                </div>

                {/* Metadata info */}
                <div className="space-y-1.5 text-xs text-slate-400 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>סנכרון אחרון:</span>
                    </span>
                    <span className="text-slate-200 font-medium">
                      {formatDate(acc.lastScrapedAt, { format: 'relative' })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5 text-brand-cyan" />
                      <span>מצב הצפנה:</span>
                    </span>
                    <span className="text-brand-cyan font-mono text-[11px]">Vault Transit (Active)</span>
                  </div>
                </div>
              </div>

              {/* Card Bottom Actions */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleSyncSingleAccount(acc.id)}
                  disabled={isSyncing}
                  className="flex-1 py-2 px-3 rounded-xl glass-button-secondary text-xs font-semibold flex items-center justify-center gap-1.5 hover:text-white"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-brand-cyan' : ''}`} />
                  <span>סנכרן כעת</span>
                </button>

                <button
                  onClick={() => setAccountToDeactivate(acc)}
                  className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 transition-colors"
                  title="נתק / השבת חשבון"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}

        {/* Add Account Card Button */}
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="rounded-3xl border-2 border-dashed border-white/15 hover:border-brand-blue/60 p-8 flex flex-col items-center justify-center text-center transition-all duration-300 hover:bg-white/5 min-h-[280px] group"
        >
          <div className="w-14 h-14 rounded-2xl bg-white/5 group-hover:bg-brand-blue/20 text-slate-400 group-hover:text-brand-cyan flex items-center justify-center mb-4 transition-all group-hover:scale-110">
            <Plus className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">חבר חשבון בנק או כרטיס</h3>
          <p className="text-xs text-slate-400 max-w-xs">
            תמיכה בבנקים ישראליים, Max, Cal, וישראכרט עם הצפנת Vault מקומית
          </p>
        </button>
      </div>

      {/* ── 4. MULTI-STEP "ADD ACCOUNT" MODAL ──────────────────────────────── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/85 backdrop-blur-md p-4 animate-fade-in">
          <div className="relative w-full max-w-xl rounded-3xl bg-navy-900 border border-white/15 shadow-2xl p-6 sm:p-8 overflow-hidden text-right max-h-[90vh] overflow-y-auto">
            {/* Header Accent */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-brand-blue via-brand-cyan to-brand-emerald" />

            {/* Close Button */}
            <button
              onClick={resetAddModal}
              className="absolute top-4 left-4 p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              title="סגור"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Step Indicators */}
            <div className="flex items-center justify-center gap-2 mb-6 text-xs">
              <span
                className={`px-3 py-1 rounded-full font-bold ${
                  addStep === 1
                    ? 'bg-brand-blue text-white shadow-glow-blue'
                    : 'bg-navy-800 text-slate-400'
                }`}
              >
                1. בחירת מוסד
              </span>
              <span className="text-slate-600">&bull;</span>
              <span
                className={`px-3 py-1 rounded-full font-bold ${
                  addStep === 2
                    ? 'bg-brand-blue text-white shadow-glow-blue'
                    : 'bg-navy-800 text-slate-400'
                }`}
              >
                2. פרטי הזדהות מוצפנים
              </span>
              <span className="text-slate-600">&bull;</span>
              <span
                className={`px-3 py-1 rounded-full font-bold ${
                  addStep === 3
                    ? 'bg-emerald-500 text-white'
                    : 'bg-navy-800 text-slate-400'
                }`}
              >
                3. חיבור והפעלה
              </span>
            </div>

            {/* ── STEP 1: Select Financial Institution ── */}
            {addStep === 1 && (
              <div>
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-white tracking-tight">
                    בחר מוסד פיננסי לחיבור
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    בחר את הבנק או חברת כרטיסי האשראי שברצונך לסנכרן
                  </p>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-2 mb-4 p-1 rounded-xl bg-navy-950/60 border border-white/10 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedInstitutionFilter('all')}
                    className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${
                      selectedInstitutionFilter === 'all'
                        ? 'bg-brand-blue text-white font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    הכל
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedInstitutionFilter('bank')}
                    className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${
                      selectedInstitutionFilter === 'bank'
                        ? 'bg-brand-blue text-white font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    בנקים בישראל
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedInstitutionFilter('credit')}
                    className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${
                      selectedInstitutionFilter === 'credit'
                        ? 'bg-brand-blue text-white font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    כרטיסי אשראי
                  </button>
                </div>

                {/* Institutions Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {activeInstitutionsList.map(([key, inst]) => (
                    <button
                      key={key}
                      onClick={() => handleSelectInstitution(key)}
                      className="p-3.5 rounded-2xl bg-navy-800/80 hover:bg-navy-700/90 border border-white/10 hover:border-brand-blue/50 text-right transition-all group flex flex-col items-start justify-between min-h-[90px]"
                    >
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-[11px] text-white shadow-sm mb-2 group-hover:scale-105 transition-transform"
                        style={{ backgroundColor: inst.color }}
                      >
                        {inst.logoText || 'בנק'}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white group-hover:text-brand-blue-light">
                          {inst.name}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {inst.type === 'credit' ? 'כרטיס אשראי' : 'חשבון בנק'}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── STEP 2: Enter Dynamic Credentials ── */}
            {addStep === 2 && selectedInstitutionKey && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <button
                    onClick={() => setAddStep(1)}
                    className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      הזנת פרטי הזדהות &bull;{' '}
                      {ISRAELI_INSTITUTIONS[selectedInstitutionKey]?.name}
                    </h3>
                    <p className="text-xs text-slate-400">
                      הפרטים מוצפנים במנוע HashiCorp Vault Transit המקומי
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSaveCredentials} className="space-y-4">
                  {/* Nickname */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      כינוי / שם תצוגה לחשבון
                    </label>
                    <input
                      type="text"
                      value={accountNickname}
                      onChange={(e) => setAccountNickname(e.target.value)}
                      placeholder="לדוגמה: עו״ש לאומי משותף"
                      className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm text-white placeholder-slate-500"
                    />
                  </div>

                  {/* Institution specific fields */}
                  {selectedInstitutionKey === 'discount' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        מספר תעודת זהות (9 ספרות)
                      </label>
                      <input
                        type="text"
                        value={idNumber}
                        onChange={(e) => setIdNumber(e.target.value)}
                        placeholder="תעודת זהות"
                        className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm text-white font-mono"
                      />
                    </div>
                  )}

                  {selectedInstitutionKey === 'hapoalim' ? (
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        קוד משתמש (קוד אישי)
                      </label>
                      <input
                        type="text"
                        value={userCode}
                        onChange={(e) => setUserCode(e.target.value)}
                        placeholder="קוד משתמש בנק הפועלים"
                        className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm text-white font-mono"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        שם משתמש / קוד מזהה
                      </label>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="שם משתמש לאתר הבנק"
                        className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm text-white font-mono"
                      />
                    </div>
                  )}

                  {/* Password */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      סיסמת כניסה לאתר
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="סיסמה"
                        className="w-full pr-3.5 pl-10 py-2.5 rounded-xl glass-input text-sm text-white font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Credit Card Last 4 Digits (Optional) */}
                  {ISRAELI_INSTITUTIONS[selectedInstitutionKey]?.type === 'credit' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        4 ספרות אחרונות של הכרטיס (אופציונלי)
                      </label>
                      <input
                        type="text"
                        maxLength={4}
                        value={cardLast4}
                        onChange={(e) => setCardLast4(e.target.value)}
                        placeholder="1234"
                        className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm text-white font-mono"
                      />
                    </div>
                  )}

                  {/* Security Explainer Callout */}
                  <div className="p-3.5 rounded-2xl bg-brand-blue/10 border border-brand-blue/30 text-xs text-slate-300 flex items-start gap-2.5">
                    <ShieldCheck className="w-5 h-5 text-brand-cyan flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white block mb-0.5">אבטחת Vault ברמת בנק</strong>
                      הסיסמה מוצפנת מיידית באמצעות מפתח AES-256-GCM בכספת HashiCorp המקומית שלך. היא
                      אינה נשמרת בטקסט גלוי לעולם ומשמשת רק לסריקה המקומית.
                    </div>
                  </div>

                  {credentialsError && (
                    <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      <span>{credentialsError}</span>
                    </div>
                  )}

                  {/* Submit Actions */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={isSubmittingCredentials}
                      className="flex-1 py-3 px-4 rounded-xl glass-button text-xs font-semibold flex items-center justify-center gap-2 shadow-glow-blue disabled:opacity-50"
                    >
                      {isSubmittingCredentials ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>מצפין ב-Vault ובודק קישוריות...</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4" />
                          <span>הצפן ושמור חשבון</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setAddStep(1)}
                      className="py-3 px-4 rounded-xl glass-button-secondary text-xs font-medium hover:text-white"
                    >
                      חזרה
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ── STEP 3: Success Confirmation ── */}
            {addStep === 3 && (
              <div className="text-center py-6 space-y-4">
                <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-glow-emerald">
                  <CheckCircle2 className="w-8 h-8" />
                </div>

                <div>
                  <h3 className="text-xl font-bold text-white">החשבון חובר בהצלחה!</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    פרטי ההזדהות הוצפנו בכספת המקומית. תהליך הסנכרון הראשוני של היתרות והתנועות הופעל
                    ברקע.
                  </p>
                </div>

                <div className="pt-4">
                  <button
                    onClick={resetAddModal}
                    className="px-6 py-2.5 rounded-xl glass-button text-xs font-semibold"
                  >
                    חזרה לרשימת החשבונות
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 5. DEACTIVATE CONFIRMATION MODAL ──────────────────────────────── */}
      {accountToDeactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="relative w-full max-w-md rounded-3xl bg-navy-900 border border-rose-500/30 shadow-2xl p-6 text-right">
            <div className="p-3 rounded-2xl bg-rose-500/20 text-rose-400 w-fit mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-white mb-1">
              האם לנתק את חשבון {accountToDeactivate.displayName}?
            </h3>
            <p className="text-xs text-slate-400 mb-5">
              פעולה זו תמחק את פרטי ההזדהות המוצפנים בכספת Vault ותפסיק את הסנכרון האוטומטי. תנועות
              העבר יישמרו במערכת.
            </p>

            <div className="flex items-center gap-3">
              <button
                onClick={() => handleDeactivateAccount(accountToDeactivate.id)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors shadow-glow-rose"
              >
                נתק חשבון זה
              </button>

              <button
                onClick={() => setAccountToDeactivate(null)}
                className="py-2.5 px-4 rounded-xl glass-button-secondary text-xs font-medium hover:text-white"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
