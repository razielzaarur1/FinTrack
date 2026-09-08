'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  ArrowLeftRight, 
  PieChart, 
  Landmark, 
  Target, 
  Settings, 
  RefreshCw, 
  Globe, 
  Sun, 
  Moon 
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
    { href: '/analytics', label: t('analytics'), icon: PieChart },
    { href: '/accounts', label: t('accounts'), icon: Landmark },
    { href: '/budgets', label: t('budgets'), icon: Target },
    { href: '/settings', label: t('settings'), icon: Settings },
  ];

  return (
    <div className="min-h-screen flex bg-dark-bg text-dark-text light:bg-light-bg light:text-light-text selection:bg-brand-primary selection:text-white">
      {/* Desktop Sidebar (Fixed Sticky Height) */}
      <aside className="hidden md:flex flex-col w-64 border-r border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface p-4 shrink-0 justify-between sticky top-0 h-screen overflow-y-auto z-20">
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-xl bg-brand-primary flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-brand-primary/25">
              FT
            </div>
            <div>
              <div className="font-bold tracking-wide text-lg flex items-center gap-2">
                FinTrack <span className="text-xs px-1.5 py-0.5 rounded bg-brand-primary/20 text-brand-primary font-medium">v2</span>
              </div>
              <div className="text-xs text-dark-text-muted light:text-light-text-muted">Personal Finance</div>
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
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all ${
                    isActive
                      ? 'bg-brand-primary text-white shadow-md shadow-brand-primary/20'
                      : 'text-dark-text-muted light:text-light-text-muted hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated hover:text-dark-text light:hover:text-light-text'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sync & Quick Controls */}
        <div className="space-y-3 pt-4 border-t border-dark-border light:border-light-border">
          <button
            onClick={handleSyncAll}
            disabled={syncing}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated hover:border-brand-primary transition-all text-sm font-medium"
          >
            <RefreshCw className={`w-4 h-4 text-brand-cyan ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? t('syncing') : t('syncAll')}</span>
          </button>

          <div className="flex items-center justify-between px-1">
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 text-xs text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text p-2 rounded-lg hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated transition-colors"
            >
              <Globe className="w-4 h-4" />
              <span>{lang === 'he' ? 'English' : 'עברית'}</span>
            </button>

            <button
              onClick={toggleTheme}
              className="flex items-center gap-1.5 text-xs text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text p-2 rounded-lg hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-brand-amber" /> : <Moon className="w-4 h-4" />}
              <span>{theme === 'dark' ? t('lightMode') : t('darkMode')}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-6 overflow-x-hidden">
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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-dark-border light:border-light-border bg-dark-surface/95 light:bg-light-surface/95 backdrop-blur-lg flex justify-around items-center py-2 z-40">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg text-xs font-medium transition-colors ${
                isActive ? 'text-brand-primary' : 'text-dark-text-muted light:text-light-text-muted'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
