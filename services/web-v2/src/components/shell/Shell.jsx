'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  ArrowLeftRight, 
  PieChart, 
  BarChart3,
  Landmark, 
  Target, 
  Settings, 
  RefreshCw, 
  Globe, 
  Sun, 
  Moon,
  Tag,
  CheckCircle2,
  Lock,
  Menu,
  X,
  ChevronLeft,
  Shield
} from 'lucide-react';
import { useApp } from '@/lib/app-context';
import { api } from '@/lib/api';

export default function Shell({ children }) {
  const { t, lang, theme, toggleLanguage, toggleTheme, lock } = useApp();
  const pathname = usePathname();
  const [syncing, setSyncing] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSyncAll = async () => {
    try {
      setSyncing(true);
      await api.triggerScrape(null);
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => setSyncing(false), 3000);
    }
  };

  const navItems = [
    { href: '/', label: t('dashboard'), icon: LayoutDashboard },
    { href: '/transactions', label: t('transactions'), icon: ArrowLeftRight },
    { href: '/review', label: t('review'), icon: CheckCircle2 },
    { href: '/categories', label: t('categories'), icon: Tag },
    { href: '/analytics', label: t('analytics'), icon: BarChart3 },
    { href: '/accounts', label: t('accounts'), icon: Landmark },
    { href: '/budgets', label: t('budgets'), icon: Target },
    { href: '/settings', label: t('settings'), icon: Settings },
  ];

  // 4 Primary Mobile Tabs
  const primaryMobileTabs = [
    { href: '/', label: t('dashboard'), icon: LayoutDashboard },
    { href: '/transactions', label: t('transactions'), icon: ArrowLeftRight },
    { href: '/review', label: t('review'), icon: CheckCircle2 },
    { href: '/accounts', label: t('accounts'), icon: Landmark },
  ];

  // Secondary items shown in mobile menu drawer
  const secondaryMenuItems = [
    { href: '/categories', label: t('categories'), icon: Tag, desc: 'ניהול קטגוריות וצבעים' },
    { href: '/budgets', label: t('budgets'), icon: Target, desc: 'הגדרת יעדי תקציב חודשיים' },
    { href: '/analytics', label: t('analytics'), icon: BarChart3, desc: 'דוחות ופילוח הוצאות' },
    { href: '/settings', label: t('settings'), icon: Settings, desc: 'הגדרות מערכת וקוד נעילה' },
  ];

  const isSecondaryActive = secondaryMenuItems.some((item) => pathname === item.href);

  return (
    <div className="min-h-screen flex bg-dark-bg text-dark-text light:bg-light-bg light:text-light-text selection:bg-brand-primary selection:text-white">
      {/* Desktop Sidebar (Permanently Fixed in Viewport) */}
      <aside className="hidden md:flex flex-col w-60 border-r rtl:border-l rtl:border-r-0 border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface p-3.5 shrink-0 justify-between fixed top-0 bottom-0 start-0 z-30 overflow-y-auto">
        <div className="space-y-5">
          <div className="flex items-center gap-2.5 px-2 pt-1">
            <div className="w-9 h-9 rounded-xl bg-brand-primary flex items-center justify-center text-white font-bold text-lg shadow-md shadow-brand-primary/25">
              FT
            </div>
            <div>
              <div className="font-bold tracking-wide text-base flex items-center gap-1.5">
                FinTrack <span className="text-[10px] px-1.5 py-0.2 rounded bg-brand-primary/20 text-brand-primary font-semibold">v2</span>
              </div>
              <div className="text-[11px] text-dark-text-muted light:text-light-text-muted">ניהול פיננסי חכם</div>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl font-medium text-xs transition-all ${
                    isActive
                      ? 'bg-brand-primary text-white shadow-sm shadow-brand-primary/20 font-semibold'
                      : 'text-dark-text-muted light:text-light-text-muted hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated hover:text-dark-text light:hover:text-light-text'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sync & Quick Controls */}
        <div className="space-y-2.5 pt-3 border-t border-dark-border light:border-light-border">
          <button
            onClick={handleSyncAll}
            disabled={syncing}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated hover:border-brand-primary transition-all text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-brand-cyan ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? t('syncing') : t('syncAll')}</span>
          </button>

          <button
            onClick={lock}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl border border-dark-border light:border-light-border hover:border-rose-500/40 hover:text-rose-400 transition-all text-[11px] font-medium text-dark-text-muted"
            title="נעילת אפליקציה"
          >
            <Lock className="w-3 h-3" />
            <span>{lang === 'he' ? 'נעילת אפליקציה' : 'Lock App'}</span>
          </button>

          <div className="flex items-center justify-between px-1">
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 text-[11px] text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text p-1.5 rounded-lg hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated transition-colors"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{lang === 'he' ? 'English' : 'עברית'}</span>
            </button>

            <button
              onClick={toggleTheme}
              className="flex items-center gap-1.5 text-[11px] text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text p-1.5 rounded-lg hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-brand-amber" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{theme === 'dark' ? t('lightMode') : t('darkMode')}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 md:ms-60 pb-28 md:pb-8 overflow-x-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-dark-border light:border-light-border bg-dark-surface/90 light:bg-light-surface/90 backdrop-blur-md sticky top-0 z-30 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-primary flex items-center justify-center text-white font-bold text-sm shadow-xs">
              FT
            </div>
            <span className="font-bold text-base tracking-tight">FinTrack <span className="text-[10px] text-brand-primary font-mono">v2</span></span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleSyncAll}
              disabled={syncing}
              className="p-2 rounded-xl border border-dark-border/80 light:border-light-border/80 hover:border-brand-primary transition-colors"
              title="סנכרן נתונים"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-brand-cyan ${syncing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl border border-dark-border/80 light:border-light-border/80 text-dark-text-muted"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-brand-amber" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={lock}
              className="p-2 rounded-xl border border-dark-border/80 light:border-light-border/80 text-dark-text-muted hover:text-rose-400"
              title="נעילת מסך"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Dynamic Page Children */}
        <main className="flex-1 p-3.5 sm:p-5 md:p-8 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (5 clean evenly spaced tabs) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 border-t border-dark-border/90 light:border-light-border/90 bg-dark-surface/95 light:bg-light-surface/95 backdrop-blur-xl flex items-center px-3 z-40 justify-around shadow-lg shadow-black/30">
        {primaryMobileTabs.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 py-1 px-2.5 rounded-xl transition-all ${
                isActive
                  ? 'text-brand-primary font-bold'
                  : 'text-dark-text-muted light:text-light-text-muted hover:text-dark-text'
              }`}
            >
              <div className={`p-1 rounded-lg transition-all ${isActive ? 'bg-brand-primary/15 scale-110' : ''}`}>
                <Icon className="w-4 h-4" />
              </div>
              <span className="text-[10px] leading-none tracking-tight">{item.label}</span>
            </Link>
          );
        })}

        {/* More Menu Trigger Button */}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className={`flex flex-col items-center justify-center gap-1 py-1 px-2.5 rounded-xl transition-all ${
            isSecondaryActive || mobileMenuOpen
              ? 'text-brand-primary font-bold'
              : 'text-dark-text-muted light:text-light-text-muted hover:text-dark-text'
          }`}
        >
          <div className={`p-1 rounded-lg transition-all ${isSecondaryActive || mobileMenuOpen ? 'bg-brand-primary/15 scale-110' : ''}`}>
            <Menu className="w-4 h-4" />
          </div>
          <span className="text-[10px] leading-none tracking-tight">תפריט</span>
        </button>
      </nav>

      {/* Mobile "More" Slide-up Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div 
            className="w-full bg-dark-surface light:bg-light-surface border-t border-dark-border light:border-light-border rounded-t-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-250"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-3 border-b border-dark-border light:border-light-border">
              <div className="flex items-center gap-2 font-bold text-base">
                <Menu className="w-4 h-4 text-brand-primary" />
                <span>תפריט נוסף</span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-xl bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text-muted hover:text-dark-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Menu Items Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              {secondaryMenuItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`p-3.5 rounded-2xl border transition-all flex flex-col gap-1.5 ${
                      isActive
                        ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                        : 'border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated hover:border-brand-primary/50'
                    }`}
                  >
                    <Icon className="w-5 h-5 text-brand-primary" />
                    <div>
                      <div className="font-bold text-xs">{item.label}</div>
                      <div className="text-[10px] text-dark-text-muted line-clamp-1">{item.desc}</div>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Quick Actions Footer */}
            <div className="pt-2 border-t border-dark-border light:border-light-border grid grid-cols-3 gap-2 text-center text-xs">
              <button
                onClick={() => { toggleLanguage(); setMobileMenuOpen(false); }}
                className="p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated flex flex-col items-center gap-1"
              >
                <Globe className="w-4 h-4 text-brand-cyan" />
                <span className="text-[11px] font-medium">{lang === 'he' ? 'English' : 'עברית'}</span>
              </button>

              <button
                onClick={() => { toggleTheme(); setMobileMenuOpen(false); }}
                className="p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated flex flex-col items-center gap-1"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4 text-brand-amber" /> : <Moon className="w-4 h-4" />}
                <span className="text-[11px] font-medium">{theme === 'dark' ? 'מצב יום' : 'מצב לילה'}</span>
              </button>

              <button
                onClick={() => { lock(); setMobileMenuOpen(false); }}
                className="p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated flex flex-col items-center gap-1 text-rose-400"
              >
                <Lock className="w-4 h-4" />
                <span className="text-[11px] font-medium">נעילת מסך</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
