'use client';

import React from 'react';
import Link from 'next/link';
import { RefreshCw, CheckCircle2, AlertCircle, Clock, CreditCard, Landmark, PiggyBank } from 'lucide-react';
import { formatILS, formatDate } from '../../lib/api';
import { ISRAELI_INSTITUTIONS } from '../../lib/types';

export default function AccountQuickCard({ account, onSync, isSyncing = false }) {
  if (!account) return null;

  const institution = ISRAELI_INSTITUTIONS[account.bankCompany] || {
    id: account.bankCompany,
    name: account.displayName || account.bankCompany,
    color: '#3b82f6',
    badgeBg: 'bg-blue-900/40 text-blue-300 border-blue-700/50',
    logoText: account.bankCompany?.slice(0, 4).toUpperCase() || 'בנק',
  };

  const isPositive = account.balance >= 0;
  const isCredit = account.accountType === 'credit';

  const getAccountTypeLabel = (type) => {
    switch (type) {
      case 'credit':
        return 'כרטיס אשראי';
      case 'savings':
        return 'חיסכון / השקעות';
      case 'investment':
        return 'תיק ניירות ערך';
      case 'checking':
      default:
        return 'עו״ש ראשי';
    }
  };

  const getAccountIcon = (type) => {
    switch (type) {
      case 'credit':
        return <CreditCard className="w-3.5 h-3.5" />;
      case 'savings':
      case 'investment':
        return <PiggyBank className="w-3.5 h-3.5" />;
      default:
        return <Landmark className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="group relative rounded-2xl glass-card p-4 border border-white/10 hover:border-brand-blue/40 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-glow-blue flex flex-col justify-between min-w-[220px] flex-1">
      {/* Top Row: Institution & Status */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Bank Badge / Avatar */}
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs text-white shadow-sm flex-shrink-0"
            style={{ backgroundColor: institution.color }}
          >
            {institution.logoText || 'בנק'}
          </div>

          <div className="min-w-0">
            <h4 className="text-xs font-bold text-white truncate group-hover:text-brand-blue-light transition-colors">
              {account.displayName || institution.name}
            </h4>
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <span className="truncate">{getAccountTypeLabel(account.accountType)}</span>
              {account.accountNumber && (
                <>
                  <span>&bull;</span>
                  <span className="font-mono">•••• {account.accountNumber}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Live Scrape Status Dot */}
        <div className="flex items-center gap-1">
          {account.scrapeStatus === 'running' || isSyncing ? (
            <span title="מסנכרן כעת" className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-cyan opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-cyan"></span>
            </span>
          ) : account.scrapeStatus === 'error' ? (
            <span title="שגיאת סנכרון" className="h-2 w-2 rounded-full bg-rose-500 shadow-glow-rose" />
          ) : (
            <span title="סונכרן בהצלחה" className="h-2 w-2 rounded-full bg-emerald-400" />
          )}
        </div>
      </div>

      {/* Middle Row: Balance Display */}
      <div className="mb-3">
        <span className="text-[10px] text-slate-400 font-medium block">
          {isCredit ? 'חיוב צפוי החודש' : 'יתרה נוכחית'}
        </span>
        <div
          className={`text-lg sm:text-xl font-bold tracking-tight num-he ${
            isCredit ? 'text-slate-100' : isPositive ? 'text-emerald-400' : 'text-rose-400'
          }`}
        >
          {formatILS(account.balance)}
        </div>
      </div>

      {/* Bottom Row: Timestamp & Quick Sync Action */}
      <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400">
        <span className="truncate flex items-center gap-1">
          <Clock className="w-3 h-3 text-slate-500" />
          <span>{formatDate(account.lastScrapedAt, { format: 'relative' })}</span>
        </span>

        {onSync && (
          <button
            onClick={(e) => {
              e.preventDefault();
              onSync(account.id);
            }}
            disabled={isSyncing}
            className="p-1 rounded-md hover:bg-white/10 text-slate-400 hover:text-brand-cyan transition-colors"
            title="סנכרן חשבון זה"
            aria-label="סנכרן חשבון"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-brand-cyan' : ''}`} />
          </button>
        )}
      </div>
    </div>
  );
}
