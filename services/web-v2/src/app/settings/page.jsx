'use client';

import React, { useState, useEffect } from 'react';
import { 
  Tag, 
  Plus, 
  Trash2, 
  Check, 
  Download, 
  Settings as SettingsIcon,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  CreditCard,
  Upload,
  FileCode,
  Sparkles,
  X,
  Layers,
  Link2,
  Edit2,
  AlertTriangle,
  Send,
  Bell,
  Eye,
  EyeOff,
  Clock,
  ShieldCheck,
  HelpCircle,
  ExternalLink,
  RotateCcw
} from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import CategoryBadge from '@/components/common/CategoryBadge';
import { CATEGORIES_DATA, setDynamicCategories } from '@/lib/categories';
import { generateDesignSystemPrompt } from '@/lib/designSystemPrompt';
import { normalizeCategorySvg, getIconSvgMarkup } from '@/lib/svg-normalizer';
import { formatILS, formatDate, cleanSpacedHebrew } from '@/lib/formatters';

export default function SettingsPage() {
  const { lang, t, theme, toggleTheme, toggleLanguage } = useApp();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Reset Categories to Factory Default State
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');

  // Danger Zone State
  const [dangerAction, setDangerAction] = useState(null); // 'transactions' | 'all_data' | null
  const [dangerInput, setDangerInput] = useState('');
  const [dangerLoading, setDangerLoading] = useState(false);
  const [dangerError, setDangerError] = useState('');
  const [dangerSuccess, setDangerSuccess] = useState('');

  // Scraping range settings
  const [scrapeDaysBack, setScrapeDaysBack] = useState(30);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Monthly Billing Cycle Start Day
  const [monthStartDay, setMonthStartDay] = useState(10);
  const [monthSaved, setMonthSaved] = useState(false);

  // Telegram & Real-time Notification States
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [tmaBaseUrl, setTmaBaseUrl] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [botStatus, setBotStatus] = useState(null);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [telegramSaved, setTelegramSaved] = useState(false);

  // Alert Toggles & Anomaly Limits
  const [notifyOnNew, setNotifyOnNew] = useState(true);
  const [notifyOnAnomaly, setNotifyOnAnomaly] = useState(true);
  const [notifyOnBudget, setNotifyOnBudget] = useState(true);
  const [anomalyMinAmount, setAnomalyMinAmount] = useState(300);
  const [notifyMaxAgeDays, setNotifyMaxAgeDays] = useState(7);

  // Bank Account CC Billing Anomaly Flags
  const [flagLowCcBillings, setFlagLowCcBillings] = useState(true);
  const [ccBillingMinThreshold, setCcBillingMinThreshold] = useState(500);
  const [ccBillingLookbackDays, setCcBillingLookbackDays] = useState(60);
  const [scanningCcAnomalies, setScanningCcAnomalies] = useState(false);
  const [scanCcResult, setScanCcResult] = useState(null);

  // CC Reconciliation & Matching States
  const [autoReconcileCc, setAutoReconcileCc] = useState(true);
  const [ccAutoScoreThreshold, setCcAutoScoreThreshold] = useState(85);
  const [ccManualScoreThreshold, setCcManualScoreThreshold] = useState(35);
  const [ccCustomPatterns, setCcCustomPatterns] = useState([]);
  const [newCcPattern, setNewCcPattern] = useState('');
  const [ccSettingsSaved, setCcSettingsSaved] = useState(false);
  const [runningCcScanAndMatch, setRunningCcScanAndMatch] = useState(false);
  const [ccScanAndMatchResult, setCcScanAndMatchResult] = useState(null);
  const [detectedCcMerchants, setDetectedCcMerchants] = useState([]);
  const [loadingDetectedMerchants, setLoadingDetectedMerchants] = useState(false);

  // Auto-Scrape Schedule States (in HOURS, minimum 3h safety limit)
  const [autoScrapeEnabled, setAutoScrapeEnabled] = useState(true);
  const [scrapeIntervalCardsHours, setScrapeIntervalCardsHours] = useState(4);
  const [scrapeIntervalBanksHours, setScrapeIntervalBanksHours] = useState(8);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);

  // Gemini AI & Receipt Analysis States
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [enableAiAnalysis, setEnableAiAnalysis] = useState(true);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [savingGemini, setSavingGemini] = useState(false);
  const [geminiSaved, setGeminiSaved] = useState(false);
  const [testingGemini, setTestingGemini] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState(null);

  // Category Tree UI State
  const [activeTab, setActiveTab] = useState('expense'); // 'expense' | 'income'
  const [expandedCats, setExpandedCats] = useState(new Set(['exp_household', 'exp_shopping']));

  // Add/Edit Category Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [modalParentId, setModalParentId] = useState(null);
  const [modalParentName, setModalParentName] = useState('');
  const [formName, setFormName] = useState('');
  const [formNameEn, setFormNameEn] = useState('');
  const [formType, setFormType] = useState('expense');
  const [formColor, setFormColor] = useState('#6366f1');
  const [formIcon, setFormIcon] = useState('tag');
  const [formSvg, setFormSvg] = useState('');
  const [submittingCat, setSubmittingCat] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
  const [reclassifyResult, setReclassifyResult] = useState(null);

  const checkBotStatus = async () => {
    try {
      const res = await api.getTelegramStatus();
      if (res.data) {
        setBotStatus(res.data);
      }
    } catch (e) {}
  };

  const loadSettings = async () => {
    try {
      const res = await api.getSystemSettings();
      if (res.data?.settings) {
        const s = res.data.settings;
        if (s.scrapeDaysBack) setScrapeDaysBack(parseInt(s.scrapeDaysBack, 10) || 30);
        if (s.monthStartDay) setMonthStartDay(parseInt(s.monthStartDay, 10) || 10);
        if (s.telegramBotToken) setTelegramBotToken(s.telegramBotToken);
        if (s.telegramChatId) setTelegramChatId(String(s.telegramChatId));
        if (s.tmaBaseUrl) setTmaBaseUrl(s.tmaBaseUrl);
        if (s.notifyOnNewTransactions !== undefined) setNotifyOnNew(s.notifyOnNewTransactions);
        if (s.notifyOnAnomaly !== undefined) setNotifyOnAnomaly(s.notifyOnAnomaly);
        if (s.notifyOnBudgetExceeded !== undefined) setNotifyOnBudget(s.notifyOnBudgetExceeded);
        if (s.anomalyMinAmount !== undefined) setAnomalyMinAmount(parseInt(s.anomalyMinAmount, 10) || 300);
        if (s.notifyMaxAgeDays !== undefined) setNotifyMaxAgeDays(parseInt(s.notifyMaxAgeDays, 10) || 7);
        if (s.flagLowCcBillings !== undefined) setFlagLowCcBillings(s.flagLowCcBillings);
        if (s.ccBillingMinThreshold !== undefined) setCcBillingMinThreshold(parseInt(s.ccBillingMinThreshold, 10) || 500);
        if (s.ccBillingLookbackDays !== undefined) setCcBillingLookbackDays(parseInt(s.ccBillingLookbackDays, 10) || 60);
        if (s.autoReconcileCcEnabled !== undefined) setAutoReconcileCc(s.autoReconcileCcEnabled);
        if (s.ccAutoScoreThreshold !== undefined) setCcAutoScoreThreshold(parseInt(s.ccAutoScoreThreshold, 10) || 85);
        if (s.ccManualScoreThreshold !== undefined) setCcManualScoreThreshold(parseInt(s.ccManualScoreThreshold, 10) || 35);
        if (Array.isArray(s.ccCustomPatterns)) setCcCustomPatterns(s.ccCustomPatterns);
        if (s.autoScrapeEnabled !== undefined) setAutoScrapeEnabled(s.autoScrapeEnabled);
        if (s.scrapeIntervalCreditCardsHours !== undefined) {
          setScrapeIntervalCardsHours(Math.max(3, parseFloat(s.scrapeIntervalCreditCardsHours) || 4));
        }
        if (s.scrapeIntervalBanksHours !== undefined) {
          setScrapeIntervalBanksHours(Math.max(3, parseFloat(s.scrapeIntervalBanksHours) || 8));
        }
        if (s.geminiApiKey) setGeminiApiKey(s.geminiApiKey);
        if (s.enableAiAnalysis !== undefined) setEnableAiAnalysis(s.enableAiAnalysis);
      }
      await checkBotStatus();
      await fetchDetectedCcMerchants();
    } catch (err) {
      console.error('Failed to load system settings:', err);
    }
  };

  const fetchDetectedCcMerchants = async () => {
    setLoadingDetectedMerchants(true);
    try {
      const res = await api.getDetectedCcMerchants();
      if (Array.isArray(res.data?.data)) {
        setDetectedCcMerchants(res.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch detected CC merchants:', err);
    } finally {
      setLoadingDetectedMerchants(false);
    }
  };

  const handleScanCcAnomalies = async () => {
    setScanningCcAnomalies(true);
    setScanCcResult(null);
    try {
      const res = await api.detectCcBillingAnomalies();
      if (res.data) {
        setScanCcResult({
          success: true,
          message: `נמצאו וסומנו ${res.data.flaggedCount ?? 0} חיובי כרטיסים חריגים לבדיקה במועדון הבדיקה`,
        });
      } else {
        setScanCcResult({ success: false, message: res.error || 'שגיאה בסריקה' });
      }
    } catch (err) {
      setScanCcResult({ success: false, message: err.message || 'שגיאה בסריקה' });
    } finally {
      setScanningCcAnomalies(false);
    }
  };

  const handleSaveCcSettings = async (overrides = {}) => {
    try {
      const res = await api.getSystemSettings();
      const current = res.data?.settings || {};
      const updated = {
        ...current,
        autoReconcileCcEnabled: overrides.autoReconcileCc !== undefined ? overrides.autoReconcileCc : autoReconcileCc,
        ccAutoScoreThreshold: overrides.ccAutoScoreThreshold !== undefined ? overrides.ccAutoScoreThreshold : ccAutoScoreThreshold,
        ccManualScoreThreshold: overrides.ccManualScoreThreshold !== undefined ? overrides.ccManualScoreThreshold : ccManualScoreThreshold,
        reconciliationMinScore: overrides.ccManualScoreThreshold !== undefined ? overrides.ccManualScoreThreshold : ccManualScoreThreshold,
        ccCustomPatterns: overrides.ccCustomPatterns !== undefined ? overrides.ccCustomPatterns : ccCustomPatterns,
      };
      await api.saveSystemSettings(updated);
      setCcSettingsSaved(true);
      setTimeout(() => setCcSettingsSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save CC settings:', err);
    }
  };

  const handleScanAndReconcileCc = async () => {
    setRunningCcScanAndMatch(true);
    setCcScanAndMatchResult(null);
    try {
      // 1. Scan and detect credit card billings in bank accounts
      const detectRes = await api.detectCcBillings({ userPatterns: ccCustomPatterns });
      const taggedCount = detectRes.data?.taggedCount ?? 0;

      // 2. Run auto-reconciliation on exact 100% matches
      const reconcileRes = await api.reconcileCcAuto({ autoThreshold: ccAutoScoreThreshold });
      const linkedCount = reconcileRes.data?.linkedCount ?? 0;

      setCcScanAndMatchResult({
        success: true,
        message: `הסריקה וההתאמה הושלמו בהצלחה: זוהו ${taggedCount} חיובי אשראי בחשבונות, והותאמו וקושרו ${linkedCount} תנועות בסכום זהה 100%.`,
      });

      // Refresh list of detected CC companies
      await fetchDetectedCcMerchants();

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fintrack_tx_updated'));
      }
    } catch (err) {
      setCcScanAndMatchResult({
        success: false,
        message: err.message || 'שגיאה בביצוע הסריקה וההתאמה',
      });
    } finally {
      setRunningCcScanAndMatch(false);
    }
  };

  const handleAddCcPattern = async () => {
    if (!newCcPattern.trim()) return;
    const clean = newCcPattern.trim();
    if (!ccCustomPatterns.includes(clean)) {
      const updated = [...ccCustomPatterns, clean];
      setCcCustomPatterns(updated);
      setNewCcPattern('');
      await handleSaveCcSettings({ ccCustomPatterns: updated });
    }
  };

  const handleRemoveCcPattern = async (pattern) => {
    const updated = ccCustomPatterns.filter((p) => p !== pattern);
    setCcCustomPatterns(updated);
    await handleSaveCcSettings({ ccCustomPatterns: updated });
  };

  // Category Reordering Handlers
  const handleReorderCategory = async (catId, direction, e) => {
    e?.stopPropagation();
    const list = [...activeCategories];
    const index = list.findIndex((c) => c.id === catId);
    if (index < 0) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    // Swap
    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;

    // Build full ordered list preserving other category type
    const otherTypeCats = categories.filter((c) => activeTab === 'expense' ? c.type === 'income' : (c.type === 'expense' || c.type === 'both' || !c.type));
    const newCategories = activeTab === 'expense' ? [...list, ...otherTypeCats] : [...otherTypeCats, ...list];
    
    // Assign updated sortOrder
    const updatedWithOrder = newCategories.map((c, i) => ({ ...c, sortOrder: i }));
    setCategories(updatedWithOrder);
    setDynamicCategories(updatedWithOrder);

    // Call API with orderedIds
    const orderedIds = updatedWithOrder.map((c) => c.id);
    try {
      await api.reorderCategories({ orderedIds });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fintrack_categories_updated'));
      }
    } catch (err) {
      console.error('Failed to reorder categories:', err);
    }
  };

  const handleReorderSubcategory = async (parentCatId, subId, direction, e) => {
    e?.stopPropagation();
    const parent = categories.find((c) => c.id === parentCatId);
    if (!parent || !Array.isArray(parent.subs)) return;
    const subs = [...parent.subs];
    const index = subs.findIndex((s) => s.id === subId);
    if (index < 0) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= subs.length) return;

    // Swap
    const temp = subs[index];
    subs[index] = subs[targetIndex];
    subs[targetIndex] = temp;

    // Assign sortOrder to subs
    const updatedSubs = subs.map((s, i) => ({ ...s, sortOrder: i }));
    const updatedCategories = categories.map((c) => c.id === parentCatId ? { ...c, subs: updatedSubs } : c);
    setCategories(updatedCategories);
    setDynamicCategories(updatedCategories);

    // Call API with orderedIds of the subs
    const orderedIds = updatedSubs.map((s) => s.id);
    try {
      await api.reorderCategories({ orderedIds });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fintrack_categories_updated'));
      }
    } catch (err) {
      console.error('Failed to reorder subcategories:', err);
    }
  };

  const handleSaveTelegramSettings = async () => {
    setSavingTelegram(true);
    setTelegramSaved(false);
    try {
      const res = await api.getSystemSettings();
      const current = res.data?.settings || {};
      const updated = {
        ...current,
        telegramBotToken: telegramBotToken.trim(),
        telegramChatId: telegramChatId.trim(),
        tmaBaseUrl: tmaBaseUrl.trim(),
        notifyOnNewTransactions: notifyOnNew,
        notifyOnAnomaly,
        notifyOnBudgetExceeded: notifyOnBudget,
        anomalyMinAmount: Math.max(50, parseInt(anomalyMinAmount, 10) || 300),
        notifyMaxAgeDays: Math.max(1, parseInt(notifyMaxAgeDays, 10) || 7),
        flagLowCcBillings,
        ccBillingMinThreshold: Math.max(0, parseInt(ccBillingMinThreshold, 10) || 500),
        ccBillingLookbackDays: Math.max(1, parseInt(ccBillingLookbackDays, 10) || 60),
      };
      await api.updateSystemSettings(updated);
      setTelegramSaved(true);
      await checkBotStatus();
      setTimeout(() => setTelegramSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save telegram settings:', err);
    } finally {
      setSavingTelegram(false);
    }
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    setTestResult(null);
    try {
      const res = await api.testTelegramConnection(telegramChatId.trim() || undefined);
      if (res.error) {
        setTestResult({ success: false, message: res.error });
      } else {
        setTestResult({ success: true, message: res.data?.message || 'הודעת בדיקה נשלחה בהצלחה לטלגרם!' });
        await checkBotStatus();
      }
    } catch (err) {
      setTestResult({ success: false, message: err.message || 'שגיאה בבדיקת חיבור' });
    } finally {
      setTestingTelegram(false);
      setTimeout(() => setTestResult(null), 7000);
    }
  };

  const handleSaveScheduleSettings = async () => {
    setSavingSchedule(true);
    setScheduleSaved(false);
    try {
      const res = await api.getSystemSettings();
      const current = res.data?.settings || {};
      const cardsHours = Math.max(3, parseFloat(scrapeIntervalCardsHours) || 4);
      const banksHours = Math.max(3, parseFloat(scrapeIntervalBanksHours) || 8);
      setScrapeIntervalCardsHours(cardsHours);
      setScrapeIntervalBanksHours(banksHours);

      const updated = {
        ...current,
        autoScrapeEnabled,
        scrapeIntervalCreditCardsHours: cardsHours,
        scrapeIntervalBanksHours: banksHours,
      };
      await api.updateSystemSettings(updated);
      setScheduleSaved(true);
      setTimeout(() => setScheduleSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save schedule settings:', err);
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleSaveGeminiSettings = async () => {
    setSavingGemini(true);
    setGeminiSaved(false);
    try {
      const res = await api.getSystemSettings();
      const current = res.data?.settings || {};
      const updated = {
        ...current,
        geminiApiKey: geminiApiKey.trim(),
        enableAiAnalysis,
      };
      await api.updateSystemSettings(updated);
      setGeminiSaved(true);
      setTimeout(() => setGeminiSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save Gemini settings:', err);
    } finally {
      setSavingGemini(false);
    }
  };

  const handleTestGemini = async () => {
    setTestingGemini(true);
    setGeminiTestResult(null);
    try {
      const res = await api.testGeminiApiKey(geminiApiKey.trim() || undefined);
      if (res.error) {
        setGeminiTestResult({ success: false, message: res.error });
      } else {
        setGeminiTestResult({ success: true, message: 'חיבור ל-Gemini הצליח! ניתוח החשבוניות מוכן לפעולה.' });
      }
    } catch (err) {
      setGeminiTestResult({ success: false, message: err.message || 'שגיאה בבדיקת חיבור ל-Gemini' });
    } finally {
      setTestingGemini(false);
      setTimeout(() => setGeminiTestResult(null), 8000);
    }
  };

  const loadCategories = async () => {
    setLoading(true);
    try {
      const res = await api.getCategories({ tree: 'true' });
      if (res.data?.data && Array.isArray(res.data.data) && res.data.data.length > 0) {
        setCategories(res.data.data);
        setDynamicCategories(res.data.data);
      } else {
        const fallback = [
          ...CATEGORIES_DATA.expenses.map(c => ({ ...c, type: 'expense' })),
          ...CATEGORIES_DATA.incomes.map(c => ({ ...c, type: 'income' })),
        ];
        setCategories(fallback);
        setDynamicCategories(fallback);
      }
    } catch (err) {
      console.error('Failed to load categories:', err);
      const fallback = [
        ...CATEGORIES_DATA.expenses.map(c => ({ ...c, type: 'expense' })),
        ...CATEGORIES_DATA.incomes.map(c => ({ ...c, type: 'income' })),
      ];
      setCategories(fallback);
      setDynamicCategories(fallback);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
    loadSettings();
  }, []);

  const handleSaveSyncSettings = async (days) => {
    const val = parseInt(days, 10) || 30;
    setScrapeDaysBack(val);
    setSavingSettings(true);
    setSettingsSaved(false);
    try {
      const res = await api.getSystemSettings();
      const current = res.data?.settings || {};
      await api.updateSystemSettings({ ...current, scrapeDaysBack: val });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save scraping settings:', err);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveMonthStartDay = async (day) => {
    const val = parseInt(day, 10) || 10;
    setMonthStartDay(val);
    setMonthSaved(false);
    try {
      const res = await api.getSystemSettings();
      const current = res.data?.settings || {};
      await api.updateSystemSettings({ ...current, monthStartDay: val });
      setMonthSaved(true);
      setTimeout(() => setMonthSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save month start day:', err);
    }
  };

  // Download Design System Prompt Guide
  const handleDownloadDesignPrompt = () => {
    const content = generateDesignSystemPrompt();
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'fintrack-svg-design-prompt.md');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Toggle Category Accordion
  const toggleExpand = (catId) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  // Open modal for adding subcategory
  const handleOpenAddSub = (parent) => {
    setEditingCat(null);
    setModalParentId(parent.id);
    setModalParentName(parent.name);
    setFormType(parent.type || 'expense');
    setFormColor(parent.color?.startsWith('#') ? parent.color : '#6366f1');
    setFormName('');
    setFormNameEn('');
    setFormIcon(parent.icon || 'tag');
    setFormSvg('');
    setIsModalOpen(true);
  };

  // Open modal for editing category / subcategory
  const handleOpenEdit = (cat, parentName = '') => {
    setEditingCat(cat);
    setModalParentId(cat.parentId || null);
    setModalParentName(parentName);
    setFormType(cat.type || 'expense');
    setFormColor(cat.color?.startsWith('#') ? cat.color : '#6366f1');
    setFormName(cat.name || '');
    setFormNameEn(cat.nameEn || '');
    setFormIcon(cat.icon || 'tag');
    // Pre-populate with existing customSvg or generated normalized SVG for the icon
    const existingSvg = cat.customSvg || (cat.icon ? getIconSvgMarkup(cat.icon) : '');
    setFormSvg(existingSvg);
    setIsModalOpen(true);
  };

  // Open modal for adding main category
  const handleOpenAddMain = () => {
    setEditingCat(null);
    setModalParentId(null);
    setModalParentName('');
    setFormType(activeTab);
    setFormColor(activeTab === 'expense' ? '#ec4899' : '#10b981');
    setFormName('');
    setFormNameEn('');
    setFormIcon('tag');
    setFormSvg('');
    setIsModalOpen(true);
  };

  // Delete category / subcategory
  const handleDeleteCategory = async (cat) => {
    if (!cat?.id) return;
    if (window.confirm(`האם אתה בטוח שברצונך למחוק את הקטגוריה "${cat.name}"?`)) {
      try {
        await api.deleteCategory(cat.id);
        window.dispatchEvent(new CustomEvent('fintrack_categories_updated'));
        await loadCategories();
      } catch (err) {
        console.error('Failed to delete category:', err);
      }
    }
  };

  // Toggle category active status (on/off)
  const handleToggleActive = async (cat, e) => {
    e?.stopPropagation?.();
    try {
      const nextActive = cat.isActive === false ? true : false;
      if (cat.id && !cat.id.startsWith('exp_') && !cat.id.startsWith('inc_')) {
        await api.updateCategory(cat.id, { isActive: nextActive });
      }
      window.dispatchEvent(new CustomEvent('fintrack_categories_updated'));
      await loadCategories();
    } catch (err) {
      console.error('Failed to toggle category active status:', err);
    }
  };

  // Restore all categories to system default MoneyApp hierarchy
  const handleResetCategories = async () => {
    if (resetConfirmText.trim() !== 'שחזר קטגוריות' && resetConfirmText.trim() !== 'RESET') {
      setResetError(lang === 'he' ? 'יש להקליד "שחזר קטגוריות" כדי לאשר' : 'Type "RESET" to confirm');
      return;
    }
    setResetLoading(true);
    setResetError('');
    try {
      await api.resetCategoriesToDefault();
      window.dispatchEvent(new CustomEvent('fintrack_categories_updated'));
      await loadCategories();
      setShowResetModal(false);
      setResetConfirmText('');
    } catch (err) {
      console.error('Failed to reset categories:', err);
      setResetError(lang === 'he' ? 'שגיאה בשחזור הקטגוריות לברירת מחדל' : 'Failed to reset categories to default');
    } finally {
      setResetLoading(false);
    }
  };

  // Handle SVG file upload
  const handleSvgFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        const normalized = normalizeCategorySvg(text.trim());
        setFormSvg(normalized);
      }
    };
    reader.readAsText(file);
  };

  // Submit Category / Subcategory
  const handleSubmitCategory = async (e) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setSubmittingCat(true);

    try {
      const normalizedSvg = formSvg.trim() ? normalizeCategorySvg(formSvg.trim()) : undefined;
      const payload = {
        name: formName.trim(),
        nameEn: formNameEn.trim() || undefined,
        type: formType,
        color: formColor,
        icon: formIcon,
        parentId: modalParentId || undefined,
        customSvg: normalizedSvg,
      };

      if (editingCat && editingCat.id && !editingCat.id.startsWith('exp_') && !editingCat.id.startsWith('inc_')) {
        await api.updateCategory(editingCat.id, payload);
      } else {
        await api.createCategory(payload);
      }

      setIsModalOpen(false);
      setEditingCat(null);
      window.dispatchEvent(new CustomEvent('fintrack_categories_updated'));
      await loadCategories();
    } catch (err) {
      console.error('Failed to save category:', err);
    } finally {
      setSubmittingCat(false);
    }
  };

  // Trigger Re-classification
  const handleReclassifyAll = async () => {
    setReclassifying(true);
    setReclassifyResult(null);
    try {
      const res = await api.reclassifyAllTransactions();
      if (res.data) {
        setReclassifyResult(res.data);
      }
    } finally {
      setReclassifying(false);
    }
  };

  // Danger Zone Actions Execution
  const handleExecuteDangerAction = async () => {
    if (dangerAction === 'transactions') {
      const expected = lang === 'he' ? 'מחק תנועות' : 'DELETE';
      if (dangerInput.trim() !== expected && dangerInput.trim() !== 'DELETE') {
        setDangerError(lang === 'he' ? 'יש להקליד במדויק: ' + expected : 'Please type exactly: ' + expected);
        return;
      }

      setDangerLoading(true);
      setDangerError('');
      try {
        await api.deleteAllTransactions();
        setDangerSuccess(lang === 'he' ? 'כל התנועות נמחקו בהצלחה!' : 'All transactions deleted successfully!');
        window.dispatchEvent(new CustomEvent('fintrack_tx_updated'));
        setTimeout(() => {
          setDangerAction(null);
          setDangerSuccess('');
          setDangerInput('');
        }, 1600);
      } catch (err) {
        console.error('Failed to delete all transactions:', err);
        setDangerError(lang === 'he' ? 'שגיאה במחיקת התנועות' : 'Failed to delete transactions');
      } finally {
        setDangerLoading(false);
      }
    } else if (dangerAction === 'all_data') {
      const expected = lang === 'he' ? 'איפוס מלא' : 'WIPE ALL';
      if (dangerInput.trim() !== expected && dangerInput.trim() !== 'WIPE ALL') {
        setDangerError(lang === 'he' ? 'יש להקליד במדויק: ' + expected : 'Please type exactly: ' + expected);
        return;
      }

      setDangerLoading(true);
      setDangerError('');
      try {
        await api.deleteAllData();
        setDangerSuccess(lang === 'he' ? 'המערכת אופסה לחלוטין וכל הנתונים נמחקו!' : 'System reset and all data wiped successfully!');
        window.dispatchEvent(new CustomEvent('fintrack_tx_updated'));
        setTimeout(() => {
          window.location.href = '/';
        }, 1600);
      } catch (err) {
        console.error('Failed to wipe system data:', err);
        setDangerError(lang === 'he' ? 'שגיאה באיפוס המערכת' : 'Failed to wipe system data');
      } finally {
        setDangerLoading(false);
      }
    }
  };

  // Expense Categories
  const expenseCategories = React.useMemo(() => {
    if (!categories || categories.length === 0) return CATEGORIES_DATA.expenses;
    const filtered = categories.filter((c) => c.type === 'expense' || c.type === 'both' || !c.type);
    return filtered.length > 0 ? filtered : CATEGORIES_DATA.expenses;
  }, [categories]);

  // Income Categories
  const incomeCategories = React.useMemo(() => {
    if (!categories || categories.length === 0) return CATEGORIES_DATA.incomes;
    const filtered = categories.filter((c) => c.type === 'income');
    return filtered.length > 0 ? filtered : CATEGORIES_DATA.incomes;
  }, [categories]);

  // Active Category List based on tab
  const activeCategories = activeTab === 'expense' ? expenseCategories : incomeCategories;

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">
          {t('settings')}
        </h1>
        <p className="text-xs text-dark-text-muted light:text-light-text-muted">
          {lang === 'he' ? 'ניהול קטגוריות מתקדם, עיצובי SVG, שפה, תצוגה והגדרות מערכת' : 'Advanced categories, SVG customization, localization and system settings'}
        </p>
      </div>

      {/* General Display Settings */}
      <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-brand-primary" />
          <span>{lang === 'he' ? 'העדפות תצוגה ושפה' : 'Display & Localization'}</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated flex items-center justify-between">
            <div>
              <div className="font-semibold text-dark-text light:text-light-text">{lang === 'he' ? 'שפת ממשק' : 'Interface Language'}</div>
              <div className="text-dark-text-muted light:text-light-text-muted">{lang === 'he' ? 'עברית (RTL) / English (LTR)' : 'English (LTR) / Hebrew (RTL)'}</div>
            </div>
            <button
              onClick={toggleLanguage}
              className="px-3 py-1.5 rounded-lg bg-brand-primary text-white font-semibold shadow-sm hover:bg-brand-primary-hover transition-colors"
            >
              {lang === 'he' ? 'Switch to English' : 'עבור לעברית'}
            </button>
          </div>

          <div className="p-4 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated flex items-center justify-between">
            <div>
              <div className="font-semibold text-dark-text light:text-light-text">{lang === 'he' ? 'ערכת נושא' : 'Theme Mode'}</div>
              <div className="text-dark-text-muted light:text-light-text-muted">{theme === 'dark' ? t('darkMode') : t('lightMode')}</div>
            </div>
            <button
              onClick={toggleTheme}
              className="px-3 py-1.5 rounded-lg border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text font-semibold hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated transition-colors"
            >
              {theme === 'dark' ? '☀️ ' + t('lightMode') : '🌙 ' + t('darkMode')}
            </button>
          </div>
        </div>
      </div>

      {/* Scraping & Sync Range Preferences */}
      <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4">
        <div>
          <h3 className="font-semibold text-base flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-brand-primary" />
            <span>{lang === 'he' ? 'הגדרות סנכרון וסריקה בנקאית' : 'Scraping & Sync Settings'}</span>
          </h3>
          <p className="text-xs text-dark-text-muted light:text-light-text-muted mt-0.5">
            {lang === 'he'
              ? 'בחר כמה זמן היסטוריה למשוך בכל סריקה של חשבונות הבנק וכרטיסי האשראי'
              : 'Configure transaction history range fetched during scraping'}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <div className="font-semibold text-sm text-dark-text light:text-light-text">
                {lang === 'he' ? 'טווח משיכת עסקאות אחורה' : 'Transaction History Range'}
              </div>
              <div className="text-dark-text-muted light:text-light-text-muted text-[11px] mt-0.5">
                {lang === 'he'
                  ? 'תמיכה במשיכה של עד 4 שנים אחורה (1460 יום - בהתאם למוסד הפיננסי)'
                  : 'Scrapers support fetching up to 4 years back (1460 days - subject to institution support)'}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={scrapeDaysBack}
                onChange={(e) => handleSaveSyncSettings(e.target.value)}
                disabled={savingSettings}
                className="p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text font-semibold text-xs focus:ring-2 focus:ring-brand-primary/50 cursor-pointer"
              >
                <option value="30">{lang === 'he' ? 'חודש אחד אחורה (30 יום) - ברירת מחדל' : '1 Month (30 days) - Default'}</option>
                <option value="60">{lang === 'he' ? 'חודשיים אחורה (60 יום)' : '2 Months (60 days)'}</option>
                <option value="90">{lang === 'he' ? '3 חודשים אחורה (90 יום)' : '3 Months (90 days)'}</option>
                <option value="180">{lang === 'he' ? 'חצי שנה אחורה (180 יום)' : '6 Months (180 days)'}</option>
                <option value="365">{lang === 'he' ? 'שנה אחורה (365 יום - מומלץ למשיכה מלאה)' : '1 Year (365 days - Full History)'}</option>
                <option value="730">{lang === 'he' ? 'שנתיים אחורה (730 יום)' : '2 Years (730 days)'}</option>
                <option value="1095">{lang === 'he' ? '3 שנים אחורה (1095 יום)' : '3 Years (1095 days)'}</option>
                <option value="1460">{lang === 'he' ? '4 שנים אחורה (1460 יום - היסטוריה מורחבת)' : '4 Years (1460 days - Extended History)'}</option>
              </select>

              {settingsSaved && (
                <span className="flex items-center gap-1 text-brand-income font-medium text-xs">
                  <Check className="w-4 h-4" />
                  <span>{lang === 'he' ? 'נשמר' : 'Saved'}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Monthly Billing Cycle Definition */}
        <div className="p-4 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <div className="font-semibold text-sm text-dark-text light:text-light-text">
                {lang === 'he' ? 'יום תחילת חודש / מחזור תקציבי (ברירת מחדל)' : 'Default Monthly Cycle Start Day'}
              </div>
              <div className="text-dark-text-muted light:text-light-text-muted text-[11px] mt-0.5">
                {lang === 'he'
                  ? 'הגדר לפי איזה יום לסנן את החודש (ה-1 לחודש קלנדרי, או ה-10/15 לחודש לפי חיוב כרטיסי אשראי)'
                  : 'Define billing cycle start day for monthly budgeting and credit card calculations'}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={monthStartDay}
                onChange={(e) => handleSaveMonthStartDay(e.target.value)}
                className="p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text font-semibold text-xs focus:ring-2 focus:ring-brand-primary/50 cursor-pointer"
              >
                <option value="1">1 לחודש (חודש קלנדרי רגיל)</option>
                <option value="2">2 לחודש</option>
                <option value="10">10 לחודש (מועד חיוב אשראי נפוץ)</option>
                <option value="15">15 לחודש</option>
                <option value="20">20 לחודש</option>
                <option value="25">25 לחודש</option>
              </select>

              {monthSaved && (
                <span className="flex items-center gap-1 text-brand-income font-medium text-xs">
                  <Check className="w-4 h-4" />
                  <span>{lang === 'he' ? 'נשמר' : 'Saved'}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Telegram Bot & Real-time Notifications */}
      <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-base flex items-center gap-2">
              <Send className="w-5 h-5 text-sky-400" />
              <span>{lang === 'he' ? 'אינטגרציית טלגרם והתראות חכמות' : 'Telegram Integration & Alerts'}</span>
            </h3>
            <p className="text-xs text-dark-text-muted light:text-light-text-muted mt-0.5">
              {lang === 'he'
                ? 'הגדר בוט טלגרם אישי להתראות מיידיות על תנועות חדשות עם עריכה ב-TMA, זיהוי חריגות וקודי אימות (OTP)'
                : 'Configure personal Telegram Bot for instant alerts with TMA editor, anomaly detection and 2FA OTP'}
            </p>
          </div>

          {/* Bot Live Status Badge */}
          <div className="flex items-center gap-2">
            {botStatus?.configured ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{botStatus.botUsername ? `@${botStatus.botUsername}` : 'מחובר ופעיל'}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
                <span className="w-2 h-2 rounded-full bg-slate-500" />
                <span>טרם הוגדר בוט</span>
              </span>
            )}
          </div>
        </div>

        {/* Credentials Form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Bot Token Input */}
          <div className="p-4 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-dark-text light:text-light-text">
                {lang === 'he' ? 'טוקן בוט (Bot Token)' : 'Telegram Bot Token'}
              </label>
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="text-xs text-dark-text-muted hover:text-dark-text flex items-center gap-1 transition-colors"
              >
                {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showToken ? 'הסתר' : 'הצג'}</span>
              </button>
            </div>
            <input
              type={showToken ? 'text' : 'password'}
              value={telegramBotToken}
              onChange={(e) => setTelegramBotToken(e.target.value)}
              placeholder="1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ..."
              className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text text-xs focus:ring-2 focus:ring-sky-500/50"
            />
            <p className="text-[11px] text-dark-text-muted light:text-light-text-muted">
              ניתן להפיק טוקן חינמי ומהיר בטלגרם דרך הבוט הרשמי <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">@BotFather</a>
            </p>
          </div>

          {/* Chat ID Input */}
          <div className="p-4 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated space-y-2">
            <label className="text-xs font-semibold text-dark-text light:text-light-text block">
              {lang === 'he' ? 'מזהה צ׳אט אישי (Chat ID)' : 'Personal Chat ID'}
            </label>
            <input
              type="text"
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              placeholder="לדוגמה: 123456789"
              className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text text-xs focus:ring-2 focus:ring-sky-500/50"
            />
            <p className="text-[11px] text-dark-text-muted light:text-light-text-muted">
              את ה-Chat ID שלך ניתן לקבל בלחיצת כפתור בבוט <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">@userinfobot</a>
            </p>
          </div>
        </div>

        {/* TMA Base URL Input */}
        <div className="p-4 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated space-y-2">
          <label className="text-xs font-semibold text-dark-text light:text-light-text flex items-center gap-1.5">
            <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
            <span>{lang === 'he' ? 'כתובת HTTPS עבור Telegram Mini App (TMA)' : 'Public HTTPS URL for TMA'}</span>
          </label>
          <input
            type="url"
            value={tmaBaseUrl}
            onChange={(e) => setTmaBaseUrl(e.target.value)}
            placeholder="https://fintrack.example.com או כתובת Tailscale HTTPS"
            className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text text-xs focus:ring-2 focus:ring-sky-500/50"
          />
          <p className="text-[11px] text-dark-text-muted light:text-light-text-muted">
            טלגרם דורשת כתובת HTTPS לצורך פתיחת חלון עריכת התנועה (TMA) ישירות בתוך האפליקציה. אם תשאיר ריק, ההודעה תישלח ללא כפתור TMA פנימי.
          </p>
        </div>

        {/* Notification Rules & Anomaly Preferences */}
        <div className="p-4 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated space-y-3.5">
          <div className="font-semibold text-xs text-dark-text light:text-light-text flex items-center gap-1.5">
            <Bell className="w-4 h-4 text-brand-primary" />
            <span>{lang === 'he' ? 'סוגי התראות והגדרות זיהוי חריגות' : 'Alert Types & Anomaly Detection'}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* New Transactions */}
            <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-dark-border/60 light:border-light-border/60 bg-dark-surface light:bg-light-surface cursor-pointer">
              <input
                type="checkbox"
                checked={notifyOnNew}
                onChange={(e) => setNotifyOnNew(e.target.checked)}
                className="mt-0.5 rounded border-dark-border text-brand-primary focus:ring-brand-primary/50"
              />
              <div>
                <span className="font-medium text-dark-text light:text-light-text block">התראות על כל תנועה חדשה</span>
                <span className="text-[11px] text-dark-text-muted light:text-light-text-muted block">
                  שליחת הודעה מיידית עם כפתור TMA לעריכה בכל קליטת עסקה
                </span>
              </div>
            </label>

            {/* Budget Exceeded */}
            <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-dark-border/60 light:border-light-border/60 bg-dark-surface light:bg-light-surface cursor-pointer">
              <input
                type="checkbox"
                checked={notifyOnBudget}
                onChange={(e) => setNotifyOnBudget(e.target.checked)}
                className="mt-0.5 rounded border-dark-border text-brand-primary focus:ring-brand-primary/50"
              />
              <div>
                <span className="font-medium text-dark-text light:text-light-text block">התראות על חריגה מתקציב</span>
                <span className="text-[11px] text-dark-text-muted light:text-light-text-muted block">
                  התראה מיידית כאשר סך ההוצאות החודשי בקטגוריה חוצה את הגבול
                </span>
              </div>
            </label>

            {/* Full History Anomaly Detection */}
            <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-dark-border/60 light:border-light-border/60 bg-dark-surface light:bg-light-surface cursor-pointer">
              <input
                type="checkbox"
                checked={notifyOnAnomaly}
                onChange={(e) => setNotifyOnAnomaly(e.target.checked)}
                className="mt-0.5 rounded border-dark-border text-brand-primary focus:ring-brand-primary/50"
              />
              <div>
                <span className="font-medium text-amber-400 block flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  זיהוי והתראות על תנועות חריגות (מנוע היסטורי מלא)
                </span>
                <span className="text-[11px] text-dark-text-muted light:text-light-text-muted block">
                  לומד מכל היסטוריית העבר: מתריע על בתי עסק חדשים או קפיצות חריגות בסכום
                </span>
              </div>
            </label>

            {/* Anomaly Min Amount */}
            <div className="p-2.5 rounded-lg border border-dark-border/60 light:border-light-border/60 bg-dark-surface light:bg-light-surface space-y-1">
              <label className="font-medium text-dark-text light:text-light-text text-[11px] block">
                סף מינימום לסכום חריג (₪)
              </label>
              <input
                type="number"
                min="50"
                step="50"
                value={anomalyMinAmount}
                onChange={(e) => setAnomalyMinAmount(e.target.value)}
                className="w-full p-1.5 rounded-lg border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs focus:ring-1 focus:ring-brand-primary"
              />
              <span className="text-[10px] text-dark-text-muted light:text-light-text-muted block">
                תנועות מתחת לסכום זה לא ייחשבו כחריגות (ברירת מחדל: 300 ₪)
              </span>
            </div>

            {/* Max Notification Age Limit (Days) */}
            <div className="p-2.5 rounded-lg border border-dark-border/60 light:border-light-border/60 bg-dark-surface light:bg-light-surface space-y-1.5">
              <label className="font-medium text-dark-text light:text-light-text text-[11px] block flex items-center justify-between">
                <span>טווח ימים מקסימלי לשליחת התראה</span>
                <span className="font-bold text-brand-primary">{notifyMaxAgeDays} ימים</span>
              </label>
              <div className="flex gap-1.5 items-center">
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={notifyMaxAgeDays}
                  onChange={(e) => setNotifyMaxAgeDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-16 p-1.5 rounded-lg border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs focus:ring-1 focus:ring-brand-primary font-mono"
                />
                <div className="flex gap-1 flex-1 overflow-x-auto no-scrollbar">
                  {[1, 3, 7, 14, 30].map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setNotifyMaxAgeDays(days)}
                      className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
                        notifyMaxAgeDays === days
                          ? 'bg-brand-primary/20 border-brand-primary text-brand-primary font-bold'
                          : 'border-dark-border/60 light:border-light-border/60 text-dark-text-muted hover:text-dark-text'
                      }`}
                    >
                      {days === 7 ? '7 ימים (מומלץ)' : `${days} ימים`}
                    </button>
                  ))}
                </div>
              </div>
              <span className="text-[10px] text-dark-text-muted light:text-light-text-muted block">
                עסקאות ישנות יותר מטווח זה יסומנו אוטומטית כנקראו ולא יישלחו לטלגרם (ברירת מחדל: 7 ימים).
              </span>
            </div>

            {/* Smart Credit Card Billing Anomaly Detection in Bank Accounts */}
            <div className="col-span-full p-3.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={flagLowCcBillings}
                  onChange={(e) => setFlagLowCcBillings(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded text-brand-primary focus:ring-brand-primary cursor-pointer"
                />
                <div>
                  <span className="font-semibold text-dark-text light:text-light-text text-xs block">
                    זיהוי חיובי כרטיסי אשראי חריגים בחשבונות בנק (סימון אוטומטי לבדיקה)
                  </span>
                  <span className="text-[11px] text-dark-text-muted light:text-light-text-muted block">
                    מסמן אוטומטית לבדיקה תנועות של חיוב כרטיס אשראי בבנק אם הסכום נמוך בצורה חריגה או חיובי (זיכוי), כדי לוודא שאין טעות או חיוב חלקי
                  </span>
                </div>
              </label>

              {flagLowCcBillings && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <div className="space-y-1">
                    <label className="font-medium text-dark-text light:text-light-text text-[11px] block">
                      סף מינימום לחיוב כרטיס (₪)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="50"
                      value={ccBillingMinThreshold}
                      onChange={(e) => setCcBillingMinThreshold(e.target.value)}
                      className="w-full p-1.5 rounded-lg border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs focus:ring-1 focus:ring-brand-primary font-mono"
                    />
                    <span className="text-[10px] text-dark-text-muted light:text-light-text-muted block">
                      חיובים מתחת לסכום זה יסומנו לבדיקה (ברירת מחדל: 500 ₪)
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="font-medium text-dark-text light:text-light-text text-[11px] block">
                      טווח ימים לבדיקה (ימים אחורה)
                    </label>
                    <input
                      type="number"
                      min="7"
                      max="365"
                      step="1"
                      value={ccBillingLookbackDays}
                      onChange={(e) => setCcBillingLookbackDays(e.target.value)}
                      className="w-full p-1.5 rounded-lg border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs focus:ring-1 focus:ring-brand-primary font-mono"
                    />
                    <span className="text-[10px] text-dark-text-muted light:text-light-text-muted block">
                      כמה ימים אחורה לסרוק חיובי כרטיסים (ברירת מחדל: 60 יום)
                    </span>
                  </div>

                  <div className="col-span-full pt-1 flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleScanCcAnomalies}
                      disabled={scanningCcAnomalies}
                      className="px-3 py-1.5 rounded-lg border border-brand-primary/30 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${scanningCcAnomalies ? 'animate-spin' : ''}`} />
                      <span>{scanningCcAnomalies ? 'סורק חיובי כרטיסים...' : 'סרוק חיובי כרטיסים עכשיו'}</span>
                    </button>

                    {scanCcResult && (
                      <span className={`text-xs font-medium ${scanCcResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {scanCcResult.message}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Automatic Credit Card Billing Reconciliation & Linking */}
            <div className="col-span-full p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <CreditCard className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-bold text-dark-text light:text-light-text text-sm block">
                      התאמה וקישור חיובי חברות אשראי (Reconciliation)
                    </span>
                    <span className="text-[11px] text-dark-text-muted light:text-light-text-muted block">
                      אלגוריתם מתקדם לאיתור חיובי אשראי בחשבון הבנק, קישורם לתנועות האשראי או המט״ח המקוריות, ומניעת ספירה כפולה של הוצאות
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0" dir="ltr">
                  <button
                    type="button"
                    onClick={async () => {
                      const next = !autoReconcileCc;
                      setAutoReconcileCc(next);
                      await handleSaveCcSettings({ autoReconcileCc: next });
                    }}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      autoReconcileCc ? 'bg-indigo-600' : 'bg-slate-600'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                        autoReconcileCc ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Settings Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="font-medium text-dark-text light:text-light-text">סף ציון לקישור אוטומטי (דיוק בסכום 100% חובה)</span>
                    <span className="font-bold font-mono text-indigo-400">{ccAutoScoreThreshold}%</span>
                  </div>
                  <input
                    type="range"
                    min="80"
                    max="99"
                    step="1"
                    value={ccAutoScoreThreshold}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setCcAutoScoreThreshold(v);
                      handleSaveCcSettings({ ccAutoScoreThreshold: v });
                    }}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <span className="text-[10px] text-dark-text-muted light:text-light-text-muted block">
                    קישור אוטומטי מבוצע אך ורק בתנועות עם סכום זהה בדיוק (הפרש 0 ₪) וציון מעל סף זה.
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="font-medium text-dark-text light:text-light-text">סף ציון להצגת מועמדים ידניים</span>
                    <span className="font-bold font-mono text-indigo-400">{ccManualScoreThreshold}%</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="70"
                    step="5"
                    value={ccManualScoreThreshold}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setCcManualScoreThreshold(v);
                      handleSaveCcSettings({ ccManualScoreThreshold: v });
                    }}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <span className="text-[10px] text-dark-text-muted light:text-light-text-muted block">
                    התאמות מוצעות שיוצגו בחלונית התנועה להתאמה ידנית (ברירת מחדל: 35%).
                  </span>
                </div>
              </div>

              {/* CC Merchant Patterns Management */}
              <div className="space-y-2 pt-2 border-t border-indigo-500/20">
                <label className="text-xs font-semibold text-dark-text light:text-light-text flex items-center justify-between">
                  <span>דפוסי זיהוי מותאמים אישית לבתי עסק / חברות אשראי:</span>
                  <span className="text-[10px] text-dark-text-muted font-normal">מתווסף לדפוסי ברירת המחדל (ישראכרט, כאל, מקס, ויזה וכו')</span>
                </label>

                {/* Pattern Tags */}
                <div className="flex flex-wrap gap-1.5 min-h-[32px] items-center">
                  {ccCustomPatterns.length === 0 ? (
                    <span className="text-[11px] text-dark-text-muted light:text-light-text-muted italic">
                      אין דפוסים מותאמים אישית. המערכת משתמשת בדפוסים המובנים של חברות האשראי בישראל.
                    </span>
                  ) : (
                    ccCustomPatterns.map((p) => (
                      <span
                        key={p}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-400 text-xs font-medium border border-indigo-500/20"
                      >
                        <span>{p}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveCcPattern(p)}
                          className="hover:text-rose-400 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>

                {/* Add Custom Pattern Input */}
                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="הוסף שם בית עסק או מילת מפתח (למשל: חיוב מקס עסקי)..."
                    value={newCcPattern}
                    onChange={(e) => setNewCcPattern(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCcPattern();
                      }
                    }}
                    className="flex-1 p-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text text-xs focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddCcPattern}
                    className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors shrink-0 cursor-pointer"
                  >
                    הוסף
                  </button>
                </div>
              </div>

              {/* Single Action Button: Scan and Auto-Reconcile */}
              <div className="pt-2 border-t border-indigo-500/20 flex items-center gap-2.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleScanAndReconcileCc}
                  disabled={runningCcScanAndMatch}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${runningCcScanAndMatch ? 'animate-spin' : ''}`} />
                  <span>{runningCcScanAndMatch ? 'סורק חשבונות ומבצע התאמות...' : 'סרוק חיובי אשראי ובצע התאמות עכשיו'}</span>
                </button>

                {ccSettingsSaved && (
                  <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1 animate-in fade-in">
                    <Check className="w-3.5 h-3.5" />
                    <span>ההגדרות נשמרו בהצלחה!</span>
                  </span>
                )}

                {ccScanAndMatchResult && (
                  <span className={`text-xs font-medium ${ccScanAndMatchResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {ccScanAndMatchResult.message}
                  </span>
                )}
              </div>

              {/* Detected Credit Card Companies & Merchants List */}
              <div className="space-y-2.5 pt-3 border-t border-indigo-500/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold text-dark-text light:text-light-text">
                      חברות אשראי ובתי עסק שזוהו כחיובי אשראי בבנק ({detectedCcMerchants.length})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={fetchDetectedCcMerchants}
                    disabled={loadingDetectedMerchants}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingDetectedMerchants ? 'animate-spin' : ''}`} />
                    <span>רענן</span>
                  </button>
                </div>

                {loadingDetectedMerchants ? (
                  <div className="p-4 text-center text-xs text-dark-text-muted flex items-center justify-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                    <span>טוען חברות אשראי שזוהו...</span>
                  </div>
                ) : detectedCcMerchants.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-indigo-500/30 bg-indigo-500/5 text-center text-xs text-dark-text-muted light:text-light-text-muted">
                    טרם זוהו חיובי אשראי בחשבונות הבנק. לחץ על כפתור הסריקה למעלה כדי לסרוק את החשבונות ולזהות חברות אשראי.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                    {detectedCcMerchants.map((m, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="font-bold text-dark-text light:text-light-text truncate">
                            {cleanSpacedHebrew(m.merchantName)}
                          </div>
                          <div className="text-[10px] text-dark-text-muted light:text-light-text-muted flex items-center gap-1.5 flex-wrap">
                            <span>{m.accountDisplayName || m.bankCompany}</span>
                            {m.lastDate && (
                              <>
                                <span>•</span>
                                <span>חיוב אחרון: {formatDate(m.lastDate, lang)}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="text-left shrink-0 space-y-0.5" dir="ltr">
                          <div className="font-bold font-mono text-dark-text light:text-light-text text-[11px]">
                            {formatILS(m.totalAmount)}
                          </div>
                          <div className="flex items-center justify-end gap-1 text-[10px]">
                            <span className="px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-400 font-semibold">
                              {m.txCount} תנועות
                            </span>
                            {m.linkedCount > 0 && (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 font-semibold">
                                {m.linkedCount} מקושרות ✓
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Buttons & Feedback */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestTelegram}
              disabled={testingTelegram || !telegramBotToken.trim()}
              className="px-3.5 py-2 rounded-xl border border-sky-500/40 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              <Send className={`w-3.5 h-3.5 ${testingTelegram ? 'animate-bounce' : ''}`} />
              <span>{testingTelegram ? 'שולח בדיקה...' : 'שלח הודעת בדיקה לטלגרם'}</span>
            </button>

            {testResult && (
              <span
                className={`text-xs font-medium flex items-center gap-1 ${
                  testResult.success ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {testResult.success ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                <span>{testResult.message}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {telegramSaved && (
              <span className="flex items-center gap-1 text-emerald-400 font-semibold text-xs">
                <Check className="w-4 h-4" />
                <span>הגדרות טלגרם נשמרו בהצלחה!</span>
              </span>
            )}

            <button
              type="button"
              onClick={handleSaveTelegramSettings}
              disabled={savingTelegram}
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-md shadow-sky-600/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{savingTelegram ? 'שומר...' : 'שמור הגדרות טלגרם'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Automated Scraping Schedule with 3h safety limit */}
      <div className="p-5 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-base flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-400" />
              <span>{lang === 'he' ? 'תזמון סריקות אוטומטי (בשעות)' : 'Automated Scrape Schedule (Hours)'}</span>
            </h3>
            <p className="text-xs text-dark-text-muted light:text-light-text-muted mt-0.5">
              {lang === 'he'
                ? 'קביעת תדירות רענון אוטומטית ברקע לכרטיסי אשראי ולחשבונות בנק'
                : 'Configure background periodic scrape frequency in hours'}
            </p>
          </div>

          {/* Master Auto-Scrape Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScrapeEnabled}
              onChange={(e) => setAutoScrapeEnabled(e.target.checked)}
              className="rounded border-dark-border text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs font-semibold text-dark-text light:text-light-text">
              {autoScrapeEnabled ? 'סריקה אוטומטית מופעלת' : 'סריקה אוטומטית כבויה'}
            </span>
          </label>
        </div>

        {/* Anti-bot Safety Alert Banner */}
        <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block">מגבלת בטיחות מובנית להגנה מחסימות:</span>
            <span className="text-[11px] text-indigo-200/80 block">
              המערכת אוכפת מינימום של 3 שעות בין סריקות אוטומטיות כדי להגן על חשבונותיך מפני זיהוי כבוט או חסימות גישה מצד הבנקים וחברות האשראי. הסריקות מבוצעות בין השעות 08:00 ל-22:00 בלבד.
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Credit Cards Interval */}
          <div className="p-4 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-dark-text light:text-light-text">
                {lang === 'he' ? 'תדירות רענון לכרטיסי אשראי' : 'Credit Cards Interval'}
              </label>
              <span className="text-xs font-bold text-indigo-400">
                כל {scrapeIntervalCardsHours} שעות
              </span>
            </div>

            <input
              type="number"
              min="3"
              max="72"
              step="1"
              value={scrapeIntervalCardsHours}
              onChange={(e) => setScrapeIntervalCardsHours(Math.max(3, parseInt(e.target.value, 10) || 3))}
              className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text text-xs focus:ring-2 focus:ring-indigo-500/50"
            />

            {/* Quick Preset Buttons */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[3, 4, 6, 12, 24].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setScrapeIntervalCardsHours(h)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                    scrapeIntervalCardsHours === h
                      ? 'bg-indigo-600 border-indigo-500 text-white font-semibold shadow-sm'
                      : 'border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text-muted hover:text-dark-text'
                  }`}
                >
                  {h === 24 ? 'פעם ביום (24 שעות)' : `${h} שעות`}
                </button>
              ))}
            </div>
          </div>

          {/* Bank Accounts Interval */}
          <div className="p-4 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-dark-text light:text-light-text">
                {lang === 'he' ? 'תדירות רענון לחשבונות בנק' : 'Bank Accounts Interval'}
              </label>
              <span className="text-xs font-bold text-indigo-400">
                כל {scrapeIntervalBanksHours} שעות
              </span>
            </div>

            <input
              type="number"
              min="3"
              max="72"
              step="1"
              value={scrapeIntervalBanksHours}
              onChange={(e) => setScrapeIntervalBanksHours(Math.max(3, parseInt(e.target.value, 10) || 3))}
              className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text text-xs focus:ring-2 focus:ring-indigo-500/50"
            />

            {/* Quick Preset Buttons */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[4, 6, 8, 12, 24].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setScrapeIntervalBanksHours(h)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                    scrapeIntervalBanksHours === h
                      ? 'bg-indigo-600 border-indigo-500 text-white font-semibold shadow-sm'
                      : 'border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text-muted hover:text-dark-text'
                  }`}
                >
                  {h === 24 ? 'פעם ביום (24 שעות)' : `${h} שעות`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Save Schedule Button */}
        <div className="flex items-center justify-end gap-3 pt-1">
          {scheduleSaved && (
            <span className="flex items-center gap-1 text-emerald-400 font-semibold text-xs">
              <Check className="w-4 h-4" />
              <span>תזמון הסריקות נשמר בהצלחה!</span>
            </span>
          )}

          <button
            type="button"
            onClick={handleSaveScheduleSettings}
            disabled={savingSchedule}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{savingSchedule ? 'שומר...' : 'שמור תזמון סריקות'}</span>
          </button>
        </div>
      </div>

      {/* 🧾 ניתוח חשבוניות חכם ב-AI (Google Gemini) */}
      <div className="p-6 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <span>ניתוח חשבוניות וקבלות ב-AI (Google Gemini)</span>
            </h3>
            <p className="text-xs text-dark-text-muted mt-0.5">
              העלאת תמונות/קובצי PDF או הזנת קישור דיגיטלי (כמו רמי לוי / שופרסל) - ה-AI יחלץ פריטים ויאפשר חלוקה לקטגוריות ופיצול תנועות.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-dark-text-muted">
              {enableAiAnalysis ? 'ניתוח AI פעיל' : 'ניתוח AI כבוי'}
            </span>
            <button
              type="button"
              onClick={() => setEnableAiAnalysis(!enableAiAnalysis)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                enableAiAnalysis ? 'bg-amber-500' : 'bg-dark-border light:border-light-border'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  enableAiAnalysis ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-dark-text light:text-light-text flex items-center gap-1.5">
                <span>Google Gemini API Key</span>
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-brand-primary hover:underline flex items-center gap-1"
              >
                <span>השג מפתח API חינם ב-Google AI Studio</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="relative">
              <input
                type={showGeminiKey ? 'text' : 'password'}
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full p-2.5 pl-10 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text text-xs focus:ring-2 focus:ring-amber-500/50"
              />
              <button
                type="button"
                onClick={() => setShowGeminiKey(!showGeminiKey)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-text-muted hover:text-dark-text"
              >
                {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-dark-text-muted">
              ניתן להגדיר כאן או כמשתנה סביבה <code className="text-amber-400 font-mono text-[10px]">GEMINI_API_KEY</code>.
            </p>
          </div>
        </div>

        {geminiTestResult && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              geminiTestResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}
          >
            {geminiTestResult.success ? <Check className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{geminiTestResult.message}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-dark-border light:border-light-border">
          <button
            type="button"
            onClick={handleTestGemini}
            disabled={testingGemini || !geminiApiKey.trim()}
            className="px-3.5 py-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface hover:bg-dark-surface-elevated text-dark-text light:text-light-text text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>{testingGemini ? 'בודק חיבור...' : 'בדוק חיבור ל-Gemini'}</span>
          </button>

          <div className="flex items-center gap-3">
            {geminiSaved && (
              <span className="flex items-center gap-1 text-emerald-400 font-semibold text-xs">
                <Check className="w-4 h-4" />
                <span>הגדרות ה-AI נשמרו בהצלחה!</span>
              </span>
            )}

            <button
              type="button"
              onClick={handleSaveGeminiSettings}
              disabled={savingGemini}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold shadow-md shadow-amber-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{savingGemini ? 'שומר...' : 'שמור הגדרות AI'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modern Categories & Custom SVG Design Hub */}
      <div className="p-6 rounded-2xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface space-y-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Tag className="w-5 h-5 text-brand-primary" />
              <span>{lang === 'he' ? 'ניהול קטגוריות, תתי-קטגוריות ועיצובי SVG' : 'Categories, Subcategories & SVG Design Hub'}</span>
            </h3>
            <p className="text-xs text-dark-text-muted mt-0.5">
              {lang === 'he'
                ? 'עץ קטגוריות מלא עם עיצובי סקווירקל צבעוניים. ניתן להוריד מפרט פרומפט ל-AI ולהעלות קובצי SVG מותאמים אישית.'
                : 'Complete category tree with colored squircle badges. Download AI prompt specs and upload custom SVGs.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShowResetModal(true);
                setResetConfirmText('');
                setResetError('');
              }}
              className="px-3.5 py-2 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-colors text-xs font-semibold flex items-center gap-1.5 shadow-xs"
              title="שחזור כל הקטגוריות למבנה ברירת המחדל"
            >
              <RotateCcw className="w-4 h-4" />
              <span>שחזור לברירת מחדל</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadDesignPrompt}
              className="px-3.5 py-2 rounded-xl border border-brand-primary/40 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 transition-colors text-xs font-semibold flex items-center gap-1.5 shadow-xs"
              title="הורד קובץ מפרט עיצוב להעתקה ל-AI ליצירת SVG תואם"
            >
              <Download className="w-4 h-4" />
              <span>הורד מפרט ופרומפט SVG</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAddMain}
              className="px-3.5 py-2 rounded-xl bg-brand-primary text-white hover:bg-brand-primary-hover transition-colors text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>הוסף קטגוריה ראשית</span>
            </button>
          </div>
        </div>

        {/* Tabs: Expenses vs Incomes */}
        <div className="flex items-center justify-between border-b border-dark-border light:border-light-border pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('expense')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'expense'
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text border border-dark-border/40 light:border-light-border/40'
              }`}
            >
              הוצאות ({expenseCategories.length})
            </button>
            <button
              onClick={() => setActiveTab('income')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'income'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text border border-dark-border/40 light:border-light-border/40'
              }`}
            >
              הכנסות ({incomeCategories.length})
            </button>
          </div>

          <button
            onClick={handleReclassifyAll}
            disabled={reclassifying}
            className="text-[11px] text-brand-cyan hover:underline flex items-center gap-1 font-medium disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{reclassifying ? 'מסווג מחדש...' : 'סווג מחדש את כל התנועות'}</span>
          </button>
        </div>

        {reclassifyResult && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-500 font-medium">
            סווגו מחדש בהצלחה {reclassifyResult.updated} מתוך {reclassifyResult.total} תנועות לפי עץ הקטגוריות ומאגר העסקים!
          </div>
        )}

        {/* Categories Tree Cards */}
        <div className="space-y-3">
          {activeCategories.map((cat, catIdx) => {
            const isExpanded = expandedCats.has(cat.id);
            const subs = cat.subs || [];
            const isInactive = cat.isActive === false;

            return (
              <div
                key={cat.id}
                className={`rounded-2xl border transition-all shadow-xs overflow-hidden ${
                  isInactive
                    ? 'border-dark-border/50 light:border-light-border/50 bg-dark-surface-elevated/20 light:bg-light-surface-elevated/20 opacity-70'
                    : 'border-dark-border light:border-light-border bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40'
                }`}
              >
                {/* Main Category Header Row */}
                <div 
                  className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-dark-surface-elevated/70 light:hover:bg-light-surface-elevated/70 transition-colors"
                  onClick={() => toggleExpand(cat.id)}
                >
                  {/* Category Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <CategoryBadge category={cat.name} customSvg={cat.customSvg} size={22} className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-xs sm:text-sm text-dark-text light:text-light-text flex items-center gap-2 flex-wrap">
                        <span className={`truncate ${isInactive ? 'line-through text-dark-text-muted' : ''}`}>{cat.name}</span>
                        {cat.nameEn && (
                          <span className="text-[11px] font-normal text-dark-text-muted light:text-light-text-muted">
                            ({cat.nameEn})
                          </span>
                        )}
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-dark-surface light:bg-light-surface border border-dark-border/60 light:border-light-border/60 text-dark-text-muted light:text-light-text-muted shrink-0">
                          {subs.length} תתי-קטגוריות
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                          cat.type === 'income' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                        }`}>
                          {cat.type === 'income' ? 'הכנסה' : 'הוצאה'}
                        </span>
                        {isInactive && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30 shrink-0">
                            מושבת
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-dark-border/40 light:border-light-border/40" onClick={(e) => e.stopPropagation()}>
                    {/* Category Reorder Up / Down */}
                    <div className="flex items-center gap-0.5 bg-dark-surface light:bg-light-surface rounded-lg p-0.5 border border-dark-border/60 light:border-light-border/60 shrink-0">
                      <button
                        type="button"
                        disabled={catIdx === 0}
                        onClick={(e) => handleReorderCategory(cat.id, 'up', e)}
                        className="p-1 rounded hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated text-dark-text-muted hover:text-dark-text disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                        title="הזז קטגוריה למעלה"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={catIdx === activeCategories.length - 1}
                        onClick={(e) => handleReorderCategory(cat.id, 'down', e)}
                        className="p-1 rounded hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated text-dark-text-muted hover:text-dark-text disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                        title="הזז קטגוריה למטה"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Active / Inactive Toggle */}
                    <div className="flex items-center gap-1.5 shrink-0" dir="ltr" title={!isInactive ? 'קטגוריה פעילה (לחץ להשבתה)' : 'קטגוריה מושבתת (לחץ להפעלה)'}>
                      <button
                        type="button"
                        onClick={(e) => handleToggleActive(cat, e)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          !isInactive ? 'bg-emerald-500' : 'bg-slate-600'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                            !isInactive ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenAddSub(cat)}
                      className="px-2.5 py-1.5 rounded-lg border border-dark-border light:border-light-border hover:border-brand-primary text-[11px] font-semibold flex items-center gap-1 transition-colors bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text shrink-0"
                      title="הוסף תת-קטגוריה"
                    >
                      <Plus className="w-3.5 h-3.5 text-brand-primary" />
                      <span>תת-קטגוריה</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(cat)}
                      className="p-1.5 rounded-lg border border-dark-border/60 light:border-light-border/60 hover:bg-dark-surface light:hover:bg-light-surface text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text transition-colors shrink-0"
                      title="ערוך קטגוריה ראשית"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(cat)}
                      className="p-1.5 rounded-lg border border-dark-border/60 light:border-light-border/60 hover:bg-rose-500/10 text-dark-text-muted light:text-light-text-muted hover:text-rose-500 transition-colors shrink-0"
                      title="מחק קטגוריה ראשית"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleExpand(cat.id)}
                      className="p-1.5 rounded-lg hover:bg-dark-surface light:hover:bg-light-surface text-dark-text-muted light:text-light-text-muted transition-transform shrink-0"
                      title={isExpanded ? 'סגור תתי-קטגוריות' : 'הצג תתי-קטגוריות'}
                    >
                      <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Subcategories Grid */}
                {isExpanded && (
                  <div className="p-4 pt-2 border-t border-dark-border/40 light:border-light-border/40 bg-dark-surface/50 light:bg-light-surface/50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 mt-2">
                      {subs.map((sub, subIdx) => {
                        const isSubInactive = sub.isActive === false;
                        return (
                          <div
                            key={sub.id}
                            className={`group p-2.5 rounded-xl border flex items-center justify-between gap-2 shadow-2xs transition-colors ${
                              isSubInactive
                                ? 'border-dark-border/40 light:border-light-border/40 bg-dark-surface/40 light:bg-light-surface/40 opacity-60 border-dashed'
                                : 'border-dark-border/60 light:border-light-border/60 bg-dark-surface light:bg-light-surface hover:border-brand-primary/40'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <CategoryBadge category={sub.name} customSvg={sub.customSvg} size={16} className="scale-90" />
                              <div className="truncate">
                                <div className={`text-xs font-semibold truncate ${
                                  isSubInactive ? 'line-through text-dark-text-muted' : 'text-dark-text light:text-light-text'
                                }`}>
                                  {sub.name}
                                </div>
                                {sub.nameEn && (
                                  <div className="text-[10px] text-dark-text-muted light:text-light-text-muted truncate">
                                    {sub.nameEn}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                              {/* Subcategory Reorder Up / Down */}
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  disabled={subIdx === 0}
                                  onClick={(e) => handleReorderSubcategory(cat.id, sub.id, 'up', e)}
                                  className="p-0.5 rounded text-dark-text-muted hover:text-dark-text disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                                  title="הזז תת-קטגוריה למעלה"
                                >
                                  <ArrowUp className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  disabled={subIdx === subs.length - 1}
                                  onClick={(e) => handleReorderSubcategory(cat.id, sub.id, 'down', e)}
                                  className="p-0.5 rounded text-dark-text-muted hover:text-dark-text disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                                  title="הזז תת-קטגוריה למטה"
                                >
                                  <ArrowDown className="w-3 h-3" />
                                </button>
                              </div>

                              {/* Subcategory Active Toggle */}
                              <div className="flex items-center gap-1 shrink-0 mr-1" dir="ltr" title={!isSubInactive ? 'תת-קטגוריה פעילה (לחץ להשבתה)' : 'תת-קטגוריה מושבתת (לחץ להפעלה)'}>
                                <button
                                  type="button"
                                  onClick={(e) => handleToggleActive(sub, e)}
                                  className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    !isSubInactive ? 'bg-emerald-500' : 'bg-slate-600'
                                  }`}
                                >
                                  <span
                                    className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                                      !isSubInactive ? 'translate-x-3' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleOpenEdit(sub, cat.name)}
                                className="p-1 rounded-md text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated transition-colors"
                                title="ערוך תת-קטגוריה"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCategory(sub)}
                                className="p-1 rounded-md text-dark-text-muted light:text-light-text-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                                title="מחק תת-קטגוריה"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {/* Quick Add Subcategory Card inside grid */}
                      <button
                        type="button"
                        onClick={() => handleOpenAddSub(cat)}
                        className="p-2.5 rounded-xl border border-dashed border-dark-border light:border-light-border hover:border-brand-primary text-dark-text-muted light:text-light-text-muted hover:text-brand-primary flex items-center justify-center gap-2 text-xs font-medium transition-colors bg-dark-surface/30 light:bg-light-surface/30"
                      >
                        <Plus className="w-4 h-4" />
                        <span>הוסף תת-קטגוריה</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Danger Zone: Data Management & Reset */}
      <div className="p-6 rounded-2xl border border-red-500/30 bg-red-500/5 light:bg-red-50/50 space-y-5">
        <div>
          <h3 className="font-bold text-lg flex items-center gap-2 text-red-500">
            <AlertTriangle className="w-5 h-5" />
            <span>{lang === 'he' ? 'אזור פעולות רגישות (Danger Zone)' : 'Danger Zone'}</span>
          </h3>
          <p className="text-xs text-dark-text-muted light:text-light-text-muted mt-0.5">
            {lang === 'he'
              ? 'פעולות בלתי הפיכות למחיקת תנועות או איפוס מלא של נתוני המערכת'
              : 'Irreversible operations to clear transactions or perform a full factory reset'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Option 1: Delete All Transactions */}
          <div className="p-4 rounded-xl border border-red-500/20 bg-dark-surface light:bg-light-surface flex flex-col justify-between gap-4">
            <div className="space-y-1.5">
              <div className="font-bold text-sm text-dark-text light:text-light-text flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-amber-500" />
                <span>{lang === 'he' ? 'מחיקת כל התנועות' : 'Delete All Transactions'}</span>
              </div>
              <p className="text-dark-text-muted light:text-light-text-muted text-[11px] leading-relaxed">
                {lang === 'he'
                  ? 'מוחק את כל היסטוריית התנועות, הפיצולים, הקישורים וההערות. החשבונות המחוברים והקטגוריות יישמרו (אידיאלי לסנכרון מחדש).'
                  : 'Permanently deletes all transactions, splits, links, and notes. Connected accounts and category rules will be preserved.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDangerAction('transactions');
                setDangerInput('');
                setDangerError('');
                setDangerSuccess('');
              }}
              className="w-full py-2.5 px-4 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 font-bold text-xs transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>{lang === 'he' ? 'מחק את כל התנועות' : 'Delete All Transactions'}</span>
            </button>
          </div>

          {/* Option 2: Factory Reset / Wipe All Data */}
          <div className="p-4 rounded-xl border border-red-500/30 bg-dark-surface light:bg-light-surface flex flex-col justify-between gap-4">
            <div className="space-y-1.5">
              <div className="font-bold text-sm text-red-500 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>{lang === 'he' ? 'איפוס מלא ומחיקת כל הנתונים' : 'Factory Reset / Wipe All Data'}</span>
              </div>
              <p className="text-dark-text-muted light:text-light-text-muted text-[11px] leading-relaxed">
                {lang === 'he'
                  ? 'מחיקה מוחלטת ובלתי הפיכה של כל החשבונות, פרטי ההתחברות, התנועות, הקטגוריות המותאמות, התקציבים והיעדים. החזרה למצב נקי לחלוטין.'
                  : 'Permanently wipes all accounts, credentials, transactions, custom categories, budgets, and goals. Returns to a blank slate.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDangerAction('all_data');
                setDangerInput('');
                setDangerError('');
                setDangerSuccess('');
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition-colors shadow-sm flex items-center justify-center gap-2"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>{lang === 'he' ? 'אפס מערכת ומחק הכל' : 'Factory Reset & Wipe All'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Add / Edit Category & SVG Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-dark-surface light:bg-light-surface border border-dark-border light:border-light-border rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Tag className="w-5 h-5 text-brand-primary" />
                <span>
                  {editingCat
                    ? `עריכת קטגוריה: "${editingCat.name}"`
                    : modalParentId
                    ? `הוספת תת-קטגוריה תחת "${modalParentName}"`
                    : 'הוספת קטגוריה ראשית'}
                </span>
              </h3>
              <button onClick={() => { setIsModalOpen(false); setEditingCat(null); }} className="p-1 rounded-lg hover:bg-dark-surface-elevated text-dark-text-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitCategory} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">שם הקטגוריה (בעברית) *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="למשל: ספורט וכושר"
                    className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs focus:border-brand-primary focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">שם באנגלית (אופציונלי)</label>
                  <input
                    type="text"
                    value={formNameEn}
                    onChange={(e) => setFormNameEn(e.target.value)}
                    placeholder="e.g. Fitness"
                    className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs focus:border-brand-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">סוג תנועה</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs focus:border-brand-primary focus:outline-none cursor-pointer"
                  >
                    <option value="expense">הוצאה (Expense)</option>
                    <option value="income">הכנסה (Income)</option>
                    <option value="both">הכנסה והוצאה (Both)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">צבע נושא</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formColor}
                      onChange={(e) => setFormColor(e.target.value)}
                      className="w-10 h-10 p-0.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={formColor}
                      onChange={(e) => setFormColor(e.target.value)}
                      className="flex-1 p-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Custom SVG Section */}
              <div className="p-3.5 rounded-xl border border-dark-border/80 light:border-light-border/80 bg-dark-surface-elevated/60 light:bg-light-surface-elevated/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold flex items-center gap-1.5 text-dark-text light:text-light-text">
                    <FileCode className="w-4 h-4 text-brand-cyan" />
                    <span>עיצוב SVG מותאם אישית (אופציונלי)</span>
                  </div>

                  <label className="cursor-pointer px-2.5 py-1 rounded-lg bg-brand-cyan/10 hover:bg-brand-cyan/20 text-brand-cyan text-[11px] font-semibold flex items-center gap-1 transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>העלה קובץ .svg</span>
                    <input
                      type="file"
                      accept=".svg"
                      onChange={handleSvgFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <p className="text-[11px] text-dark-text-muted light:text-light-text-muted">
                  הדבק קוד SVG (תקני עם viewBox 0 0 24 24) או העלה קובץ. לחץ על "הורד מפרט ופרומפט SVG" לקבלת הנחיות מדויקות ליצירה עם AI.
                </p>

                <textarea
                  rows={3}
                  value={formSvg}
                  onChange={(e) => setFormSvg(e.target.value)}
                  onBlur={() => {
                    if (formSvg.trim()) setFormSvg(normalizeCategorySvg(formSvg.trim()));
                  }}
                  placeholder="<svg viewBox='0 0 24 24' stroke='currentColor' fill='none' stroke-width='2'>...</svg>"
                  className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text font-mono text-[11px] focus:border-brand-primary focus:outline-none"
                  dir="ltr"
                />

                {/* Live Preview */}
                {formSvg && (
                  <div className="flex items-center gap-3 pt-1">
                    <span className="text-[11px] text-dark-text-muted light:text-light-text-muted">תצוגה מקדימה:</span>
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center p-2 border border-black/5 dark:border-white/10 [&>svg]:w-full [&>svg]:h-full [&>svg]:stroke-current [&>svg_*]:stroke-current transition-colors"
                      style={{ color: formColor, backgroundColor: `${formColor}20` }}
                      dangerouslySetInnerHTML={{ __html: normalizeCategorySvg(formSvg) }}
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text text-xs font-medium hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated transition-colors"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={submittingCat || !formName.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-primary-hover disabled:opacity-50 transition-colors shadow-sm"
                >
                  {submittingCat ? 'שומר...' : editingCat ? 'עדכן קטגוריה' : 'שמור קטגוריה'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Restore Categories to Default Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-dark-surface light:bg-light-surface border border-rose-500/40 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2 text-rose-500">
                <RotateCcw className="w-5 h-5" />
                <span>{lang === 'he' ? 'שחזור קטגוריות לברירת מחדל' : 'Restore Categories to Default'}</span>
              </h3>
              <button
                onClick={() => { setShowResetModal(false); setResetConfirmText(''); setResetError(''); }}
                disabled={resetLoading}
                className="p-1 rounded-lg hover:bg-dark-surface-elevated text-dark-text-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-dark-text-muted light:text-light-text-muted leading-relaxed">
              {lang === 'he'
                ? 'פעולה זו תשחזר את עץ הקטגוריות והאייקונים המקוריים של המערכת (MoneyApp). כל הקטגוריות, תתי-הקטגוריות והעיצובים המותאמים אישית יוחלפו במבנה ברירת המחדל.'
                : 'This will restore all categories, subcategories, and icons back to system default (MoneyApp). Custom categories will be overwritten.'}
            </p>

            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs space-y-2">
              <div className="font-semibold text-rose-400">
                {lang === 'he'
                  ? 'כדי לאשר, הקלד "שחזר קטגוריות" למטה:'
                  : 'To confirm, type "RESET" below:'}
              </div>
              <input
                type="text"
                value={resetConfirmText}
                onChange={(e) => { setResetConfirmText(e.target.value); setResetError(''); }}
                placeholder={lang === 'he' ? 'שחזר קטגוריות' : 'RESET'}
                disabled={resetLoading}
                className="w-full p-2.5 rounded-lg border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text text-xs font-semibold focus:border-rose-500 focus:outline-none"
                autoFocus
              />
            </div>

            {resetError && (
              <div className="text-xs text-rose-500 font-semibold">{resetError}</div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setShowResetModal(false); setResetConfirmText(''); setResetError(''); }}
                disabled={resetLoading}
                className="flex-1 py-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text text-xs font-medium hover:bg-dark-surface-elevated transition-colors"
              >
                {lang === 'he' ? 'ביטול' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleResetCategories}
                disabled={resetLoading || !resetConfirmText.trim()}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-50 transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                {resetLoading ? (lang === 'he' ? 'משחזר...' : 'Resetting...') : (lang === 'he' ? 'אשר שחזור מלא' : 'Confirm Reset')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Danger Action Confirmation Modal */}
      {dangerAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-dark-surface light:bg-light-surface border border-red-500/40 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2 text-red-500">
                <AlertTriangle className="w-5 h-5" />
                <span>
                  {dangerAction === 'transactions'
                    ? (lang === 'he' ? 'אישור מחיקת כל התנועות' : 'Confirm Delete All Transactions')
                    : (lang === 'he' ? 'אישור איפוס מלא ומחיקת הכל' : 'Confirm Factory Reset')}
                </span>
              </h3>
              <button
                onClick={() => { setDangerAction(null); setDangerInput(''); setDangerError(''); }}
                disabled={dangerLoading}
                className="p-1 rounded-lg hover:bg-dark-surface-elevated text-dark-text-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-dark-text-muted light:text-light-text-muted leading-relaxed">
              {dangerAction === 'transactions'
                ? (lang === 'he'
                    ? 'פעולה זו תמחק לצמיתות את כל התנועות והעסקאות מכל החשבונות. החשבונות עצמם יישארו מחוברים (אידיאלי לסנכרון היסטוריה מחדש).'
                    : 'This will permanently delete all transactions across all accounts. Connected accounts will remain.')
                : (lang === 'he'
                    ? 'אזהרה חמורה: פעולה זו תמחק לצמיתות את כל החשבונות, פרטי ההתחברות, העסקאות, התקציבים, היעדים והחוקים. המערכת תחזור למצב נקי לחלוטין. לא ניתן לשחזר את המידע!'
                    : 'CRITICAL WARNING: This will permanently delete all accounts, credentials, transactions, budgets, goals, and rules. This cannot be undone!')}
            </p>

            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs space-y-2">
              <div className="font-semibold text-red-400">
                {lang === 'he'
                  ? `כדי לאשר, הקלד "${dangerAction === 'transactions' ? 'מחק תנועות' : 'איפוס מלא'}" למטה:`
                  : `To confirm, type "${dangerAction === 'transactions' ? 'DELETE' : 'WIPE ALL'}" below:`}
              </div>
              <input
                type="text"
                value={dangerInput}
                onChange={(e) => { setDangerInput(e.target.value); setDangerError(''); }}
                placeholder={dangerAction === 'transactions' ? (lang === 'he' ? 'מחק תנועות' : 'DELETE') : (lang === 'he' ? 'איפוס מלא' : 'WIPE ALL')}
                disabled={dangerLoading}
                className="w-full p-2.5 rounded-lg border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text text-xs font-semibold focus:border-red-500 focus:outline-none"
                autoFocus
              />
            </div>

            {dangerError && (
              <div className="text-xs text-red-500 font-semibold">{dangerError}</div>
            )}

            {dangerSuccess && (
              <div className="text-xs text-brand-income font-semibold flex items-center gap-1.5">
                <Check className="w-4 h-4" />
                <span>{dangerSuccess}</span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setDangerAction(null); setDangerInput(''); setDangerError(''); }}
                disabled={dangerLoading}
                className="flex-1 py-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text text-xs font-medium hover:bg-dark-surface-elevated transition-colors"
              >
                {lang === 'he' ? 'ביטול' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleExecuteDangerAction}
                disabled={dangerLoading || !dangerInput.trim()}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold disabled:opacity-50 transition-colors shadow-sm"
              >
                {dangerLoading ? (lang === 'he' ? 'מוחק...' : 'Deleting...') : (lang === 'he' ? 'אשר מחיקה לצמיתות' : 'Confirm Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
