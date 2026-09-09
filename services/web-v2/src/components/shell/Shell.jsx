'use client';

import React from 'react';
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
  CheckCircle2
} from 'lucide-react';
import { useApp } from '@/lib/app-context';
import { api } from '@/lib/api';

export default function Shell({ children }) {
  const { t, lang, theme, toggleLanguage, toggleTheme } = useApp();
  const pathname = usePathname();
  const [syncing, setSyncing] = React.useState(false);

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
      <div className="flex-1 flex flex-col min-w-0 md:ms-60 pb-20 md:pb-6 overflow-x-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-primary flex items-center justify-center text-white font-bold text-sm">
              FT
            </div>
            <span className="font-bold">FinTrack v2</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSyncAll}
              disabled={syncing}
              className="p-2 rounded-lg border border-dark-border light:border-light-border hover:border-brand-primary"
            >
              <RefreshCw className={`w-4 h-4 text-brand-cyan ${syncing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={toggleLanguage}
              className="p-2 rounded-lg border border-dark-border light:border-light-border text-xs font-semibold"
            >
              {lang === 'he' ? 'EN' : 'עב'}
            </button>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg border border-dark-border light:border-light-border"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-brand-amber" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Dynamic Page Children */}
        <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-dark-border light:border-light-border bg-dark-surface/95 light:bg-light-surface/95 backdrop-blur-lg flex overflow-x-auto no-scrollbar items-center py-1.5 px-2 gap-1 z-40 justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 p-1.5 rounded-xl text-[10px] font-medium shrink-0 min-w-[48px] transition-colors ${
                isActive ? 'text-brand-primary font-bold' : 'text-dark-text-muted light:text-light-text-muted'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
