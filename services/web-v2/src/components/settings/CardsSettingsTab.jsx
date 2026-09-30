'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  CreditCard,
  Wallet,
  Settings2,
  Check,
  Loader2,
  AlertCircle,
  Percent,
  Eye,
  EyeOff,
  FileText,
  DollarSign,
  TrendingDown,
  RefreshCw,
  Info,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import InstitutionLogo from '@/components/common/InstitutionLogo';
import { formatILS } from '@/lib/formatters';

export default function CardsSettingsTab() {
  const { lang } = useApp();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState({}); // { [accountId]: 'saving' | 'saved' | 'error' }
  const [expandedCards, setExpandedCards] = useState({}); // { [accountId]: boolean }

  // Global memo parsing settings
  const [globalMemoParsingEnabled, setGlobalMemoParsingEnabled] = useState(true);
  const [globalMemoParsingScope, setGlobalMemoParsingScope] = useState('pending_only');
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [globalSaved, setGlobalSaved] = useState(false);

  // Debounce timer refs for text/number inputs
  const debounceTimers = useRef({});

  const isRtl = lang === 'he';

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [accRes, sysRes] = await Promise.all([
        api.getAccounts(),
        api.getSystemSettings().catch(() => ({ data: { settings: {} } })),
      ]);

      if (accRes.data) {
        setAccounts(accRes.data);
        if (accRes.data.length > 0) {
          setExpandedCards({ [accRes.data[0].id]: true });
        }
      }

      const sysSettings = sysRes.data?.settings || {};
      if (sysSettings.globalMemoParsingEnabled !== undefined) {
        setGlobalMemoParsingEnabled(Boolean(sysSettings.globalMemoParsingEnabled));
      }
      if (sysSettings.globalMemoParsingScope) {
        setGlobalMemoParsingScope(sysSettings.globalMemoParsingScope);
      }
    } catch (err) {
      console.error('[CardsSettingsTab] Failed to load accounts or settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-save account field
  const autoSaveAccount = async (accountId, patchData) => {
    setSaveStatus((prev) => ({ ...prev, [accountId]: 'saving' }));
    try {
      const res = await api.updateAccount(accountId, patchData);
      if (res.data) {
        setAccounts((prev) =>
          prev.map((acc) => {
            if (acc.id === accountId) {
              return {
                ...acc,
                ...res.data,
                ...(patchData.balance !== undefined ? { balance: patchData.balance } : {}),
              };
            }
            return acc;
          })
        );
      }
      setSaveStatus((prev) => ({ ...prev, [accountId]: 'saved' }));
      setTimeout(() => {
        setSaveStatus((prev) => ({ ...prev, [accountId]: null }));
      }, 2500);
    } catch (err) {
      console.error(`[CardsSettingsTab] Auto-save failed for account ${accountId}:`, err);
      setSaveStatus((prev) => ({ ...prev, [accountId]: 'error' }));
      setTimeout(() => {
        setSaveStatus((prev) => ({ ...prev, [accountId]: null }));
      }, 4000);
    }
  };

  const handleToggle = (accountId, field, value) => {
    setAccounts((prev) =>
      prev.map((acc) => (acc.id === accountId ? { ...acc, [field]: value } : acc))
    );
    autoSaveAccount(accountId, { [field]: value });
  };

  const handleInputChange = (accountId, field, value) => {
    setAccounts((prev) =>
      prev.map((acc) => (acc.id === accountId ? { ...acc, [field]: value } : acc))
    );

    if (debounceTimers.current[`${accountId}_${field}`]) {
      clearTimeout(debounceTimers.current[`${accountId}_${field}`]);
    }

    debounceTimers.current[`${accountId}_${field}`] = setTimeout(() => {
      autoSaveAccount(accountId, { [field]: value });
    }, 800);
  };

  const handleInputBlur = (accountId, field, value) => {
    if (debounceTimers.current[`${accountId}_${field}`]) {
      clearTimeout(debounceTimers.current[`${accountId}_${field}`]);
    }
    autoSaveAccount(accountId, { [field]: value });
  };

  const handleGlobalSettingChange = async (key, value) => {
    setSavingGlobal(true);
    try {
      const currentRes = await api.getSystemSettings().catch(() => ({ data: { settings: {} } }));
      const current = currentRes.data?.settings || {};
      const updated = { ...current, [key]: value };
      await api.updateSystemSettings(updated);

      if (key === 'globalMemoParsingEnabled') setGlobalMemoParsingEnabled(value);
      if (key === 'globalMemoParsingScope') setGlobalMemoParsingScope(value);

      setGlobalSaved(true);
      setTimeout(() => setGlobalSaved(false), 2500);
    } catch (err) {
      console.error('[CardsSettingsTab] Failed to save global settings:', err);
    } finally {
      setSavingGlobal(false);
    }
  };

  const toggleExpand = (id) => {
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
        <p className="text-sm text-dark-text-muted light:text-light-text-muted">
          {isRtl ? 'טוען רשימת כרטיסים וחשבונות...' : 'Loading cards and accounts...'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Global Memo Parser Settings Banner */}
      <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base flex items-center gap-2">
                <span>{isRtl ? 'חילוץ סכום אוטומטי מהערות (Memo)' : 'Memo Amount Parsing (Fallback)'}</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-brand-primary/15 text-brand-primary">
                  {isRtl ? 'הגדרת מערכת' : 'Global Default'}
                </span>
              </h3>
              <p className="text-xs text-dark-text-muted light:text-light-text-muted mt-0.5">
                {isRtl
                  ? 'כשסכום עסקה אינו זמין (מופיע 0, למשל בעסקאות זמניות/אישור זמני), המערכת תנתח את הערת ה-Memo ותחלץ את הסכום שהוזן בה.'
                  : 'When transaction amount is 0 or missing, FinTrack extracts the amount directly from the memo field.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {savingGlobal && (
              <span className="text-xs flex items-center gap-1 text-dark-text-muted light:text-light-text-muted">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {isRtl ? 'שומר...' : 'Saving...'}
              </span>
            )}
            {globalSaved && (
              <span className="text-xs flex items-center gap-1 text-emerald-500 font-medium">
                <Check className="w-3.5 h-3.5" />
                {isRtl ? 'נשמר אוטומטית' : 'Auto-saved'}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-dark-border/60 light:border-light-border/60">
          {/* Global Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-dark-surface-elevated/50 light:bg-light-surface-elevated/50 border border-dark-border light:border-light-border">
            <div>
              <p className="text-xs font-semibold text-dark-text light:text-light-text">
                {isRtl ? 'הפעל חילוץ סכום מ-Memo כברירת מחדל' : 'Enable memo parsing globally'}
              </p>
              <p className="text-[11px] text-dark-text-muted light:text-light-text-muted mt-0.5">
                {isRtl ? 'חל על כל הכרטיסים שמוגדרים לפי הגדרת המערכת' : 'Applies to accounts using default behavior'}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3 mr-3">
              <input
                type="checkbox"
                checked={globalMemoParsingEnabled}
                onChange={(e) => handleGlobalSettingChange('globalMemoParsingEnabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-dark-border light:bg-light-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-primary"></div>
            </label>
          </div>

          {/* Global Scope */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-dark-surface-elevated/50 light:bg-light-surface-elevated/50 border border-dark-border light:border-light-border">
            <div>
              <p className="text-xs font-semibold text-dark-text light:text-light-text">
                {isRtl ? 'היקף בדיקת Memo בברירת מחדל' : 'Default parsing scope'}
              </p>
              <p className="text-[11px] text-dark-text-muted light:text-light-text-muted mt-0.5">
                {isRtl ? 'האם לבדוק רק עסקאות בהמתנה או כלל העסקאות' : 'Pending transactions only or all'}
              </p>
            </div>
            <select
              value={globalMemoParsingScope}
              onChange={(e) => handleGlobalSettingChange('globalMemoParsingScope', e.target.value)}
              className="text-xs rounded-lg px-2.5 py-1.5 bg-dark-surface light:bg-light-surface border border-dark-border light:border-light-border text-dark-text light:text-light-text cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-primary"
            >
              <option value="pending_only">{isRtl ? 'רק עסקאות זמניות (Pending)' : 'Pending Only'}</option>
              <option value="all">{isRtl ? 'כל העסקאות (כולל קבועות)' : 'All Transactions'}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Cards List Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-dark-text light:text-light-text flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-brand-primary" />
            <span>{isRtl ? 'כרטיסים וחשבונות פעילים' : 'Active Cards & Accounts'}</span>
            <span className="text-xs font-normal text-dark-text-muted light:text-light-text-muted">
              ({accounts.length})
            </span>
          </h3>
          <p className="text-xs text-dark-text-muted light:text-light-text-muted mt-0.5">
            {isRtl
              ? 'כל שינוי נשמר אוטומטית בזמן אמת ללא צורך בכפתור שמירה.'
              : 'All changes save automatically in real-time.'}
          </p>
        </div>
      </div>

      {/* Cards Accordion / List */}
      <div className="space-y-4">
        {accounts.map((acc) => {
          const isExpanded = expandedCards[acc.id] ?? false;
          const status = saveStatus[acc.id];
          const isPrepaid = Boolean(acc.isPrepaid);
          const includeInExpenses = acc.includeInExpenses !== false;
          const showBalance = acc.showBalance !== false;
          const isWallet = acc.bankCompany === 'wallet';

          const cardMemoOption =
            acc.enableMemoAmountParsing === null || acc.enableMemoAmountParsing === undefined
              ? 'default'
              : acc.enableMemoAmountParsing
              ? 'enabled'
              : 'disabled';

          const cardMemoScope = acc.memoParsingScope || 'default';

          return (
            <div
              key={acc.id}
              className={`rounded-2xl border transition-all duration-200 overflow-hidden bg-dark-surface light:bg-light-surface ${
                isExpanded
                  ? 'border-brand-primary/40 shadow-sm ring-1 ring-brand-primary/10'
                  : 'border-dark-border light:border-light-border hover:border-dark-border/80'
              }`}
            >
              {/* Card Header Row */}
              <div
                onClick={() => toggleExpand(acc.id)}
                className="p-4 sm:p-5 flex items-center justify-between cursor-pointer select-none bg-dark-surface-elevated/30 light:bg-light-surface-elevated/30 hover:bg-dark-surface-elevated/60 light:hover:bg-light-surface-elevated/60 transition-colors"
              >
                <div className="flex items-center gap-3.5">
                  <InstitutionLogo
                    bankCompany={acc.bankCompany}
                    institution={acc.displayName}
                    size={42}
                    className="shrink-0"
                  />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-sm text-dark-text light:text-light-text">
                        {acc.displayName || (isWallet ? (isRtl ? 'ארנק מזומנים' : 'Cash Wallet') : acc.bankCompany)}
                      </h4>

                      {/* Type Badges */}
                      {isPrepaid && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/25">
                          {isRtl ? 'כרטיס נטען' : 'Prepaid'}
                        </span>
                      )}

                      {isWallet && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/25 flex items-center gap-1">
                          <Wallet className="w-3 h-3" />
                          {isRtl ? 'ארנק' : 'Wallet'}
                        </span>
                      )}

                      {!includeInExpenses && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-500 border border-rose-500/25">
                          {isRtl ? 'לא נכלל בהוצאות' : 'Excluded from expenses'}
                        </span>
                      )}

                      {!showBalance && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/25 flex items-center gap-1">
                          <EyeOff className="w-3 h-3" />
                          {isRtl ? 'יתרה מוסתרת' : 'Hidden balance'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-1 text-xs text-dark-text-muted light:text-light-text-muted">
                      {acc.accountNumber && (
                        <span>
                          {isRtl ? 'מספר:' : 'Account:'} •••• {acc.accountNumber.slice(-4)}
                        </span>
                      )}
                      <span>
                        {isRtl ? 'יתרה:' : 'Balance:'}{' '}
                        <strong className="text-dark-text light:text-light-text font-mono">
                          {formatILS(acc.balance || 0)}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Auto-save Status Indicator + Chevron */}
                <div className="flex items-center gap-3">
                  {status === 'saving' && (
                    <span className="text-xs flex items-center gap-1 text-dark-text-muted light:text-light-text-muted animate-pulse">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-primary" />
                      <span className="hidden sm:inline">{isRtl ? 'שומר...' : 'Saving...'}</span>
                    </span>
                  )}
                  {status === 'saved' && (
                    <span className="text-xs flex items-center gap-1 text-emerald-500 font-medium animate-in fade-in">
                      <Check className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{isRtl ? 'נשמר אוטומטית' : 'Saved'}</span>
                    </span>
                  )}
                  {status === 'error' && (
                    <span className="text-xs flex items-center gap-1 text-rose-500 font-medium">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{isRtl ? 'שגיאה בשמירה' : 'Error'}</span>
                    </span>
                  )}

                  <div className="w-8 h-8 rounded-xl bg-dark-surface light:bg-light-surface flex items-center justify-center text-dark-text-muted light:text-light-text-muted">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>
              </div>

              {/* Card Expanded Settings Body */}
              {isExpanded && (
                <div className="p-4 sm:p-6 space-y-6 border-t border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface">
                  {/* Primary Settings Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Toggle: Include in expenses */}
                    <div className="flex items-center justify-between p-4 rounded-xl bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 border border-dark-border light:border-light-border">
                      <div className="space-y-0.5">
                        <label className="text-xs font-semibold text-dark-text light:text-light-text cursor-pointer">
                          {isRtl ? 'כלול בחישוב הוצאות' : 'Include in Expense Tracking'}
                        </label>
                        <p className="text-[11px] text-dark-text-muted light:text-light-text-muted max-w-xs">
                          {isRtl
                            ? 'כאשר כבוי, עסקאות מכרטיס זה לא יחושבו בסך ההוצאות החודשי ובדוחות'
                            : 'Exclude all transactions of this card from total spend and analytics'}
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3 mr-3">
                        <input
                          type="checkbox"
                          checked={includeInExpenses}
                          onChange={(e) => handleToggle(acc.id, 'includeInExpenses', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-dark-border light:bg-light-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-primary"></div>
                      </label>
                    </div>

                    {/* Toggle: Show balance */}
                    <div className="flex items-center justify-between p-4 rounded-xl bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 border border-dark-border light:border-light-border">
                      <div className="space-y-0.5">
                        <label className="text-xs font-semibold text-dark-text light:text-light-text cursor-pointer">
                          {isRtl ? 'הצג יתרה במסכים הראשיים' : 'Show Balance in UI'}
                        </label>
                        <p className="text-[11px] text-dark-text-muted light:text-light-text-muted max-w-xs">
                          {isRtl
                            ? 'שליטה האם להציג את יתרת הכרטיס בדשבורד ובעמוד החשבונות'
                            : 'Control if this card balance is visible on Dashboard and Accounts page'}
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3 mr-3">
                        <input
                          type="checkbox"
                          checked={showBalance}
                          onChange={(e) => handleToggle(acc.id, 'showBalance', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-dark-border light:bg-light-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-primary"></div>
                      </label>
                    </div>
                  </div>

                  {/* Memo Amount Fallback Section per Card */}
                  <div className="p-4 rounded-xl bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 border border-dark-border light:border-light-border space-y-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-brand-primary" />
                      <h5 className="text-xs font-semibold text-dark-text light:text-light-text">
                        {isRtl ? 'חילוץ סכום מהערות (Memo) לכרטיס זה' : 'Memo Amount Fallback for this card'}
                      </h5>
                    </div>

                    <p className="text-[11px] text-dark-text-muted light:text-light-text-muted">
                      {isRtl
                        ? 'כאשר הסכום הרשמי בעסקה הוא 0 (עסקה זמנית/אישור ראשוני), המערכת תחלץ את הסכום מההערה לפי ההגדרה:'
                        : 'When official transaction amount is 0, extract amount from transaction memo note:'}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {/* State Option */}
                      <div>
                        <label className="block text-[11px] font-medium text-dark-text-muted light:text-light-text-muted mb-1">
                          {isRtl ? 'מצב חילוץ ממו' : 'Parsing behavior'}
                        </label>
                        <select
                          value={cardMemoOption}
                          onChange={(e) => {
                            const val = e.target.value;
                            const patchVal = val === 'default' ? null : val === 'enabled';
                            handleToggle(acc.id, 'enableMemoAmountParsing', patchVal);
                          }}
                          className="w-full text-xs rounded-xl px-3 py-2 bg-dark-surface light:bg-light-surface border border-dark-border light:border-light-border text-dark-text light:text-light-text focus:outline-none focus:ring-1 focus:ring-brand-primary cursor-pointer"
                        >
                          <option value="default">
                            {isRtl
                              ? `לפי הגדרת המערכת (${globalMemoParsingEnabled ? 'מופעל' : 'כבוי'})`
                              : `System Default (${globalMemoParsingEnabled ? 'Enabled' : 'Disabled'})`}
                          </option>
                          <option value="enabled">{isRtl ? 'מופעל תמיד לכרטיס זה' : 'Always Enabled'}</option>
                          <option value="disabled">{isRtl ? 'כבוי תמיד לכרטיס זה' : 'Always Disabled'}</option>
                        </select>
                      </div>

                      {/* Scope Option */}
                      <div>
                        <label className="block text-[11px] font-medium text-dark-text-muted light:text-light-text-muted mb-1">
                          {isRtl ? 'היקף הבדיקה' : 'Parsing scope'}
                        </label>
                        <select
                          value={cardMemoScope}
                          onChange={(e) => {
                            const val = e.target.value === 'default' ? null : e.target.value;
                            handleToggle(acc.id, 'memoParsingScope', val);
                          }}
                          className="w-full text-xs rounded-xl px-3 py-2 bg-dark-surface light:bg-light-surface border border-dark-border light:border-light-border text-dark-text light:text-light-text focus:outline-none focus:ring-1 focus:ring-brand-primary cursor-pointer"
                        >
                          <option value="default">
                            {isRtl
                              ? `לפי הגדרת המערכת (${globalMemoParsingScope === 'all' ? 'הכל' : 'זמניות בלבד'})`
                              : `System Default (${globalMemoParsingScope === 'all' ? 'All' : 'Pending Only'})`}
                          </option>
                          <option value="pending_only">{isRtl ? 'רק עסקאות זמניות (Pending)' : 'Pending Only'}</option>
                          <option value="all">{isRtl ? 'כל העסקאות (כולל סופיות)' : 'All Transactions'}</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Prepaid Card Section */}
                  <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Percent className="w-4 h-4 text-amber-500" />
                        <div>
                          <h5 className="text-xs font-semibold text-dark-text light:text-light-text">
                            {isRtl ? 'הגדרת כרטיס נטען (Prepaid)' : 'Prepaid Card Management'}
                          </h5>
                          <p className="text-[11px] text-dark-text-muted light:text-light-text-muted">
                            {isRtl
                              ? 'מתאים לכרטיסי תווי קנייה, גיפטקארד (כמו חבר, ביימי, הייטקזון) וכרטיסים נטענים'
                              : 'For gift cards, reloadable cards, and benefit cards'}
                          </p>
                        </div>
                      </div>

                      <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3 mr-3">
                        <input
                          type="checkbox"
                          checked={isPrepaid}
                          onChange={(e) => handleToggle(acc.id, 'isPrepaid', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-dark-border light:bg-light-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                      </label>
                    </div>

                    {/* Prepaid Conditional Options */}
                    {isPrepaid && (
                      <div className="space-y-4 pt-3 border-t border-amber-500/20 animate-in fade-in duration-150">
                        {/* Mode Selection */}
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-dark-text light:text-light-text">
                            {isRtl ? 'אופן החישוב והשילוב בהוצאות:' : 'Calculation & Expense Mode:'}
                          </label>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label
                              onClick={() => handleToggle(acc.id, 'prepaidMode', 'link_offset')}
                              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                acc.prepaidMode !== 'ignore_all'
                                  ? 'border-amber-500 bg-amber-500/10 text-dark-text light:text-light-text ring-1 ring-amber-500/30'
                                  : 'border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text-muted light:text-light-text-muted hover:border-dark-border/80'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`prepaidMode_${acc.id}`}
                                value="link_offset"
                                checked={acc.prepaidMode !== 'ignore_all'}
                                onChange={() => handleToggle(acc.id, 'prepaidMode', 'link_offset')}
                                className="mt-0.5 text-amber-500 focus:ring-amber-500"
                              />
                              <div>
                                <span className="text-xs font-semibold block text-dark-text light:text-light-text">
                                  {isRtl ? 'קיזוז הוצאות מול טעינות' : 'Offset Loads vs Expenses'}
                                </span>
                                <span className="text-[11px] leading-tight block text-dark-text-muted light:text-light-text-muted mt-0.5">
                                  {isRtl
                                    ? 'המערכת תחשב יתרה שנותרה: סך הטעינות כולל הנחה פחות כל ההוצאות שנוצלו'
                                    : 'Computes remaining balance: Loads + bonus minus expenses'}
                                </span>
                              </div>
                            </label>

                            <label
                              onClick={() => handleToggle(acc.id, 'prepaidMode', 'ignore_all')}
                              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                acc.prepaidMode === 'ignore_all'
                                  ? 'border-amber-500 bg-amber-500/10 text-dark-text light:text-light-text ring-1 ring-amber-500/30'
                                  : 'border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text-muted light:text-light-text-muted hover:border-dark-border/80'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`prepaidMode_${acc.id}`}
                                value="ignore_all"
                                checked={acc.prepaidMode === 'ignore_all'}
                                onChange={() => handleToggle(acc.id, 'prepaidMode', 'ignore_all')}
                                className="mt-0.5 text-amber-500 focus:ring-amber-500"
                              />
                              <div>
                                <span className="text-xs font-semibold block text-dark-text light:text-light-text">
                                  {isRtl ? 'התעלם מכל תנועות הכרטיס' : 'Ignore All Transactions'}
                                </span>
                                <span className="text-[11px] leading-tight block text-dark-text-muted light:text-light-text-muted mt-0.5">
                                  {isRtl
                                    ? 'ההוצאות מכרטיס זה לא יחושבו בסך ההוצאות הכלליות כלל (שימושי אם הטעינה כבר נספרה בחשבון אחר)'
                                    : 'Transactions are not added to expenses to prevent double-counting'}
                                </span>
                              </div>
                            </label>
                          </div>
                        </div>

                        {/* Discount / Bonus Percentage */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                          <div>
                            <label className="block text-xs font-medium text-dark-text light:text-light-text mb-1.5">
                              {isRtl ? 'אחוז הנחה / בונוס בטעינה (%)' : 'Discount / Bonus % on Top-up'}
                            </label>
                            <div className="relative">
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                max="100"
                                value={acc.discountPercentage ?? 0}
                                onChange={(e) =>
                                  handleInputChange(acc.id, 'discountPercentage', parseFloat(e.target.value) || 0)
                                }
                                onBlur={(e) =>
                                  handleInputBlur(acc.id, 'discountPercentage', parseFloat(e.target.value) || 0)
                                }
                                placeholder="לדוגמה: 20"
                                className="w-full text-xs rounded-xl px-3 py-2.5 bg-dark-surface light:bg-light-surface border border-dark-border light:border-light-border text-dark-text light:text-light-text focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                              />
                              <span className="absolute left-3 top-2.5 text-xs text-dark-text-muted light:text-light-text-muted font-bold pointer-events-none">
                                %
                              </span>
                            </div>
                            <p className="text-[11px] text-dark-text-muted light:text-light-text-muted mt-1">
                              {isRtl
                                ? 'למשל: 20% אומר שטעינה של 100 ₪ מקנה 120 ₪ למימוש'
                                : 'e.g. 20% discount means 100 ₪ top-up gives 120 ₪ spending power'}
                            </p>
                          </div>

                          {/* Direct Balance Adjustment */}
                          <div>
                            <label className="block text-xs font-medium text-dark-text light:text-light-text mb-1.5">
                              {isRtl ? 'עדכון יתרה נוכחית בכרטיס (₪)' : 'Direct Balance Adjustment (₪)'}
                            </label>
                            <div className="relative">
                              <input
                                type="number"
                                step="1"
                                value={acc.balance ?? 0}
                                onChange={(e) =>
                                  handleInputChange(acc.id, 'balance', parseFloat(e.target.value) || 0)
                                }
                                onBlur={(e) =>
                                  handleInputBlur(acc.id, 'balance', parseFloat(e.target.value) || 0)
                                }
                                className="w-full text-xs rounded-xl px-3 py-2.5 bg-dark-surface light:bg-light-surface border border-dark-border light:border-light-border text-dark-text light:text-light-text focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                              />
                              <span className="absolute left-3 top-2.5 text-xs text-dark-text-muted light:text-light-text-muted font-bold pointer-events-none">
                                ₪
                              </span>
                            </div>
                            <p className="text-[11px] text-dark-text-muted light:text-light-text-muted mt-1">
                              {isRtl
                                ? 'עדכון היתרה יתאים אוטומטית את יתרת הבסיס בהתאם לטעינות ולהוצאות'
                                : 'Updates the effective current balance and syncs base balance'}
                            </p>
                          </div>
                        </div>

                        {/* Live Prepaid Balance Breakdown */}
                        <div className="p-3.5 rounded-xl bg-dark-surface light:bg-light-surface border border-dark-border light:border-light-border space-y-2">
                          <h6 className="text-[11px] font-bold text-dark-text-muted light:text-light-text-muted uppercase tracking-wider">
                            {isRtl ? 'פירוט יתרת כרטיס נטען' : 'Prepaid Balance Breakdown'}
                          </h6>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            <div className="p-2 rounded-lg bg-dark-surface-elevated/60 light:bg-light-surface-elevated/60">
                              <span className="text-[10px] text-dark-text-muted light:text-light-text-muted block">
                                {isRtl ? 'סך טעינות (ברוטו)' : 'Total Loads'}
                              </span>
                              <strong className="font-mono text-emerald-500">
                                {formatILS(acc.totalLoads || 0)}
                              </strong>
                            </div>

                            <div className="p-2 rounded-lg bg-dark-surface-elevated/60 light:bg-light-surface-elevated/60">
                              <span className="text-[10px] text-dark-text-muted light:text-light-text-muted block">
                                {isRtl ? 'טעינות אפקטיביות' : 'Effective Loaded'}
                              </span>
                              <strong className="font-mono text-emerald-500">
                                {formatILS(acc.effectiveLoaded || acc.totalLoads || 0)}
                              </strong>
                            </div>

                            <div className="p-2 rounded-lg bg-dark-surface-elevated/60 light:bg-light-surface-elevated/60">
                              <span className="text-[10px] text-dark-text-muted light:text-light-text-muted block">
                                {isRtl ? 'סך הוצאות שנוצלו' : 'Total Expenses'}
                              </span>
                              <strong className="font-mono text-rose-500">
                                {formatILS(acc.totalExpenses || 0)}
                              </strong>
                            </div>

                            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                              <span className="text-[10px] text-amber-500 font-semibold block">
                                {isRtl ? 'יתרה מחושבת סופית' : 'Calculated Balance'}
                              </span>
                              <strong className="font-mono text-amber-500 text-sm">
                                {formatILS(acc.calculatedBalance !== undefined ? acc.calculatedBalance : acc.balance)}
                              </strong>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
