'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Landmark,
  PieChart,
  ShieldCheck,
} from 'lucide-react';

const MOBILE_NAV_ITEMS = [
  { href: '/', label: 'דשבורד', icon: LayoutDashboard },
  { href: '/transactions', label: 'תנועות', icon: ArrowLeftRight },
  { href: '/accounts', label: 'חשבונות', icon: Landmark },
  { href: '/budgets', label: 'תקציב', icon: PieChart },
  { href: '/security', label: 'אבטחה', icon: ShieldCheck },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden glass-panel border-t border-white/10 pb-safe bg-navy-950/85 backdrop-blur-xl">
      <div className="grid grid-cols-5 items-center justify-around px-2 py-1.5">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all duration-150 relative ${
                isActive
                  ? 'text-brand-cyan font-semibold'
                  : 'text-slate-400 hover:text-slate-200 font-normal'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform duration-200 ${
                    isActive ? 'scale-110 text-brand-cyan' : ''
                  }`}
                />
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-brand-cyan shadow-glow-cyan" />
                )}
              </div>
              <span className="text-[10px] mt-1 tracking-tight truncate max-w-full">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
