'use client';

import React from 'react';
import { formatILS, formatPercent } from '../../lib/api';
import { AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';

export default function BudgetProgressBar({
  spent = 0,
  limit = 0,
  category = '',
  showLabels = true,
  height = 'h-2.5',
  showRemaining = true,
  warningThreshold = 75,
}) {
  const percentage = limit > 0 ? (spent / limit) * 100 : 0;
  const remaining = limit - spent;
  const isOverBudget = spent > limit;

  // Determine color scheme based on percentage
  let barColor = 'bg-emerald-500';
  let textColor = 'text-emerald-400';
  let glowColor = 'shadow-glow-emerald';
  let statusBadge = {
    text: 'תקין',
    bg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    icon: CheckCircle,
  };

  if (percentage >= 100) {
    barColor = 'bg-rose-500';
    textColor = 'text-rose-400';
    glowColor = 'shadow-glow-rose';
    statusBadge = {
      text: 'חריגה!',
      bg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      icon: AlertCircle,
    };
  } else if (percentage >= warningThreshold) {
    barColor = 'bg-amber-500';
    textColor = 'text-amber-400';
    glowColor = 'shadow-glow-amber';
    statusBadge = {
      text: 'קרוב למגבלה',
      bg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      icon: AlertTriangle,
    };
  }

  const StatusIcon = statusBadge.icon;

  return (
    <div className="w-full space-y-1.5">
      {showLabels && (
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            {category && <span className="font-semibold text-slate-200 truncate">{category}</span>}
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${statusBadge.bg}`}
            >
              <StatusIcon className="w-3 h-3" />
              <span>{statusBadge.text}</span>
            </span>
          </div>

          <div className="flex items-center gap-1 text-slate-300 num-he font-medium">
            <span className="text-white font-bold">{formatILS(spent)}</span>
            <span className="text-slate-500">/</span>
            <span className="text-slate-400">{formatILS(limit)}</span>
          </div>
        </div>
      )}

      {/* Progress Track */}
      <div className={`w-full ${height} rounded-full bg-navy-900/90 border border-white/10 overflow-hidden relative p-[1px]`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor} ${
            percentage >= 75 ? glowColor : ''
          }`}
          style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
        />
      </div>

      {showRemaining && (
        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
          <span>
            {isOverBudget ? (
              <span className="text-rose-400 font-medium">
                חריגה של {formatILS(Math.abs(remaining))}
              </span>
            ) : (
              <span>נותרו {formatILS(remaining)}</span>
            )}
          </span>
          <span className={`font-bold ${textColor} num-he`}>
            {formatPercent(percentage)}
          </span>
        </div>
      )}
    </div>
  );
}
