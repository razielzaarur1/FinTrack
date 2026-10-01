'use client';

import React, { useState } from 'react';
import { 
  Flame, 
  Layers, 
  Calendar, 
  CreditCard, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  ChevronLeft,
  PieChart as PieIcon,
  HelpCircle,
  TrendingUp,
  Percent
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Cell 
} from 'recharts';
import { formatILS } from '@/lib/formatters';
import { useApp } from '@/lib/app-context';

export default function DeepStatsCards({ deepStats, onCategoryClick }) {
  const { lang, theme } = useApp();

  if (!deepStats) return null;

  const { fixedVsVariable, dayOfWeekSpending, burnRate, accountBreakdown } = deepStats;

  return (
    <div className="space-y-6">
      
      {/* 2-Column Grid: Fixed vs Variable & Burn Rate Projections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Card 1: Fixed vs. Variable Expenses (הוצאות קבועות מול משתנות) */}
        <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-base flex items-center gap-2 text-dark-text light:text-light-text">
              <Layers className="w-5 h-5 text-indigo-500" />
              <span>הוצאות קבועות מול משתנות</span>
            </h3>
            <span className="text-xs text-dark-text-muted light:text-light-text-muted">
              חלוקה לפי רמת גמישות
            </span>
          </div>

          {/* Ratio bar */}
          <div className="space-y-2">
            <div className="h-4 w-full rounded-full bg-dark-surface-elevated light:bg-light-surface-elevated overflow-hidden flex p-0.5 border border-dark-border/40">
              <div 
                className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.max(5, fixedVsVariable?.fixedPercent || 0)}%` }}
                title={`הוצאות קבועות: ${fixedVsVariable?.fixedPercent}%`}
              />
              <div 
                className="h-full bg-emerald-500 rounded-full transition-all duration-500 mr-1"
                style={{ width: `${Math.max(5, fixedVsVariable?.variablePercent || 0)}%` }}
                title={`הוצאות משתנות: ${fixedVsVariable?.variablePercent}%`}
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                <span className="font-bold text-dark-text light:text-light-text">קבועות: {fixedVsVariable?.fixedPercent || 0}%</span>
                <span className="text-dark-text-muted font-mono" dir="ltr">({formatILS(fixedVsVariable?.fixedTotal || 0)})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="font-bold text-dark-text light:text-light-text">משתנות: {fixedVsVariable?.variablePercent || 0}%</span>
                <span className="text-dark-text-muted font-mono" dir="ltr">({formatILS(fixedVsVariable?.variableTotal || 0)})</span>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-dark-border/60 bg-dark-surface-elevated/40 text-xs text-dark-text-muted light:text-light-text-muted leading-relaxed">
            <span className="font-semibold text-dark-text light:text-light-text">תובנה: </span>
            {fixedVsVariable?.fixedPercent > 60 
              ? 'חלק ניכר מההוצאות שלך קבוע (חשבונות, שכירות, מנויים). צמצום משמעותי יחייב שינוי חוזים או ביטוחים.'
              : 'רוב ההוצאות שלך משתנות וגמישות (אוכל בחוץ, קניות, פנאי). יש לך שליטה גבוהה ויכולת מיידית להגדיל את החיסכון החודשי!'}
          </div>
        </div>

        {/* Card 2: Burn Rate & Month-End Projection (קצב הוצאות ותחזית סוף חודש) */}
        <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-base flex items-center gap-2 text-dark-text light:text-light-text">
              <Flame className="w-5 h-5 text-orange-500" />
              <span>קצב שריפה יומי ותחזית סוף מחזור</span>
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 font-bold">
              יום {burnRate?.daysElapsed} מתוך {burnRate?.totalCycleDays}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl border border-dark-border/60 bg-dark-surface-elevated/40 space-y-1">
              <div className="text-dark-text-muted light:text-light-text-muted">קצב הוצאה ממוצע ליום</div>
              <div className="text-base sm:text-lg font-bold text-orange-400 font-mono" dir="ltr">
                {formatILS(burnRate?.dailyBurnRate || 0)}
              </div>
              <div className="text-[10px] text-dark-text-muted">לכל יום שחלף במחזור</div>
            </div>

            <div className="p-3 rounded-xl border border-dark-border/60 bg-dark-surface-elevated/40 space-y-1">
              <div className="text-dark-text-muted light:text-light-text-muted">תחזית הוצאה לסוף החודש</div>
              <div className="text-base sm:text-lg font-bold text-brand-primary font-mono" dir="ltr">
                {formatILS(burnRate?.projectedMonthEndSpend || 0)}
              </div>
              <div className="text-[10px] text-dark-text-muted">בקצב ההוצאות הנוכחי</div>
            </div>
          </div>

          {/* Progress bar of cycle elapsed */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-dark-text-muted">
              <span>התקדמות מחזור פיננסי: {burnRate?.cycleProgressPercent}%</span>
              <span>נותרו {burnRate?.daysRemaining} ימים</span>
            </div>
            <div className="h-2 w-full rounded-full bg-dark-surface-elevated light:bg-light-surface-elevated overflow-hidden border border-dark-border/40">
              <div 
                className="h-full bg-orange-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, burnRate?.cycleProgressPercent || 0)}%` }}
              />
            </div>
          </div>
        </div>

      </div>

      {/* Day of Week Heatmap */}
      {dayOfWeekSpending?.days && dayOfWeekSpending.days.length > 0 && (
        <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-base flex items-center gap-2 text-dark-text light:text-light-text">
                <Calendar className="w-5 h-5 text-brand-cyan" />
                <span>התפלגות הוצאות לפי ימי השבוע (ראשון עד שבת)</span>
              </h3>
              <p className="text-xs text-dark-text-muted light:text-light-text-muted mt-0.5">
                באילו ימים אתה מוציא הכי הרבה? השוואת אמצע שבוע לעומת סופי שבוע
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs font-semibold">
              <div className="text-dark-text light:text-light-text">
                אמצע שבוע: <span className="font-mono text-brand-primary">{formatILS(dayOfWeekSpending.weekdayTotal)}</span>
              </div>
              <div className="text-dark-text light:text-light-text">
                סופ״ש: <span className="font-mono text-amber-500">{formatILS(dayOfWeekSpending.weekendTotal)}</span> ({dayOfWeekSpending.weekendPercent}%)
              </div>
            </div>
          </div>

          <div className="h-52 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dayOfWeekSpending.days} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(v) => `₪${v}`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: theme === 'light' ? '#ffffff' : '#0f172a',
                    borderColor: theme === 'light' ? '#e2e8f0' : '#1e293b',
                    borderRadius: '0.75rem',
                    fontSize: '12px',
                  }}
                  formatter={(val, name, item) => [
                    <span key="val" className="font-bold font-mono text-brand-primary">{formatILS(val)} ({item.payload.count} עסקאות)</span>,
                    'הוצאות ביום זה'
                  ]}
                />
                <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                  {dayOfWeekSpending.days.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.dayNum === 5 || entry.dayNum === 6 ? '#f59e0b' : '#6366f1'} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

    </div>
  );
}
