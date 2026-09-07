'use client';

import React, { useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { formatILS } from '../../lib/api';

/**
 * Custom Tooltip for Trend Chart
 */
const CustomTrendTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const income = payload.find((p) => p.dataKey === 'income')?.value || 0;
    const expenses = payload.find((p) => p.dataKey === 'expenses')?.value || 0;
    const netSavings = income - expenses;

    return (
      <div className="glass-panel p-3.5 rounded-2xl border border-white/15 shadow-2xl text-right min-w-[180px]">
        <div className="text-xs font-bold text-white mb-2 pb-1 border-b border-white/10">
          חודש: {label}
        </div>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>הכנסות:</span>
            </span>
            <span className="font-bold num-he">{formatILS(income, { showSign: true })}</span>
          </div>
          <div className="flex items-center justify-between text-rose-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              <span>הוצאות:</span>
            </span>
            <span className="font-bold num-he">{formatILS(expenses)}</span>
          </div>
          <div className="pt-1.5 mt-1 border-t border-white/10 flex items-center justify-between text-slate-200">
            <span>חיסכון נטו:</span>
            <span
              className={`font-bold num-he ${
                netSavings >= 0 ? 'text-brand-cyan' : 'text-rose-400'
              }`}
            >
              {formatILS(netSavings, { showSign: true })}
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default function MonthlyTrendChart({ data = [] }) {
  const [viewMode, setViewMode] = useState('6m'); // '6m' | '12m'

  // Extended 12 months mock dataset if available or expand past 6 months
  const full12MonthsData = [
    { month: 'אוק׳', income: 21500, expenses: 14000, savings: 7500 },
    { month: 'נוב׳', income: 22000, expenses: 13800, savings: 8200 },
    { month: 'דצמ׳', income: 25000, expenses: 16500, savings: 8500 },
    { month: 'ינו׳', income: 22000, expenses: 13200, savings: 8800 },
    { month: 'פבר׳', income: 22000, expenses: 12900, savings: 9100 },
    { month: 'מרץ', income: 23500, expenses: 14500, savings: 9000 },
    ...(data && data.length >= 6
      ? data
      : [
          { month: 'אפר׳', income: 22000, expenses: 13500, savings: 8500 },
          { month: 'מאי', income: 22500, expenses: 14100, savings: 8400 },
          { month: 'יוני', income: 23000, expenses: 15200, savings: 7800 },
          { month: 'יולי', income: 22500, expenses: 16800, savings: 5700 },
          { month: 'אוג׳', income: 24000, expenses: 15100, savings: 8900 },
          { month: 'ספט׳', income: 24500, expenses: 14230, savings: 10270 },
        ]),
  ];

  const displayedData =
    viewMode === '6m'
      ? (data && data.length > 0 ? data : full12MonthsData.slice(-6))
      : full12MonthsData;

  return (
    <div className="flex flex-col h-full">
      {/* Header & Controls */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-white">מגמת הכנסות מול הוצאות</h3>
          <p className="text-xs text-slate-400">השוואה חודשית רב-תקופתית</p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-navy-950/60 rounded-xl border border-white/10">
          <button
            onClick={() => setViewMode('6m')}
            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
              viewMode === '6m'
                ? 'bg-brand-blue text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            6 חודשים
          </button>
          <button
            onClick={() => setViewMode('12m')}
            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
              viewMode === '12m'
                ? 'bg-brand-blue text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            שנה מלאה
          </button>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="w-full h-64 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={displayedData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
            <defs>
              <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="rgba(255, 255, 255, 0.06)" strokeDasharray="3 3" vertical={false} />

            <XAxis
              dataKey="month"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            />

            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => `₪${(val / 1000).toFixed(0)}k`}
            />

            <Tooltip content={<CustomTrendTooltip />} />

            <Legend
              verticalAlign="top"
              align="left"
              height={30}
              iconType="circle"
              formatter={(value) => (
                <span className="text-xs text-slate-300 mr-1">
                  {value === 'income' ? 'הכנסות' : value === 'expenses' ? 'הוצאות' : 'חיסכון'}
                </span>
              )}
            />

            {/* Income Area with Gradient */}
            <Area
              type="monotone"
              dataKey="income"
              name="income"
              stroke="#10b981"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#incomeGradient)"
            />

            {/* Expense Area with Gradient */}
            <Area
              type="monotone"
              dataKey="expenses"
              name="expenses"
              stroke="#f43f5e"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#expenseGradient)"
            />

            {/* Net Savings Bar */}
            <Bar
              dataKey="savings"
              name="savings"
              barSize={12}
              fill="#06b6d4"
              radius={[4, 4, 0, 0]}
              opacity={0.85}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
