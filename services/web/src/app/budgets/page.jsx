'use client';

import React, { useState, useEffect } from 'react';
import {
  PieChart,
  Target,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  PiggyBank,
  TrendingUp,
  Shield,
  Plane,
  Car,
  Home,
  Sparkles,
  Calendar,
  X,
  ChevronLeft,
  DollarSign,
  ArrowUpRight,
} from 'lucide-react';
import { getBudgets, getGoals, formatILS, formatPercent, formatDate } from '../../lib/api';
import { CATEGORIES } from '../../lib/types';
import BudgetProgressBar from '../../components/dashboard/BudgetProgressBar';

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState([]);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('budgets'); // 'budgets' | 'goals'

  // Edit / Add Budget Modal State
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState(null);
  const [budgetCategory, setBudgetCategory] = useState(CATEGORIES[0]?.name || 'סופרמרקט ומזון');
  const [budgetLimit, setBudgetLimit] = useState('');
  const [budgetAlertThreshold, setBudgetAlertThreshold] = useState(85);

  // Edit / Add Goal Modal State
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTargetAmount, setGoalTargetAmount] = useState('');
  const [goalCurrentAmount, setGoalCurrentAmount] = useState('');
  const [goalTargetDate, setGoalTargetDate] = useState('');
  const [goalCategory, setGoalCategory] = useState('emergency'); // 'emergency' | 'vacation' | 'car' | 'investment'

  // Deposit Modal State
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [depositGoal, setDepositGoal] = useState(null);
  const [depositAmount, setDepositAmount] = useState('');

  useEffect(() => {
    async function loadBudgetsAndGoals() {
      try {
        const [bRes, gRes] = await Promise.all([getBudgets(), getGoals()]);
        setBudgets(bRes || []);
        setGoals(gRes || []);
      } catch (e) {
        console.error('Failed to load budgets & goals:', e);
      } finally {
        setLoading(false);
      }
    }
    loadBudgetsAndGoals();
  }, []);

  // Budget Calculations
  const totalBudgeted = budgets.reduce((sum, b) => sum + (b.monthlyLimit || 0), 0);
  const totalSpent = budgets.reduce((sum, b) => sum + (b.currentSpent || 0), 0);
  const totalRemaining = Math.max(0, totalBudgeted - totalSpent);
  const overallPercent = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;

  // Goals Calculations
  const totalGoalsTarget = goals.reduce((sum, g) => sum + (g.targetAmount || 0), 0);
  const totalGoalsSaved = goals.reduce((sum, g) => sum + (g.currentAmount || 0), 0);
  const overallGoalsPercent = totalGoalsTarget > 0 ? (totalGoalsSaved / totalGoalsTarget) * 100 : 0;

  // Handlers for Budgets
  const handleOpenAddBudget = () => {
    setEditingBudget(null);
    setBudgetCategory(CATEGORIES[0]?.name || 'סופרמרקט ומזון');
    setBudgetLimit('');
    setBudgetAlertThreshold(85);
    setIsBudgetModalOpen(true);
  };

  const handleOpenEditBudget = (budget) => {
    setEditingBudget(budget);
    setBudgetCategory(budget.category);
    setBudgetLimit(budget.monthlyLimit.toString());
    setBudgetAlertThreshold(budget.alertThreshold || 85);
    setIsBudgetModalOpen(true);
  };

  const handleSaveBudget = (e) => {
    e.preventDefault();
    if (!budgetLimit) return;

    const limitNum = parseFloat(budgetLimit);
    if (editingBudget) {
      setBudgets((prev) =>
        prev.map((b) =>
          b.id === editingBudget.id
            ? { ...b, monthlyLimit: limitNum, alertThreshold: budgetAlertThreshold }
            : b
        )
      );
    } else {
      const newBudget = {
        id: `b-${Date.now()}`,
        category: budgetCategory,
        monthlyLimit: limitNum,
        currentSpent: 0,
        currency: 'ILS',
        alertThreshold: budgetAlertThreshold,
      };
      setBudgets((prev) => [...prev, newBudget]);
    }
    setIsBudgetModalOpen(false);
  };

  const handleDeleteBudget = (id) => {
    setBudgets((prev) => prev.filter((b) => b.id !== id));
  };

  // Handlers for Goals
  const handleOpenAddGoal = () => {
    setEditingGoal(null);
    setGoalTitle('');
    setGoalTargetAmount('');
    setGoalCurrentAmount('');
    setGoalTargetDate('2027-01-01');
    setGoalCategory('emergency');
    setIsGoalModalOpen(true);
  };

  const handleSaveGoal = (e) => {
    e.preventDefault();
    if (!goalTitle || !goalTargetAmount) return;

    const targetNum = parseFloat(goalTargetAmount);
    const currentNum = parseFloat(goalCurrentAmount) || 0;

    if (editingGoal) {
      setGoals((prev) =>
        prev.map((g) =>
          g.id === editingGoal.id
            ? {
                ...g,
                title: goalTitle,
                targetAmount: targetNum,
                currentAmount: currentNum,
                targetDate: goalTargetDate,
                category: goalCategory,
              }
            : g
        )
      );
    } else {
      const newGoal = {
        id: `g-${Date.now()}`,
        title: goalTitle,
        targetAmount: targetNum,
        currentAmount: currentNum,
        currency: 'ILS',
        targetDate: goalTargetDate,
        category: goalCategory,
      };
      setGoals((prev) => [...prev, newGoal]);
    }
    setIsGoalModalOpen(false);
  };

  const handleOpenDeposit = (goal) => {
    setDepositGoal(goal);
    setDepositAmount('');
    setIsDepositModalOpen(true);
  };

  const handleSaveDeposit = (e) => {
    e.preventDefault();
    if (!depositGoal || !depositAmount) return;

    const added = parseFloat(depositAmount);
    setGoals((prev) =>
      prev.map((g) =>
        g.id === depositGoal.id
          ? { ...g, currentAmount: (g.currentAmount || 0) + added }
          : g
      )
    );
    setIsDepositModalOpen(false);
  };

  const getGoalIcon = (cat) => {
    switch (cat) {
      case 'vacation':
        return <Plane className="w-5 h-5 text-amber-400" />;
      case 'car':
        return <Car className="w-5 h-5 text-brand-cyan" />;
      case 'emergency':
        return <Shield className="w-5 h-5 text-emerald-400" />;
      default:
        return <PiggyBank className="w-5 h-5 text-brand-blue-light" />;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* ── 1. HEADER & TABS ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-5 sm:p-6 rounded-3xl border border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              תקציבים ויעדי חיסכון
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/30">
              חודש נוכחי
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            הגדרת מסגרות הוצאה חודשיות לפי קטגוריות ומעקב יעדי חיסכון לטווח קצר וארוך
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-2 p-1 rounded-2xl bg-navy-950/60 border border-white/10 text-xs">
          <button
            onClick={() => setActiveTab('budgets')}
            className={`px-4 py-2 rounded-xl font-bold transition-all ${
              activeTab === 'budgets'
                ? 'bg-brand-blue text-white shadow-glow-blue'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            תקציבים חודשיים ({budgets.length})
          </button>
          <button
            onClick={() => setActiveTab('goals')}
            className={`px-4 py-2 rounded-xl font-bold transition-all ${
              activeTab === 'goals'
                ? 'bg-brand-blue text-white shadow-glow-blue'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            יעדי חיסכון ({goals.length})
          </button>
        </div>
      </div>

      {/* ── 2. BUDGETS TAB CONTENT ────────────────────────────────────────── */}
      {activeTab === 'budgets' && (
        <div className="space-y-6 animate-fade-in">
          {/* Monthly Overview Header Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Budgeted */}
            <div className="glass-card p-4 sm:p-5 rounded-2xl border border-white/10 flex flex-col justify-between">
              <span className="text-xs text-slate-400 block mb-1">סה״כ תקציב חודשי מוגדר</span>
              <div className="text-xl sm:text-2xl font-bold text-white num-he">
                {formatILS(totalBudgeted)}
              </div>
              <div className="text-[11px] text-slate-400 mt-2">
                בכל {budgets.length} הקטגוריות
              </div>
            </div>

            {/* Total Spent */}
            <div className="glass-card p-4 sm:p-5 rounded-2xl border border-white/10 flex flex-col justify-between">
              <span className="text-xs text-slate-400 block mb-1">סה״כ הוצאות בפועל</span>
              <div className="text-xl sm:text-2xl font-bold text-rose-400 num-he">
                {formatILS(totalSpent)}
              </div>
              <div className="text-[11px] text-slate-400 mt-2">
                סונכרן מכרטיסי האשראי והעו״ש
              </div>
            </div>

            {/* Remaining */}
            <div className="glass-card p-4 sm:p-5 rounded-2xl border border-white/10 flex flex-col justify-between">
              <span className="text-xs text-slate-400 block mb-1">יתרה פנויה להוצאה</span>
              <div className="text-xl sm:text-2xl font-bold text-emerald-400 num-he">
                {formatILS(totalRemaining)}
              </div>
              <div className="text-[11px] text-emerald-400 mt-2">
                במסגרת התקציב החודשי
              </div>
            </div>

            {/* Overall Usage % */}
            <div className="glass-card p-4 sm:p-5 rounded-2xl border border-white/10 flex flex-col justify-between">
              <span className="text-xs text-slate-400 block mb-1">אחוז ניצול כולל</span>
              <div className="text-xl sm:text-2xl font-bold text-brand-cyan num-he">
                {formatPercent(overallPercent)}
              </div>
              <div className="w-full h-2 rounded-full bg-navy-900 border border-white/10 overflow-hidden mt-2">
                <div
                  className={`h-full rounded-full transition-all ${
                    overallPercent >= 100
                      ? 'bg-rose-500'
                      : overallPercent >= 80
                      ? 'bg-amber-500'
                      : 'bg-brand-cyan'
                  }`}
                  style={{ width: `${Math.min(100, overallPercent)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">תקציב לפי קטגוריות</h2>
            <button
              onClick={handleOpenAddBudget}
              className="px-4 py-2 rounded-xl glass-button text-xs font-semibold flex items-center gap-1.5 shadow-glow-blue"
            >
              <Plus className="w-4 h-4" />
              <span>הגדר תקציב לקטגוריה</span>
            </button>
          </div>

          {/* Category Budgets Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {budgets.map((b) => (
              <div
                key={b.id}
                className="glass-card p-5 rounded-3xl border border-white/10 flex flex-col justify-between hover:border-brand-blue/40 transition-all group"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2.5 rounded-2xl bg-brand-blue/15 text-brand-blue-light border border-brand-blue/30">
                        <PieChart className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white group-hover:text-brand-blue-light transition-colors">
                          {b.category}
                        </h3>
                        <span className="text-[10px] text-slate-400">
                          התראה מעל {b.alertThreshold || 80}%
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleOpenEditBudget(b)}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                        title="ערוך תקציב"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteBudget(b.id)}
                        className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                        title="מחק תקציב"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Visual Progress Bar */}
                  <div className="mt-4 mb-2">
                    <BudgetProgressBar
                      spent={b.currentSpent}
                      limit={b.monthlyLimit}
                      warningThreshold={b.alertThreshold || 80}
                      height="h-3"
                    />
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
                  <span>חודש ספטמבר 2026</span>
                  <span className="text-brand-cyan font-medium">מעקב פעיל</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 3. SAVINGS GOALS TAB CONTENT ──────────────────────────────────── */}
      {activeTab === 'goals' && (
        <div className="space-y-6 animate-fade-in">
          {/* Goals Overview Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass-card p-4 sm:p-5 rounded-2xl border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 block mb-1">סה״כ יעד חסכונות</span>
                <div className="text-xl sm:text-2xl font-bold text-white num-he">
                  {formatILS(totalGoalsTarget)}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-brand-blue/20 text-brand-cyan">
                <Target className="w-5 h-5" />
              </div>
            </div>

            <div className="glass-card p-4 sm:p-5 rounded-2xl border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 block mb-1">נצבר עד כה</span>
                <div className="text-xl sm:text-2xl font-bold text-emerald-400 num-he">
                  {formatILS(totalGoalsSaved)}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400">
                <PiggyBank className="w-5 h-5" />
              </div>
            </div>

            <div className="glass-card p-4 sm:p-5 rounded-2xl border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 block mb-1">התקדמות כוללת</span>
                <div className="text-xl sm:text-2xl font-bold text-brand-cyan num-he">
                  {formatPercent(overallGoalsPercent)}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-cyan-500/20 text-brand-cyan">
                <Sparkles className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">יעדי החיסכון שלך</h2>
            <button
              onClick={handleOpenAddGoal}
              className="px-4 py-2 rounded-xl glass-button text-xs font-semibold flex items-center gap-1.5 shadow-glow-blue"
            >
              <Plus className="w-4 h-4" />
              <span>הוסף יעד חדש</span>
            </button>
          </div>

          {/* Goals Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {goals.map((g) => {
              const percent = g.targetAmount > 0 ? (g.currentAmount / g.targetAmount) * 100 : 0;
              const remainingAmount = Math.max(0, g.targetAmount - g.currentAmount);

              // Calculate monthly pace
              const targetDateObj = new Date(g.targetDate || '2027-01-01');
              const now = new Date();
              const diffMonths = Math.max(
                1,
                (targetDateObj.getFullYear() - now.getFullYear()) * 12 +
                  (targetDateObj.getMonth() - now.getMonth())
              );
              const monthlyPace = remainingAmount / diffMonths;

              return (
                <div
                  key={g.id}
                  className="glass-card p-5 sm:p-6 rounded-3xl border border-white/10 flex flex-col justify-between hover:border-brand-blue/40 transition-all group"
                >
                  <div>
                    {/* Goal Header */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-3 rounded-2xl bg-navy-800/90 border border-white/10 shadow-sm">
                          {getGoalIcon(g.category)}
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-white group-hover:text-brand-blue-light transition-colors">
                            {g.title}
                          </h3>
                          <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            <span>יעד: {formatDate(g.targetDate)}</span>
                            <span>({diffMonths} חודשים)</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-left">
                        <span className="text-xs font-bold text-brand-cyan num-he">
                          {formatPercent(percent)}
                        </span>
                      </div>
                    </div>

                    {/* Target Numbers */}
                    <div className="p-3.5 rounded-2xl bg-navy-950/60 border border-white/10 mb-4 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px]">נצבר</span>
                        <span className="font-bold text-emerald-400 num-he text-sm">
                          {formatILS(g.currentAmount)}
                        </span>
                      </div>
                      <div className="text-left">
                        <span className="text-slate-400 block text-[10px]">מתוך יעד</span>
                        <span className="font-bold text-white num-he text-sm">
                          {formatILS(g.targetAmount)}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-3 rounded-full bg-navy-900 border border-white/10 overflow-hidden mb-3 p-[1px]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand-blue to-brand-cyan transition-all duration-500 shadow-glow-cyan"
                        style={{ width: `${Math.min(100, percent)}%` }}
                      />
                    </div>

                    {/* Monthly Pace Callout */}
                    <div className="text-[11px] text-slate-300 flex items-center justify-between">
                      <span>קצב חיסכון מומלץ:</span>
                      <span className="font-bold text-amber-300 num-he">
                        {formatILS(monthlyPace)} / חודש
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-4 mt-4 border-t border-white/10 flex items-center gap-2">
                    <button
                      onClick={() => handleOpenDeposit(g)}
                      className="flex-1 py-2 px-3 rounded-xl glass-button text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>עדכן הפקדה</span>
                    </button>

                    <button
                      onClick={() => {
                        setEditingGoal(g);
                        setGoalTitle(g.title);
                        setGoalTargetAmount(g.targetAmount.toString());
                        setGoalCurrentAmount(g.currentAmount.toString());
                        setGoalTargetDate(g.targetDate);
                        setGoalCategory(g.category);
                        setIsGoalModalOpen(true);
                      }}
                      className="p-2 rounded-xl glass-button-secondary text-slate-400 hover:text-white"
                      title="ערוך יעד"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 4. ADD / EDIT BUDGET MODAL ─────────────────────────────────────── */}
      {isBudgetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="relative w-full max-w-md rounded-3xl bg-navy-900 border border-white/15 shadow-2xl p-6 text-right">
            <button
              onClick={() => setIsBudgetModalOpen(false)}
              className="absolute top-4 left-4 p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white mb-1">
              {editingBudget ? 'עריכת תקציב קטגוריה' : 'הגדרת תקציב חדש'}
            </h3>
            <p className="text-xs text-slate-400 mb-5">
              הגדרת מגבלת הוצאה חודשית כדי לקבל התראות לפני חריגה
            </p>

            <form onSubmit={handleSaveBudget} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">קטגוריה</label>
                <select
                  value={budgetCategory}
                  onChange={(e) => setBudgetCategory(e.target.value)}
                  disabled={!!editingBudget}
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm text-white bg-navy-900"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.name} className="bg-navy-900 text-white">
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  מגבלת תקציב חודשית (₪)
                </label>
                <input
                  type="number"
                  step="50"
                  required
                  value={budgetLimit}
                  onChange={(e) => setBudgetLimit(e.target.value)}
                  placeholder="לדוגמה: 2500"
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm text-white num-he font-bold"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                  <span>סף התראה לפני חריגה</span>
                  <span className="font-bold text-brand-cyan">{budgetAlertThreshold}%</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="100"
                  step="5"
                  value={budgetAlertThreshold}
                  onChange={(e) => setBudgetAlertThreshold(parseInt(e.target.value, 10))}
                  className="w-full accent-brand-blue"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl glass-button text-xs font-semibold"
                >
                  שמור תקציב
                </button>
                <button
                  type="button"
                  onClick={() => setIsBudgetModalOpen(false)}
                  className="py-2.5 px-4 rounded-xl glass-button-secondary text-xs font-medium hover:text-white"
                >
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 5. ADD / EDIT SAVINGS GOAL MODAL ──────────────────────────────── */}
      {isGoalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="relative w-full max-w-md rounded-3xl bg-navy-900 border border-white/15 shadow-2xl p-6 text-right">
            <button
              onClick={() => setIsGoalModalOpen(false)}
              className="absolute top-4 left-4 p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white mb-1">
              {editingGoal ? 'עריכת יעד חיסכון' : 'הגדרת יעד חיסכון חדש'}
            </h3>
            <p className="text-xs text-slate-400 mb-5">
              מעקב יעדים פיננסיים, קרן חירום, חופשה ורכישות גדולות
            </p>

            <form onSubmit={handleSaveGoal} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">שם היעד</label>
                <input
                  type="text"
                  required
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                  placeholder="לדוגמה: קרן חירום, חופשה ביפן"
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">סוג יעד</label>
                <select
                  value={goalCategory}
                  onChange={(e) => setGoalCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm text-white bg-navy-900"
                >
                  <option value="emergency">קרן חירום והגנה</option>
                  <option value="vacation">חופשה ונסיעות</option>
                  <option value="car">רכב ותחבורה</option>
                  <option value="investment">השקעות ונדל״ן</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    סכום יעד (₪)
                  </label>
                  <input
                    type="number"
                    step="100"
                    required
                    value={goalTargetAmount}
                    onChange={(e) => setGoalTargetAmount(e.target.value)}
                    placeholder="50,000"
                    className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm text-white num-he font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    נצבר כעת (₪)
                  </label>
                  <input
                    type="number"
                    step="100"
                    value={goalCurrentAmount}
                    onChange={(e) => setGoalCurrentAmount(e.target.value)}
                    placeholder="0"
                    className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm text-white num-he font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  תאריך יעד לסיום
                </label>
                <input
                  type="date"
                  value={goalTargetDate}
                  onChange={(e) => setGoalTargetDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm text-white bg-navy-900"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl glass-button text-xs font-semibold"
                >
                  שמור יעד
                </button>
                <button
                  type="button"
                  onClick={() => setIsGoalModalOpen(false)}
                  className="py-2.5 px-4 rounded-xl glass-button-secondary text-xs font-medium hover:text-white"
                >
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 6. UPDATE DEPOSIT MODAL ────────────────────────────────────────── */}
      {isDepositModalOpen && depositGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="relative w-full max-w-md rounded-3xl bg-navy-900 border border-white/15 shadow-2xl p-6 text-right">
            <button
              onClick={() => setIsDepositModalOpen(false)}
              className="absolute top-4 left-4 p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white mb-1">
              עדכון הפקדה ליעד: {depositGoal.title}
            </h3>
            <p className="text-xs text-slate-400 mb-5">
              הוסף סכום שנחסך או הופקד בחשבון החיסכון
            </p>

            <form onSubmit={handleSaveDeposit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  סכום להוספה (₪)
                </label>
                <input
                  type="number"
                  step="50"
                  required
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="500"
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm text-white num-he font-bold"
                />
              </div>

              {/* Quick preset buttons */}
              <div className="flex items-center gap-2">
                {[200, 500, 1000, 2500].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setDepositAmount(amt.toString())}
                    className="flex-1 py-1.5 rounded-lg bg-navy-800 text-slate-300 hover:text-white hover:bg-navy-700 text-xs font-semibold num-he border border-white/10"
                  >
                    +₪{amt}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl glass-button text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>אשר הפקדה</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsDepositModalOpen(false)}
                  className="py-2.5 px-4 rounded-xl glass-button-secondary text-xs font-medium hover:text-white"
                >
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
