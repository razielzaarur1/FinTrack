'use client';

import React, { useState, useEffect } from 'react';
import { Target, Plus, Trash2, PiggyBank, AlertCircle, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { formatILS } from '@/lib/formatters';
import { useApp } from '@/lib/app-context';

export default function BudgetsPage() {
  const { lang, t } = useApp();
  const [activeTab, setActiveTab] = useState('budgets');
  const [budgets, setBudgets] = useState([]);
  const [goals, setGoals] = useState([]);
  const [categories, setCategories] = useState([]);

  // Modals
  const [budgetModal, setBudgetModal] = useState(false);
  const [goalModal, setGoalModal] = useState(false);
  const [newBudget, setNewBudget] = useState({ category: '', monthlyLimit: '' });
  const [newGoal, setNewGoal] = useState({ title: '', targetAmount: '', currentAmount: '' });

  const loadData = async () => {
    const [bRes, gRes, cRes] = await Promise.all([
      api.getBudgets(),
      api.getGoals(),
      api.getCategories('expense'),
    ]);
    if (bRes.data) setBudgets(bRes.data);
    if (gRes.data) setGoals(gRes.data);
    if (cRes.data) setCategories(cRes.data.data || []);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveBudget = async (e) => {
    e.preventDefault();
    if (!newBudget.category || !newBudget.monthlyLimit) return;
    await api.saveBudget({
      category: newBudget.category,
      monthlyLimit: parseFloat(newBudget.monthlyLimit),
    });
    setBudgetModal(false);
    setNewBudget({ category: '', monthlyLimit: '' });
    loadData();
  };

  const handleDeleteBudget = async (id) => {
    await api.deleteBudget(id);
    setBudgets(budgets.filter((b) => b.id !== id));
  };

  const handleSaveGoal = async (e) => {
    e.preventDefault();
    if (!newGoal.title || !newGoal.targetAmount) return;
    await api.createGoal({
      title: newGoal.title,
      targetAmount: parseFloat(newGoal.targetAmount),
      currentAmount: parseFloat(newGoal.currentAmount || 0),
    });
    setGoalModal(false);
    setNewGoal({ title: '', targetAmount: '', currentAmount: '' });
    loadData();
  };

  const handleDeleteGoal = async (id) => {
    await api.deleteGoal(id);
    setGoals(goals.filter((g) => g.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">
            {t('budgets')}
          </h1>
          <p className="text-xs text-dark-text-muted light:text-light-text-muted">
            {lang === 'he' ? 'שליטה בהוצאות לפי קטגוריות ומעקב יעדי חיסכון' : 'Expense envelope limits and savings goals milestones'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'budgets' ? (
            <button
              onClick={() => setBudgetModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-primary text-white font-semibold text-xs shadow-md shadow-brand-primary/20 hover:bg-brand-primary-hover"
            >
              <Plus className="w-4 h-4" />
              <span>{lang === 'he' ? 'הוסף תקציב' : 'Add Budget'}</span>
            </button>
          ) : (
            <button
              onClick={() => setGoalModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-primary text-white font-semibold text-xs shadow-md shadow-brand-primary/20 hover:bg-brand-primary-hover"
            >
              <Plus className="w-4 h-4" />
              <span>{lang === 'he' ? 'יעד חדש' : 'New Goal'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-dark-border light:border-light-border gap-4 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('budgets')}
          className={`pb-3 border-b-2 transition-all ${
            activeTab === 'budgets' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
          }`}
        >
          {lang === 'he' ? 'תקציבים חודשיים' : 'Monthly Budgets'} ({budgets.length})
        </button>
        <button
          onClick={() => setActiveTab('goals')}
          className={`pb-3 border-b-2 transition-all ${
            activeTab === 'goals' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
          }`}
        >
          {lang === 'he' ? 'יעדי חיסכון' : 'Savings Goals'} ({goals.length})
        </button>
      </div>

      {/* Tab 1: Budgets */}
      {activeTab === 'budgets' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {budgets.length === 0 ? (
            <div className="col-span-full py-16 text-center text-xs text-dark-text-muted light:text-light-text-muted">
              {lang === 'he' ? 'לא הוגדרו תקציבים עדיין. לחץ למעלה להוספת תקציב ראשון.' : 'No budgets set yet. Click above to add your first budget.'}
            </div>
          ) : (
            budgets.map((b) => (
              <div key={b.id} className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-dark-text light:text-light-text">{b.category}</span>
                  <button onClick={() => handleDeleteBudget(b.id)} className="text-brand-expense p-1 hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated rounded transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-xl font-bold text-dark-text light:text-light-text">{formatILS(b.monthly_limit || b.monthlyLimit)}</div>
                <div className="text-xs text-dark-text-muted light:text-light-text-muted">{lang === 'he' ? 'מגבלה חודשית' : 'Monthly Limit'}</div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 2: Goals */}
      {activeTab === 'goals' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {goals.length === 0 ? (
            <div className="col-span-full py-16 text-center text-xs text-dark-text-muted light:text-light-text-muted">
              {lang === 'he' ? 'לא הוגדרו יעדי חיסכון עדיין.' : 'No savings goals created yet.'}
            </div>
          ) : (
            goals.map((g) => {
              const target = parseFloat(g.targetAmount || g.target_amount);
              const current = parseFloat(g.currentAmount || g.current_amount || 0);
              const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

              return (
                <div key={g.id} className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-dark-text light:text-light-text">{g.title}</span>
                    <button onClick={() => handleDeleteGoal(g.id)} className="text-brand-expense p-1 hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated rounded transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex justify-between items-baseline text-xs">
                    <span className="text-base font-bold text-dark-text light:text-light-text">{formatILS(current)}</span>
                    <span className="text-dark-text-muted light:text-light-text-muted">יעד: {formatILS(target)}</span>
                  </div>
                  <div className="w-full bg-dark-surface-elevated light:bg-light-surface-elevated rounded-full h-2 overflow-hidden">
                    <div className="bg-brand-primary h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[11px] text-dark-text-muted light:text-light-text-muted text-left rtl:text-right">{pct}% הושלם</div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Add Budget Modal */}
      {budgetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form onSubmit={handleSaveBudget} className="w-full max-w-md bg-dark-surface light:bg-light-surface rounded-2xl border border-dark-border light:border-light-border p-6 space-y-4">
            <h3 className="font-bold text-lg text-dark-text light:text-light-text">{lang === 'he' ? 'הוספת תקציב חודשי' : 'Add Monthly Budget'}</h3>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">{t('category')}</label>
              <select
                required
                value={newBudget.category}
                onChange={(e) => setNewBudget({ ...newBudget, category: e.target.value })}
                className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-sm focus:outline-none focus:border-brand-primary"
              >
                <option value="">{lang === 'he' ? 'בחר קטגוריה...' : 'Select category...'}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">{lang === 'he' ? 'מגבלה חודשית (₪)' : 'Monthly Limit (₪)'}</label>
              <input
                type="number"
                required
                step="50"
                value={newBudget.monthlyLimit}
                onChange={(e) => setNewBudget({ ...newBudget, monthlyLimit: e.target.value })}
                placeholder="2500"
                className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-sm focus:outline-none focus:border-brand-primary"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setBudgetModal(false)} className="px-4 py-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text text-xs font-semibold hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated transition-colors">
                {t('cancel')}
              </button>
              <button type="submit" className="flex-1 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-semibold hover:bg-brand-primary-hover shadow-md shadow-brand-primary/20 transition-colors">
                {t('save')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Goal Modal */}
      {goalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form onSubmit={handleSaveGoal} className="w-full max-w-md bg-dark-surface light:bg-light-surface rounded-2xl border border-dark-border light:border-light-border p-6 space-y-4">
            <h3 className="font-bold text-lg text-dark-text light:text-light-text">{lang === 'he' ? 'הוספת יעד חיסכון' : 'Add Savings Goal'}</h3>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">{lang === 'he' ? 'שם היעד' : 'Goal Title'}</label>
              <input
                type="text"
                required
                value={newGoal.title}
                onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
                placeholder="קרן חירום / חופשה"
                className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-sm focus:outline-none focus:border-brand-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">{lang === 'he' ? 'סכום יעד (₪)' : 'Target Amount (₪)'}</label>
              <input
                type="number"
                required
                value={newGoal.targetAmount}
                onChange={(e) => setNewGoal({ ...newGoal, targetAmount: e.target.value })}
                placeholder="50000"
                className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-sm focus:outline-none focus:border-brand-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">{lang === 'he' ? 'סכום קיים כעת (₪)' : 'Initial Amount (₪)'}</label>
              <input
                type="number"
                value={newGoal.currentAmount}
                onChange={(e) => setNewGoal({ ...newGoal, currentAmount: e.target.value })}
                placeholder="5000"
                className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-sm focus:outline-none focus:border-brand-primary"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setGoalModal(false)} className="px-4 py-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text text-xs font-semibold hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated transition-colors">
                {t('cancel')}
              </button>
              <button type="submit" className="flex-1 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-semibold hover:bg-brand-primary-hover shadow-md shadow-brand-primary/20 transition-colors">
                {t('save')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
