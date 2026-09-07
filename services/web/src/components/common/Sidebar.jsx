'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Landmark,
  PieChart,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  TrendingUp,
  CreditCard,
  Lock,
} from 'lucide-react';
import { formatILS } from '../../lib/api';

const NAV_ITEMS = [
  {
    href: '/',
    label: 'דשבורד ראשי',
    icon: LayoutDashboard,
    badge: null,
  },
  {
    href: '/transactions',
    label: 'תנועות והוצאות',
    icon: ArrowLeftRight,
    badge: '8 חדשות',
  },
  {
    href: '/accounts',
    label: 'חשבונות וכרטיסים',
    icon: Landmark,
    badge: '4',
  },
  {
    href: '/budgets',
    label: 'תקציב ויעדים',
    icon: PieChart,
    badge: null,
  },
  {
    href: '/security',
    label: 'אבטחה וכספת',
    icon: ShieldCheck,
    badge: 'נעול',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`hidden md:flex flex-col border-l border-white/10 glass-panel h-[calc(100vh-61px)] sticky top-[61px] transition-all duration-300 z-20 ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Navigation Links */}
      <div className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto">
        <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
          {!collapsed && <span>תפריט ראשי</span>}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            title={collapsed ? 'הרחב תפריט' : 'כווץ תפריט'}
            aria-label="כווץ או הרחב תפריט"
          >
            {collapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-r from-brand-blue/25 to-brand-cyan/15 text-white border border-brand-blue/40 shadow-glow-blue'
                  : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <div
                className={`p-1.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-brand-blue text-white shadow-sm'
                    : 'bg-navy-800/80 text-slate-400 group-hover:text-brand-cyan group-hover:bg-navy-700/80'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
              </div>

              {!collapsed && (
                <div className="flex-1 flex items-center justify-between min-w-0">
                  <span className="truncate">{item.label}</span>
                  {item.badge && (
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        item.badgeColor || 'bg-brand-blue/20 text-brand-blue-light border-brand-blue/30'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* Quick Stats Widget (Footer) */}
      {!collapsed ? (
        <div className="p-4 m-3 rounded-2xl bg-gradient-to-br from-navy-800/90 to-navy-850/90 border border-white/10 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              שווי נקי מוערך
            </span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
              +4.8%
            </span>
          </div>
          <div className="text-lg font-bold text-white tracking-tight mb-3">
            {formatILS(169940.3)}
          </div>
          <div className="pt-2.5 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <Lock className="w-3 h-3 text-brand-cyan" />
              סנכרון מאובטח
            </span>
            <span className="text-slate-300">היום 12:45</span>
          </div>
        </div>
      ) : (
        <div className="p-3 text-center border-t border-white/10 text-slate-400" title="שווי נקי מוערך">
          <TrendingUp className="w-5 h-5 mx-auto text-emerald-400" />
        </div>
      )}
    </aside>
  );
}
