'use client';

import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatILS, formatPercent } from '../../lib/api';

/**
 * Custom Tooltip for Donut Chart
 */
const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="glass-panel p-3 rounded-xl border border-white/15 shadow-xl text-right">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: data.color || payload[0].color }}
          />
          <span className="text-xs font-semibold text-white">{data.name}</span>
        </div>
        <div className="text-sm font-bold text-slate-100 num-he">
          {formatILS(data.amount)}
        </div>
        {data.percent !== undefined && (
          <div className="text-[11px] text-slate-400 mt-0.5">
            {formatPercent(data.percent * 100)} מכלל ההוצאות
          </div>
        )}
      </div>
    );
  }
  return null;
};

export default function CategoryDonutChart({ data = [], totalAmount }) {
  const [activeIndex, setActiveIndex] = useState(null);

  // Compute total if not provided
  const computedTotal =
    totalAmount ||
    data.reduce((sum, item) => sum + (typeof item.amount === 'number' ? item.amount : 0), 0);

  // Calculate percentage per category for legend and tooltip
  const chartData = data.map((item) => ({
    ...item,
    percent: computedTotal > 0 ? item.amount / computedTotal : 0,
  }));

  const onPieEnter = (_, index) => {
    setActiveIndex(index);
  };

  const onPieLeave = () => {
    setActiveIndex(null);
  };

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 text-xs">
        אין נתוני הוצאות לחודש זה
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full justify-between">
      {/* Donut Chart with Center Label */}
      <div className="relative w-full h-56 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<CustomTooltip />} />
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={65}
              outerRadius={90}
              paddingAngle={3}
              dataKey="amount"
              onMouseEnter={onPieEnter}
              onMouseLeave={onPieLeave}
              stroke="transparent"
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color || '#3b82f6'}
                  style={{
                    filter:
                      activeIndex === index
                        ? 'drop-shadow(0px 0px 8px rgba(255,255,255,0.4))'
                        : 'none',
                    transform: activeIndex === index ? 'scale(1.04)' : 'scale(1)',
                    transformOrigin: 'center center',
                    transition: 'all 0.2s ease-out',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Center Total Overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[11px] font-medium text-slate-400">
            {activeIndex !== null && chartData[activeIndex]
              ? chartData[activeIndex].name
              : 'סה״כ הוצאות'}
          </span>
          <span className="text-lg sm:text-xl font-bold text-white tracking-tight num-he mt-0.5">
            {activeIndex !== null && chartData[activeIndex]
              ? formatILS(chartData[activeIndex].amount)
              : formatILS(computedTotal)}
          </span>
          {activeIndex !== null && chartData[activeIndex] && (
            <span className="text-[10px] text-brand-cyan font-semibold mt-0.5">
              {formatPercent(chartData[activeIndex].percent * 100)}
            </span>
          )}
        </div>
      </div>

      {/* Category Legend */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/10">
        {chartData.map((item, index) => {
          const isHovered = activeIndex === index;
          return (
            <div
              key={item.name}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-between gap-1.5 ${
                isHovered ? 'bg-white/10' : 'hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-xs text-slate-300 truncate">{item.name}</span>
              </div>
              <span className="text-[11px] font-bold text-slate-200 num-he flex-shrink-0">
                {formatILS(item.amount, { compact: true })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
