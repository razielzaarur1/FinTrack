'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { 
  Check, 
  X, 
  AlertCircle, 
  CreditCard, 
  Calendar, 
  FileText, 
  ShieldAlert, 
  Sparkles,
  Save,
  Layers,
  Info,
  Tag,
  Receipt,
  Link2,
  Split,
  Database,
  Plus,
  Trash2,
  Upload,
  Link as LinkIcon,
  Search,
  Copy,
  RefreshCw,
  Hash,
  ExternalLink,
  Globe,
  Sun,
  Moon
} from 'lucide-react';
import { api } from '@/lib/api';
import CategoryBadge from '@/components/common/CategoryBadge';
import CategoryPicker from '@/components/common/CategoryPicker';
import { formatILS, formatDate, cleanSpacedHebrew, getTransactionTitle, formatCurrency, extractInstallmentInfo } from '@/lib/formatters';

function ChromeErrorPage() {
  const [currentHost, setCurrentHost] = useState('');
  const [isHebrew, setIsHebrew] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.title = 'This site can’t be reached';
      setCurrentHost(window.location.hostname || 'localhost');
      const lang = navigator.language || navigator.userLanguage || '';
      if (lang.startsWith('he')) {
        setIsHebrew(true);
        document.title = 'לא ניתן להגיע לאתר הזה';
      }
    }
  }, []);

  const handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <div
      className="min-h-screen w-full bg-white dark:bg-[#202124] text-[#202124] dark:text-[#e8eaed] px-6 py-16 flex flex-col justify-start select-none"
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
        direction: isHebrew ? 'rtl' : 'ltr',
        textAlign: isHebrew ? 'right' : 'left'
      }}
    >
      <div className="max-w-[600px] w-full mx-auto">
        {/* Chrome Sad Document Icon */}
        <div className="mb-6">
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 6C10.3431 6 9 7.34315 9 9V39C9 40.6569 10.3431 42 12 42H36C37.6569 42 39 40.6569 39 39V16L29 6H12Z"
              fill="#dadce0"
              className="dark:fill-[#3c4043]"
            />
            <path
              d="M28 6V17H39L28 6Z"
              fill="#bdc1c6"
              className="dark:fill-[#5f6368]"
            />
            <circle cx="19" cy="25" r="2.5" fill="#5f6368" className="dark:fill-[#9aa0a6]" />
            <circle cx="29" cy="25" r="2.5" fill="#5f6368" className="dark:fill-[#9aa0a6]" />
            <path
              d="M28 33C27 31.5 25 31.5 24 31.5C23 31.5 21 31.5 20 33"
              stroke="#5f6368"
              className="dark:stroke-[#9aa0a6]"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-normal leading-8 mb-4 text-[#202124] dark:text-[#e8eaed]">
          {isHebrew ? 'לא ניתן להגיע לאתר הזה' : 'This site can’t be reached'}
        </h1>

        {/* Body Text */}
        <p className="text-sm leading-[22px] mb-4 text-[#5f6368] dark:text-[#9aa0a6]">
          {isHebrew ? (
            <>
              ייתכן שדף האינטרנט בכתובת{' '}
              <strong className="text-[#202124] dark:text-[#e8eaed] font-medium">{currentHost}</strong>{' '}
              מושבת באופן זמני או שהועבר לצמיתות לכתובת אינטרנט חדשה.
            </>
          ) : (
            <>
              The webpage at{' '}
              <strong className="text-[#202124] dark:text-[#e8eaed] font-medium">{currentHost}</strong>{' '}
              might be temporarily down or it may have moved permanently to a new web address.
            </>
          )}
        </p>

        {/* Troubleshooting bullet points */}
        <ul className="text-sm leading-6 mb-7 text-[#5f6368] dark:text-[#9aa0a6] list-disc list-inside space-y-1">
          {isHebrew ? (
            <>
              <li>בדוק את החיבור לרשת</li>
              <li>בדוק את שרת ה-proxy ואת חומת האש</li>
              <li>הפעל את אבחון הרשת של Windows</li>
            </>
          ) : (
            <>
              <li>Check the connection</li>
              <li>Check the proxy and the firewall</li>
              <li>Running Windows Network Diagnostics</li>
            </>
          )}
        </ul>

        {/* Reload button */}
        <div className="mb-10">
          <button
            type="button"
            onClick={handleReload}
            className="bg-[#1a73e8] hover:bg-[#1765cc] text-white text-sm font-medium py-2 px-4 rounded transition-colors"
          >
            {isHebrew ? 'טען מחדש' : 'Reload'}
          </button>
        </div>

        {/* Error code at bottom */}
        <div className="text-[11px] font-medium text-[#70757a] dark:text-[#9aa0a6] tracking-wider uppercase">
          HTTP ERROR 404
        </div>
      </div>
    </div>
  );
}

export default function TmaTransactionPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const id = params?.id;
  const token = searchParams?.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tx, setTx] = useState(null);

  // Tabs state: details | receipts | notes | links | splits | similar | scraper
  const [activeTab, setActiveTab] = useState('details');

  // Form edit state (Details tab)
  const [merchantName, setMerchantName] = useState('');
  const [category, setCategory] = useState('');
  const [userDescription, setUserDescription] = useState('');
  const [isIgnored, setIsIgnored] = useState(false);
  const [applyToSimilar, setApplyToSimilar] = useState(false);
  const [savingTx, setSavingTx] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Receipts state
  const fileInputRef = useRef(null);
  const [receipts, setReceipts] = useState([]);
  const [uploadMode, setUploadMode] = useState('file'); // 'file' | 'url'
  const [digitalUrl, setDigitalUrl] = useState('');
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [receiptFeedback, setReceiptFeedback] = useState(null);

  // Notes state
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Links state
  const [links, setLinks] = useState([]);
  const [linkType, setLinkType] = useState('refund'); // 'refund' | 'related' | 'correction'
  const [linkSearch, setLinkSearch] = useState('');
  const [linkableTxs, setLinkableTxs] = useState([]);
  const [loadingLinkable, setLoadingLinkable] = useState(false);
  const [linkingSuccess, setLinkingSuccess] = useState('');

  // Splits state
  const [splits, setSplits] = useState([]);
  const [savingSplits, setSavingSplits] = useState(false);
  const [splitError, setSplitError] = useState('');

  // Similar transactions state
  const [similarTxs, setSimilarTxs] = useState([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);

  // Scraper raw data state
  const [copiedRaw, setCopiedRaw] = useState(false);

  // Telegram WebApp state
  const [initData, setInitData] = useState('');
  const [isTelegramEnv, setIsTelegramEnv] = useState(null); // null: detecting, true: in telegram, false: blocked browser
  const [isLightMode, setIsLightMode] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [fxDetails, setFxDetails] = useState(null);
  const [loadingFx, setLoadingFx] = useState(false);

  // Telegram WebApp initialization & detection
  useEffect(() => {
    let checkInterval = null;
    let attempts = 0;

    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('tma_theme');
      if (savedTheme === 'light') {
        setIsLightMode(true);
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
      } else {
        setIsLightMode(false);
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      }
    }

    const checkTg = () => {
      attempts++;
      if (typeof window !== 'undefined') {
        if (window.Telegram?.WebApp) {
          const tg = window.Telegram.WebApp;
          try {
            tg.ready();
            tg.expand();
            const currentLight = localStorage.getItem('tma_theme') === 'light';
            if (tg.setHeaderColor) {
              tg.setHeaderColor(currentLight ? '#ffffff' : '#0a0d14');
            }
            if (tg.setBackgroundColor) {
              tg.setBackgroundColor(currentLight ? '#f8fafc' : '#0a0d14');
            }
          } catch (e) {
            console.warn('Telegram WebApp init error:', e);
          }

          if (tg.initData) {
            setInitData(tg.initData);
            setIsTelegramEnv(true);
            if (checkInterval) clearInterval(checkInterval);
            return true;
          }
        }

        // Also check hash parameters for launch data
        if (window.location.hash && window.location.hash.includes('tgWebAppData=')) {
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const hashData = hashParams.get('tgWebAppData');
          if (hashData) {
            setInitData(hashData);
            setIsTelegramEnv(true);
            if (checkInterval) clearInterval(checkInterval);
            return true;
          }
        }
      }

      // After 3 attempts (approx 300ms), confirm this is a standard external browser
      if (attempts >= 3) {
        setIsTelegramEnv(false);
        if (checkInterval) clearInterval(checkInterval);
      }
      return false;
    };

    if (!checkTg()) {
      checkInterval = setInterval(checkTg, 100);
    }

    return () => {
      if (checkInterval) clearInterval(checkInterval);
    };
  }, []);

  // Fetch all transaction data & sub-records
  useEffect(() => {
    if (!id || isTelegramEnv === null) return;
    if (isTelegramEnv === false) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    async function loadData() {
      setLoading(true);
      setError('');

      try {
        // 1. Fetch main transaction details
        const txRes = await api.getTmaTransaction(id, token, initData);
        if (!isMounted) return;

        if (txRes.error || !txRes.data?.data) {
          setError(txRes.error || 'לא ניתן לטעון את פרטי התנועה או שהקישור פג תוקף.');
          setLoading(false);
          return;
        }

        const data = txRes.data.data;
        setTx(data);
        setMerchantName(data.merchantName || '');
        setCategory(data.category || '');
        setUserDescription(data.userDescription || '');
        setIsIgnored(Boolean(data.isIgnored));

        // 2. Fetch sub-records in parallel
        api.getTmaSimilar(id, token, initData).then((res) => {
          if (isMounted && res.data?.data) setSimilarTxs(res.data.data);
        }).catch(() => {});

        api.getTmaSplits(id, token, initData).then((res) => {
          if (isMounted && res.data?.data) setSplits(res.data.data);
        }).catch(() => {});

        api.getTmaNotes(id, token, initData).then((res) => {
          if (isMounted && res.data?.data) setNotes(res.data.data);
        }).catch(() => {});

        api.getTmaLinks(id, token, initData).then((res) => {
          if (isMounted && res.data?.data) setLinks(res.data.data);
        }).catch(() => {});

        api.getTmaReceipts(id, token, initData).then((res) => {
          if (isMounted && res.data?.data) setReceipts(res.data.data);
        }).catch(() => {});

        // Fetch initial list of transactions for linking
        api.getTmaLinkable(id, '', token, initData).then((res) => {
          if (isMounted && res.data?.data) setLinkableTxs(res.data.data);
        }).catch(() => {});

        // Fetch latest dynamic categories for accurate badge icons and colors
        api.getCategories({ tree: 'true' }).then((res) => {
          if (isMounted && res.data?.data) setDynamicCategories(res.data.data);
        }).catch(() => {});

        // Fetch reconciliation candidates
        setLoadingCandidates(true);
        api.getTmaCandidates(id, token, initData).then((res) => {
          if (isMounted && res.data?.data) setCandidates(res.data.data);
        }).catch(() => {}).finally(() => { if (isMounted) setLoadingCandidates(false); });

        // Fetch foreign currency FX details
        const isForeignTx = Boolean(
          data.isForeign ||
          (data.originalCurrency && data.originalCurrency !== 'ILS') ||
          (data.rawData?.originalCurrency && data.rawData.originalCurrency !== 'ILS')
        );
        if (data.fxDetails) {
          setFxDetails(data.fxDetails);
        } else if (isForeignTx) {
          setLoadingFx(true);
          api.getTmaTxFxDetails(id, token, initData).then((res) => {
            if (isMounted && res.data?.data) setFxDetails(res.data.data);
          }).catch(() => {}).finally(() => { if (isMounted) setLoadingFx(false); });
        }

      } catch (err) {
        if (isMounted) {
          setError(err.message || 'שגיאת רשת בטעינת הנתונים');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [id, token, isTelegramEnv, initData]);

  // Handle Search for Linkable Transactions
  useEffect(() => {
    if (!id || !isTelegramEnv || activeTab !== 'links') return;
    const timer = setTimeout(() => {
      setLoadingLinkable(true);
      api.getTmaLinkable(id, linkSearch, token, initData)
        .then((res) => {
          if (res.data?.data) setLinkableTxs(res.data.data);
        })
        .finally(() => setLoadingLinkable(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [id, linkSearch, activeTab, isTelegramEnv, token, initData]);

  // Save Details
  const handleSaveDetails = async (e) => {
    if (e) e.preventDefault();
    setSavingTx(true);
    setSaveError('');
    setSaveSuccess(false);

    try {
      const payload = {
        merchantName: merchantName.trim() || undefined,
        category: category.trim() || undefined,
        userDescription: userDescription.trim() || null,
        isIgnored,
        applyToSimilar,
      };

      const res = await api.updateTmaTransaction(id, payload, token, initData);
      if (res.error) {
        setSaveError(res.error || res.message || 'שגיאה בשמירת השינויים');
        if (typeof window !== 'undefined' && window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
        }
      } else {
        setSaveSuccess(true);
        if (res.data?.data) {
          setTx((prev) => ({ ...prev, ...res.data.data }));
        }
        if (typeof window !== 'undefined' && window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
      }
    } catch (err) {
      setSaveError(err.message || 'שגיאה בלתי צפויה בשמירה');
    } finally {
      setSavingTx(false);
    }
  };

  // Receipts handlers
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingReceipt(true);
    setReceiptFeedback(null);
    try {
      const res = await api.uploadTmaReceiptFile(id, file, token, initData);
      if (res.data?.data) {
        setReceipts([res.data.data, ...receipts]);
        setReceiptFeedback({ type: 'success', text: 'הקבלה הועלתה ונותחה בהצלחה!' });
      } else {
        setReceiptFeedback({ type: 'error', text: res.error || 'נכשל בהעלאת הקבלה' });
      }
    } catch (err) {
      setReceiptFeedback({ type: 'error', text: err.message || 'שגיאה בהעלאה' });
    } finally {
      setUploadingReceipt(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUrlReceipt = async (e) => {
    e.preventDefault();
    if (!digitalUrl.trim()) return;
    setUploadingReceipt(true);
    setReceiptFeedback(null);
    try {
      const res = await api.addTmaReceiptUrl(id, digitalUrl.trim(), token, initData);
      if (res.data?.data) {
        setReceipts([res.data.data, ...receipts]);
        setDigitalUrl('');
        setReceiptFeedback({ type: 'success', text: 'קישור החשבונית נוסף בהצלחה!' });
      } else {
        setReceiptFeedback({ type: 'error', text: res.error || 'נכשל בהוספת הקישור' });
      }
    } catch (err) {
      setReceiptFeedback({ type: 'error', text: err.message || 'שגיאה בהוספת הקישור' });
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handleDeleteReceipt = async (receiptId) => {
    try {
      await api.deleteTmaReceipt(id, receiptId, token, initData);
      setReceipts(receipts.filter(r => r.id !== receiptId));
    } catch (err) {
      console.error('Delete receipt failed:', err);
    }
  };

  // Notes handlers
  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setAddingNote(true);
    try {
      const res = await api.addTmaNote(id, newNote.trim(), token, initData);
      if (res.data?.data) {
        setNotes([res.data.data, ...notes]);
        setNewNote('');
      }
    } finally {
      setAddingNote(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    try {
      await api.deleteTmaNote(id, noteId, token, initData);
      setNotes(notes.filter(n => n.id !== noteId));
    } catch (err) {
      console.error('Delete note failed:', err);
    }
  };

  // Links handlers
  const handleLinkDirect = async (targetTxId) => {
    setLinkingSuccess('');
    try {
      const res = await api.linkTmaTransaction(id, { targetTransactionId: targetTxId, linkType }, token, initData);
      if (res.data) {
        const updated = await api.getTmaLinks(id, token, initData);
        if (updated.data?.data) setLinks(updated.data.data);
        setLinkingSuccess('התנועה קושרה בהצלחה!');
        if (typeof window !== 'undefined' && window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
        setTimeout(() => setLinkingSuccess(''), 3000);
      }
    } catch (err) {
      console.error('Link transaction failed:', err);
    }
  };

  const handleUnlink = async (linkId) => {
    try {
      await api.deleteTmaLink(id, linkId, token, initData);
      setLinks(links.filter(l => l.linkId !== linkId));
    } catch (err) {
      console.error('Unlink failed:', err);
    }
  };

  // Splits handlers
  const currentAmountNum = parseFloat(tx?.amount) || 0;
  const parentAmount = Math.abs(currentAmountNum);
  const splitsTotal = splits.reduce((acc, s) => acc + (parseFloat(s.amount) || 0), 0);
  const splitsBalanced = Math.abs(parentAmount - splitsTotal) <= 0.01;
  const remainingAmount = Number((parentAmount - splitsTotal).toFixed(2));

  const handleAddSplitRow = () => {
    setSplits([...splits, { amount: 0, category: tx?.category || 'אחר', description: '' }]);
  };

  const handleSplitChange = (index, field, value) => {
    const updated = [...splits];
    updated[index][field] = field === 'amount' ? parseFloat(value) || 0 : value;
    setSplits(updated);
  };

  const handleRemoveSplitRow = (index) => {
    setSplits(splits.filter((_, idx) => idx !== index));
  };

  const handleSaveSplits = async () => {
    if (splits.length === 0) {
      setSplitError('יש להזין לפחות פיצול אחד');
      return;
    }
    const currentSplitsTotal = splits.reduce((acc, s) => acc + (Math.abs(parseFloat(s.amount)) || 0), 0);
    if (currentSplitsTotal > parentAmount + 0.01) {
      setSplitError(`סכום הפיצולים (${currentSplitsTotal.toFixed(2)} ₪) אינו יכול לעלות על סכום התנועה (${parentAmount.toFixed(2)} ₪)`);
      return;
    }
    setSplitError('');
    setSavingSplits(true);
    try {
      const sanitized = splits.map((s) => ({
        ...s,
        amount: Math.abs(parseFloat(s.amount) || 0),
        category: s.category || tx?.category || 'אחר / שונות',
      }));
      const res = await api.saveTmaSplits(id, sanitized, token, initData);
      if (res.error) {
        setSplitError(res.error || res.message || 'שגיאה בשמירת פיצולים');
        if (typeof window !== 'undefined' && window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
        }
      } else {
        if (typeof window !== 'undefined' && window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
        api.getTmaSplits(id, token, initData).then((r) => {
          if (r.data?.data) setSplits(r.data.data);
        });
        setActiveTab('details');
      }
    } catch (err) {
      setSplitError(err.message || 'שגיאה בשמירת פיצולים');
    } finally {
      setSavingSplits(false);
    }
  };

  const handleSplitByReceipt = (r) => {
    if (!r.extracted_data?.items || r.extracted_data.items.length === 0) return;
    const newSplits = r.extracted_data.items.map((item, idx) => ({
      id: `receipt-item-${idx}`,
      amount: Math.abs(parseFloat(item.price) || 0),
      category: item.category || category || tx?.category || 'אחר / שונות',
      description: item.name ? (item.qty > 1 ? `${item.name} (x${item.qty})` : item.name) : 'פריט מחשבונית',
    }));
    setSplits(newSplits);
    setActiveTab('splits');
    if (typeof window !== 'undefined' && window.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }
  };

  const handleTabsWheel = (e) => {
    if (e.deltaY !== 0) {
      e.currentTarget.scrollBy({ left: -e.deltaY, behavior: 'auto' });
    }
  };

  const toggleTheme = () => {
    const next = !isLightMode;
    setIsLightMode(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('tma_theme', next ? 'light' : 'dark');
      if (next) {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
      } else {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      }
      if (window.Telegram?.WebApp) {
        const tg = window.Telegram.WebApp;
        if (tg.setHeaderColor) tg.setHeaderColor(next ? '#ffffff' : '#0a0d14');
        if (tg.setBackgroundColor) tg.setBackgroundColor(next ? '#f8fafc' : '#0a0d14');
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
      }
    }
  };

  const handleToggleFeeClassification = async (linkId, currentStatus) => {
    try {
      const res = await api.updateTmaFeeClassification(id, linkId, !currentStatus, token, initData);
      if (res.data) {
        setLinks((prev) =>
          prev.map((l) => (l.linkId === linkId ? { ...l, isFeeClassified: !currentStatus } : l))
        );
      }
    } catch (err) {
      console.error('Failed to update fee classification:', err);
    }
  };

  const handleExecuteCandidateLink = async (cand) => {
    const candTx = cand.candidate || cand;
    const candId = candTx.id || cand.id;
    try {
      const diff = Math.abs(Math.abs(parseFloat(tx.amount)) - Math.abs(parseFloat(candTx.amount || 0)));
      const hasFee = diff > 0.009;
      const res = await api.linkTmaTransaction(
        id,
        {
          targetTransactionId: candId,
          linkType: 'cc_billing_match',
          feeAmount: hasFee ? diff : null,
          feeCategory: 'עמלות',
          isFeeClassified: false,
        },
        token,
        initData
      );
      if (res.data) {
        api.getTmaLinks(id, token, initData).then((r) => {
          if (r.data?.data) setLinks(r.data.data);
        });
        api.getTmaCandidates(id, token, initData).then((r) => {
          if (r.data?.data) setCandidates(r.data.data);
        });
        if (typeof window !== 'undefined' && window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
      }
    } catch (err) {
      console.error('Failed to link candidate:', err);
    }
  };

  const handleClose = () => {
    if (typeof window !== 'undefined' && window.Telegram?.WebApp?.close) {
      window.Telegram.WebApp.close();
    }
  };

  if (isTelegramEnv === false) {
    return <ChromeErrorPage />;
  }

  if (isTelegramEnv === null) {
    return <div className="min-h-screen bg-white dark:bg-[#202124]" />;
  }

  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />

      <div className={`min-h-screen font-sans rtl flex flex-col justify-between overflow-x-hidden transition-colors ${
        isLightMode ? 'light bg-[#f8fafc] text-[#0f172a]' : 'dark bg-[#0a0d14] text-[#f1f5f9]'
      }`}>

        {/* Loading State */}
        {loading && isTelegramEnv !== false && (
          <div className="p-12 text-center space-y-3 my-auto">
            <div className="w-9 h-9 border-2 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-dark-text-muted light:text-light-text-muted">טוען את פרטי התנועה...</p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && isTelegramEnv !== false && (
          <div className="p-6 m-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs space-y-2 my-auto">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>שגיאה בגישה לתנועה</span>
            </div>
            <p className="leading-relaxed text-dark-text light:text-light-text">{error}</p>
            <p className="text-[11px] text-dark-text-muted light:text-light-text-muted pt-2 border-t border-rose-500/20">
              ודא שפתחת את הקישור מתוך הודעת הבוט בטלגרם ושלא חלפו יותר מ-7 ימים מעת קבלתה.
            </p>
          </div>
        )}

        {/* Main Content (Matching TransactionDrawer UI) */}
        {!loading && tx && isTelegramEnv !== false && (() => {
          const instInfo = extractInstallmentInfo(tx);
          return (
          <div className="w-full max-w-lg mx-auto min-h-screen flex flex-col justify-between border-x bg-dark-surface light:bg-light-surface border-dark-border light:border-light-border shadow-2xl transition-colors">
            {/* Header (Exact TransactionDrawer layout) */}
            <div className="p-4 sm:p-5 border-b border-dark-border light:border-light-border flex items-center justify-between sticky top-0 backdrop-blur-md z-20 transition-colors bg-dark-surface/95 light:bg-light-surface/95">
              <div className="flex items-center gap-3 min-w-0">
                <CategoryBadge category={category || tx.category} size={22} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-brand-primary/15 text-brand-primary">
                      {tx.accountDisplayName || tx.bankCompany?.toUpperCase()} {tx.cardLast4 ? `(••${tx.cardLast4})` : ''}
                    </span>
                    {tx.status === 'pending' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium">
                        ממתין
                      </span>
                    )}
                  </div>
                  <div className="text-base sm:text-lg font-bold mt-0.5 truncate max-w-[220px] sm:max-w-xs text-dark-text light:text-light-text">
                    {userDescription || cleanSpacedHebrew(getTransactionTitle(tx))}
                  </div>
                  <div className="text-xs font-mono flex items-center gap-1.5 flex-wrap text-dark-text-muted light:text-light-text-muted">
                    <span>{formatDate(tx.date, 'he')}</span>
                    <span>•</span>
                    <span className="font-bold text-dark-text light:text-light-text">
                      {formatILS(tx.amount, { showSign: true })}
                    </span>
                    {instInfo.isInstallment && (
                      <>
                        <span className="px-1.5 py-0.5 rounded bg-brand-primary/20 text-brand-primary text-[10px] font-semibold">
                          💳 {instInfo.text}
                        </span>
                        {instInfo.totalAmount > Math.abs(parseFloat(tx.amount) || 0) && (
                          <span className="text-[10px] text-dark-text-muted light:text-light-text-muted font-sans">
                            (מתוך {formatILS(instInfo.totalAmount)})
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                className="p-2 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text transition-colors cursor-pointer"
                title={isLightMode ? 'מעבר למצב כהה' : 'מעבר למצב בהיר'}
              >
                {isLightMode ? <Moon className="w-5 h-5 text-brand-primary" /> : <Sun className="w-5 h-5 text-amber-400" />}
              </button>
            </div>

            {/* Tab Selector Bar (All 7 TransactionDrawer tabs) */}
            <div
              onWheel={handleTabsWheel}
              className="flex border-b border-dark-border light:border-light-border px-3 gap-1 text-xs font-medium overflow-x-auto no-scrollbar select-none sticky top-[73px] backdrop-blur-md z-10 transition-colors bg-dark-surface/95 light:bg-light-surface/95"
            >
              <button
                type="button"
                onClick={() => setActiveTab('details')}
                className={`py-3 px-2.5 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
                  activeTab === 'details'
                    ? 'border-brand-primary text-brand-primary font-semibold'
                    : 'border-transparent text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>פרטים</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('receipts')}
                className={`py-3 px-2.5 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
                  activeTab === 'receipts'
                    ? 'border-brand-primary text-brand-primary font-semibold'
                    : 'border-transparent text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>חשבונית 🧾 {receipts.length > 0 && `(${receipts.length})`}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('notes')}
                className={`py-3 px-2.5 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
                  activeTab === 'notes'
                    ? 'border-brand-primary text-brand-primary font-semibold'
                    : 'border-transparent text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
                }`}
              >
                <span>💬</span>
                <span>הערות ({notes.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('links')}
                className={`py-3 px-2.5 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
                  activeTab === 'links'
                    ? 'border-brand-primary text-brand-primary font-semibold'
                    : 'border-transparent text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>קישור תנועה ({links.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('splits')}
                className={`py-3 px-2.5 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
                  activeTab === 'splits'
                    ? 'border-brand-primary text-brand-primary font-semibold'
                    : 'border-transparent text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
                }`}
              >
                <Split className="w-3.5 h-3.5" />
                <span>פיצול ({splits.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('similar')}
                className={`py-3 px-2.5 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
                  activeTab === 'similar'
                    ? 'border-brand-primary text-brand-primary font-semibold'
                    : 'border-transparent text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>דומות ({similarTxs.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('scraper')}
                className={`py-3 px-2.5 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
                  activeTab === 'scraper'
                    ? 'border-brand-primary text-brand-primary font-semibold'
                    : 'border-transparent text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>נתוני סקריפר</span>
              </button>
            </div>

            {/* Main Tabs Content */}
            <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4">
              {/* 1. Details Tab */}
              {activeTab === 'details' && (
                <form onSubmit={handleSaveDetails} className="space-y-4">
                  {/* Custom Name / Nickname */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
                      כינוי מותאם אישית (יוצג ככותרת)
                    </label>
                    <input
                      type="text"
                      value={userDescription}
                      onChange={(e) => setUserDescription(e.target.value)}
                      placeholder={cleanSpacedHebrew(getTransactionTitle(tx))}
                      className="w-full p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-sm font-semibold focus:outline-none focus:border-brand-primary transition-colors"
                    />
                  </div>

                  {/* Read-Only Bank Merchant Name */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
                      שם בית העסק (מקור הבנק / כרטיס)
                    </label>
                    <div className="w-full p-2.5 rounded-xl border border-dark-border/80 light:border-light-border/80 bg-dark-surface-elevated/70 light:bg-light-surface-elevated/70 text-dark-text light:text-light-text font-medium text-sm flex items-center justify-between">
                      <span className="truncate">{cleanSpacedHebrew(merchantName || tx.merchantName || 'לא צוין בית עסק')}</span>
                      {similarTxs.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setActiveTab('similar')}
                          className="text-[11px] text-brand-primary hover:underline shrink-0 mr-2 font-semibold cursor-pointer"
                        >
                          הצג דומות ({similarTxs.length})
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Read-Only Financial Metadata Chips Grid */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-xl border border-dark-border/80 light:border-light-border/80 bg-dark-surface-elevated/60 light:bg-light-surface-elevated/60 space-y-1">
                      <div className="text-[10px] font-medium text-dark-text-muted light:text-light-text-muted">סכום חיוב</div>
                      <div className={`text-xs sm:text-sm font-bold font-mono ${currentAmountNum > 0 ? 'text-brand-income' : 'text-dark-text light:text-light-text'}`}>
                        {formatILS(tx.amount, { showSign: true })}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl border border-dark-border/80 light:border-light-border/80 bg-dark-surface-elevated/60 light:bg-light-surface-elevated/60 space-y-1">
                      <div className="text-[10px] font-medium text-dark-text-muted light:text-light-text-muted">תאריך עסקה</div>
                      <div className="text-xs font-semibold text-dark-text light:text-light-text font-mono mt-0.5">
                        {formatDate(tx.date, 'he')}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl border border-dark-border/80 light:border-light-border/80 bg-dark-surface-elevated/60 light:bg-light-surface-elevated/60 space-y-1">
                      <div className="text-[10px] font-medium text-dark-text-muted light:text-light-text-muted">חשבון / כרטיס</div>
                      <div className="text-xs font-semibold text-dark-text light:text-light-text truncate mt-0.5" title={tx.accountDisplayName || tx.bankCompany}>
                        {tx.accountDisplayName || tx.bankCompany?.toUpperCase() || 'ראשי'}
                      </div>
                    </div>
                  </div>

                  {/* Credit Card Billing Detection Banner */}
                  {(tx.isCcBilling || tx.category === 'חיוב אשראי') && (
                    <div className="p-3.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 flex items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
                      <div className="flex items-center gap-2.5">
                        <CreditCard className="w-5 h-5 text-indigo-400 shrink-0" />
                        <div>
                          <div className="font-bold text-dark-text light:text-light-text">
                            זוהה כחיוב חברת אשראי 💳
                          </div>
                          <div className="text-[11px] text-dark-text-muted light:text-light-text-muted">
                            מוחרג אוטומטית למניעת כפילות הוצאה
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('links')}
                        className="px-3 py-1.5 rounded-lg bg-brand-primary text-white font-semibold text-xs hover:bg-brand-primary-hover transition-all cursor-pointer shrink-0"
                      >
                        התאמות ({candidates.length}) ›
                      </button>
                    </div>
                  )}

                  {/* Foreign Currency & Conversion Fee Analysis Card */}
                  {loadingFx ? (
                    <div className="p-3.5 rounded-2xl border border-blue-500/20 bg-blue-500/5 flex items-center justify-center gap-2 text-xs text-blue-400">
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                      <span>טוען נתוני שער יציג ועמלות המרה...</span>
                    </div>
                  ) : (fxDetails || tx.fxDetails) && (() => {
                    const fx = fxDetails || tx.fxDetails;
                    return (
                    <div className="p-3.5 rounded-2xl border border-blue-500/30 bg-blue-500/5 dark:bg-blue-500/10 space-y-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-bold text-dark-text light:text-light-text">
                          <div className="p-1 rounded-md bg-blue-500/20 text-blue-400">
                            <Globe className="w-3.5 h-3.5" />
                          </div>
                          <span>עסקת מט״ח ({fx.foreignCurrency || fx.originalCurrency || 'מט״ח'}) ועלויות המרה</span>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-400 font-mono" dir="ltr">
                          {fx.foreignCurrency || fx.originalCurrency} / ILS
                        </span>
                      </div>

                      {/* 2-column: Original Foreign Amount vs Charged ILS */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 rounded-xl border border-dark-border/60 light:border-light-border/60 bg-dark-surface-elevated/50 light:bg-light-surface-elevated/50 space-y-0.5">
                          <div className="text-[10px] text-dark-text-muted light:text-light-text-muted">סכום במטבע מקורי</div>
                          <div className="text-xs sm:text-sm font-bold font-mono text-dark-text light:text-light-text" dir="ltr">
                            {formatCurrency(fx.foreignAmount, fx.foreignCurrency || fx.originalCurrency)}
                          </div>
                        </div>

                        <div className="p-2 rounded-xl border border-dark-border/60 light:border-light-border/60 bg-dark-surface-elevated/50 light:bg-light-surface-elevated/50 space-y-0.5">
                          <div className="text-[10px] text-dark-text-muted light:text-light-text-muted">סכום חיוב בפועל בחשבון</div>
                          <div className="text-xs sm:text-sm font-bold font-mono text-rose-500" dir="ltr">
                            {formatILS(fx.ilsAmount)}
                          </div>
                        </div>
                      </div>

                      {/* Rates Breakdown */}
                      <div className="text-[11px] space-y-1 pt-1 border-t border-blue-500/20 text-dark-text-muted light:text-light-text-muted">
                        <div className="flex items-center justify-between">
                          <span>שער יציג לתאריך העסקה ({formatDate(fx.rateDate || tx.date, 'he')}):</span>
                          <span className="font-mono font-semibold text-dark-text light:text-light-text" dir="ltr">
                            1 {fx.foreignCurrency || fx.originalCurrency} = ₪{Number(fx.representativeRate).toFixed(4)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span>עלות לפי שער יציג (ללא עמלות):</span>
                          <span className="font-mono font-semibold text-dark-text light:text-light-text" dir="ltr">
                            {formatILS(fx.costAtRepresentativeRate)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span>שער חיוב אפקטיבי של הכרטיס:</span>
                          <span className="font-mono font-semibold text-amber-500" dir="ltr">
                            1 {fx.foreignCurrency || fx.originalCurrency} = ₪{Number(fx.effectiveRate).toFixed(4)}
                          </span>
                        </div>
                      </div>

                      {/* Conversion Fee Banner */}
                      {fx.isPositiveFee ? (
                        <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/25 space-y-1">
                          <div className="flex items-center justify-between font-bold text-amber-500">
                            <span>עמלת המרה ששולמה:</span>
                            <span className="font-mono" dir="ltr">
                              +{formatILS(fx.conversionFeeILS)}
                              {fx.feePercent > 0 && ` (+${fx.feePercent}%)`}
                            </span>
                          </div>
                          <div className="text-[10px] text-dark-text-muted light:text-light-text-muted flex items-center justify-between">
                            <span>עלות עמלה ליחידת מטבע:</span>
                            <span className="font-semibold text-dark-text light:text-light-text font-mono" dir="rtl">
                              {Math.abs(fx.feePerUnitAgorot)} אגורות לכל {fx.foreignCurrency || fx.originalCurrency} (+{formatILS(Math.abs(fx.feePerUnit))})
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/25 space-y-1">
                          <div className="flex items-center justify-between font-bold text-emerald-500">
                            <span>הפרש לטובתך (חיוב נמוך מהשער היציג):</span>
                            <span className="font-mono" dir="ltr">
                              {formatILS(Math.abs(fx.conversionFeeILS))}
                              {fx.feePercent !== 0 && ` (${fx.feePercent}%)`}
                            </span>
                          </div>
                          <div className="text-[10px] text-dark-text-muted light:text-light-text-muted flex items-center justify-between">
                            <span>הפרש ליחידת מטבע:</span>
                            <span className="font-semibold text-emerald-500 font-mono" dir="rtl">
                              {Math.abs(fx.feePerUnitAgorot)} אגורות לכל {fx.foreignCurrency || fx.originalCurrency} ({formatILS(Math.abs(fx.feePerUnit))})
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                    );
                  })()}

                  {/* Installment Banner */}
                  {instInfo.isInstallment && (
                    <div className="p-3.5 rounded-2xl border border-brand-primary/30 bg-brand-primary/10 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <CreditCard className="w-4 h-4 text-brand-primary shrink-0" />
                        <div>
                          <div className="font-bold text-dark-text light:text-light-text">עסקת תשלומים: {instInfo.text}</div>
                          <div className="text-[11px] text-dark-text-muted light:text-light-text-muted mt-0.5">
                            סכום חיוב חודשי: {formatILS(tx.amount)}
                            {instInfo.totalAmount > 0 && ` • סך כולל של העסקה: ${formatILS(instInfo.totalAmount)}`}
                          </div>
                        </div>
                      </div>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-brand-primary/20 text-brand-primary font-mono">
                        {instInfo.number}/{instInfo.total}
                      </span>
                    </div>
                  )}

                  {/* Category Picker */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
                      קטגוריה
                    </label>
                    <CategoryPicker
                      value={category}
                      onChange={setCategory}
                      placeholder="בחר קטגוריה או תת-קטגוריה..."
                    />
                  </div>

                  {/* Checkboxes: Ignore & ApplyToSimilar */}
                  <div className="space-y-2 pt-1 border-t border-dark-border/60 light:border-light-border/60">
                    <label className="flex items-center gap-2 text-xs text-dark-text-muted light:text-light-text-muted cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isIgnored}
                        onChange={(e) => setIsIgnored(e.target.checked)}
                        className="w-4 h-4 rounded border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-brand-primary focus:ring-brand-primary cursor-pointer shrink-0"
                      />
                      <span>התעלם מתנועה זו (לא תיכלל בחישובים וגרפים)</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-dark-text-muted light:text-light-text-muted cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={applyToSimilar}
                        onChange={(e) => setApplyToSimilar(e.target.checked)}
                        className="w-4 h-4 rounded border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-brand-primary focus:ring-brand-primary cursor-pointer shrink-0"
                      />
                      <span>החל סיווג זה על כל התנועות הדומות בעתיד {similarTxs.length > 0 && `(${similarTxs.length} תנועות)`}</span>
                    </label>
                  </div>

                  {/* Feedback Alerts */}
                  {saveSuccess && (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>התנועה עודכנה בהצלחה!</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleClose}
                        className="text-[11px] underline hover:text-emerald-300 font-semibold cursor-pointer"
                      >
                        סגור חלון
                      </button>
                    </div>
                  )}

                  {saveError && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{saveError}</span>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={savingTx}
                    className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white font-bold text-sm transition-all cursor-pointer shadow-lg shadow-brand-primary/20 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{savingTx ? 'שומר שינויים...' : 'שמור שינויים'}</span>
                  </button>
                </form>
              )}

              {/* 2. Receipts Tab (Upload file or digital receipt link) */}
              {activeTab === 'receipts' && (
                <div className="space-y-4">
                  {/* Mode Selector */}
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-dark-surface-elevated light:bg-light-surface-elevated border border-dark-border light:border-light-border text-xs">
                    <button
                      type="button"
                      onClick={() => setUploadMode('file')}
                      className={`py-2 px-3 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 ${
                        uploadMode === 'file'
                          ? 'bg-brand-primary text-white shadow-sm'
                          : 'text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>העלאת תמונה / קובץ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadMode('url')}
                      className={`py-2 px-3 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 ${
                        uploadMode === 'url'
                          ? 'bg-brand-primary text-white shadow-sm'
                          : 'text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
                      }`}
                    >
                      <LinkIcon className="w-3.5 h-3.5" />
                      <span>קישור דיגיטלי</span>
                    </button>
                  </div>

                  {/* Upload Action */}
                  {uploadMode === 'file' ? (
                    <div className="p-4 rounded-xl border border-dashed border-dark-border light:border-light-border bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 text-center space-y-3">
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*,.pdf"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        disabled={uploadingReceipt}
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-3 rounded-xl bg-dark-surface-elevated light:bg-light-surface-elevated hover:bg-dark-border light:hover:bg-light-border text-dark-text light:text-light-text text-xs font-semibold flex items-center justify-center gap-2 transition-colors border border-dark-border light:border-light-border cursor-pointer disabled:opacity-50"
                      >
                        {uploadingReceipt ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin text-brand-primary" />
                            <span>מעלה ומנתח באמצעות AI...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 text-brand-primary" />
                            <span>בחר תמונה / צילום קבלה (עד 15MB)</span>
                          </>
                        )}
                      </button>
                      <p className="text-[10px] text-dark-text-muted light:text-light-text-muted">תומך בתמונות (JPG, PNG) ובקובצי PDF</p>
                    </div>
                  ) : (
                    <form onSubmit={handleUrlReceipt} className="flex gap-2">
                      <input
                        type="url"
                        placeholder="הדבק קישור לחשבונית דיגיטלית (https://...)"
                        value={digitalUrl}
                        onChange={(e) => setDigitalUrl(e.target.value)}
                        className="flex-1 p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs focus:outline-none focus:border-brand-primary"
                      />
                      <button
                        type="submit"
                        disabled={uploadingReceipt || !digitalUrl.trim()}
                        className="px-4 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-semibold hover:bg-brand-primary-hover transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {uploadingReceipt ? 'טוען...' : 'הוסף'}
                      </button>
                    </form>
                  )}

                  {receiptFeedback && (
                    <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                      receiptFeedback.type === 'success'
                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                        : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                    }`}>
                      {receiptFeedback.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                      <span>{receiptFeedback.text}</span>
                    </div>
                  )}

                  {/* List of Receipts */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted px-1">
                      קבלות וחשבוניות מקושרות ({receipts.length})
                    </div>
                    {receipts.length === 0 ? (
                      <div className="p-6 rounded-xl border border-dashed border-dark-border light:border-light-border text-center text-xs text-dark-text-muted light:text-light-text-muted bg-dark-surface-elevated/20 light:bg-light-surface-elevated/20">
                        לא צורפו קבלות או חשבוניות לתנועה זו עדיין.
                      </div>
                    ) : (
                      receipts.map((r) => {
                        const extracted = r.extracted_data || {};
                        const hasItems = Array.isArray(extracted.items) && extracted.items.length > 0;
                        return (
                        <div key={r.id} className="p-3.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 space-y-3 text-xs transition-colors">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Receipt className="w-4 h-4 text-brand-primary shrink-0" />
                              <div className="min-w-0">
                                <div className="font-semibold text-dark-text light:text-light-text truncate">
                                  {extracted.vendor || r.file_name || 'קבלה / חשבונית'}
                                </div>
                                <div className="text-[11px] flex items-center gap-2 text-dark-text-muted light:text-light-text-muted">
                                  <span>{r.source_url ? 'קישור דיגיטלי' : 'קובץ'}</span>
                                  {r.ai_analyzed && <span className="text-purple-400 font-medium">✨ נותח ע״י AI</span>}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {r.source_url ? (
                                <a
                                  href={r.source_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 rounded-lg text-brand-primary hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated transition-colors"
                                  title="פתח קישור"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              ) : r.file_path ? (
                                <a
                                  href={`/api/v2/transactions/tma/receipts/file/${r.file_path}?token=${encodeURIComponent(token)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 rounded-lg text-brand-primary hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated transition-colors"
                                  title="הצג קובץ"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => handleDeleteReceipt(r.id)}
                                className="p-1.5 text-brand-expense hover:bg-brand-expense/10 rounded-lg transition-colors cursor-pointer"
                                title="מחק קבלה"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Extracted Receipt Metadata: Date, Invoice Number, Total */}
                          {(extracted.date || extracted.total || extracted.invoice_number) && (
                            <div className="p-2 rounded-lg border border-dark-border/80 light:border-light-border/80 bg-dark-surface-elevated light:bg-light-surface-elevated text-[11px] flex flex-wrap items-center justify-between gap-2">
                              {extracted.date && (
                                <span className="text-dark-text-muted light:text-light-text-muted">
                                  📅 {extracted.date}
                                </span>
                              )}
                              {extracted.invoice_number && (
                                <span className="text-dark-text-muted light:text-light-text-muted">
                                  מס' חשבונית: {extracted.invoice_number}
                                </span>
                              )}
                              {extracted.total && (
                                <span className="font-bold text-brand-primary">
                                  סכום חשבונית: {formatILS(extracted.total)}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Line Items List */}
                          {hasItems && (
                            <div className="space-y-1.5 pt-1">
                              <div className="text-[11px] font-bold flex items-center justify-between px-1 text-dark-text-muted light:text-light-text-muted">
                                <span>פירוט פריטים ({extracted.items.length}):</span>
                                <span className="text-brand-primary font-mono">
                                  סה"כ: {formatILS(extracted.items.reduce((sum, it) => sum + (parseFloat(it.price) || 0), 0))}
                                </span>
                              </div>
                              <div className="max-h-48 overflow-y-auto space-y-1 p-1.5 rounded-lg border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface">
                                {extracted.items.map((item, itIdx) => (
                                  <div key={itIdx} className="p-1.5 rounded-md flex items-center justify-between text-[11px] bg-dark-surface-elevated light:bg-light-surface-elevated hover:bg-dark-border light:hover:bg-light-border text-dark-text light:text-light-text">
                                    <div className="min-w-0 flex items-center gap-1.5">
                                      <span className="font-medium truncate">{item.name || 'פריט'}</span>
                                      {item.qty > 1 && (
                                        <span className="text-[10px] font-mono px-1 rounded bg-dark-border light:bg-light-border text-dark-text-muted light:text-light-text-muted">
                                          x{item.qty}
                                        </span>
                                      )}
                                      {item.category && (
                                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                                          {item.category}
                                        </span>
                                      )}
                                    </div>
                                    <span className="font-bold font-mono text-brand-income shrink-0">
                                      {formatILS(item.price)}
                                    </span>
                                  </div>
                                ))}
                              </div>

                              <button
                                type="button"
                                onClick={() => handleSplitByReceipt(r)}
                                className="w-full mt-1.5 py-1.5 px-3 rounded-lg bg-brand-primary/15 hover:bg-brand-primary/25 border border-brand-primary/30 text-brand-primary text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                              >
                                <Split className="w-3.5 h-3.5" />
                                <span>פצל תנועה זו לפי פריטי החשבונית</span>
                              </button>
                            </div>
                          )}

                          {!hasItems && r.ai_analyzed && (
                            <div className="p-2 rounded-lg text-center text-[11px] text-dark-text-muted light:text-light-text-muted bg-dark-surface light:bg-light-surface border border-dark-border/40 light:border-light-border/40">
                              לא חולצו פריטים בודדים מחשבונית זו
                            </div>
                          )}
                        </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* 3. Notes Tab */}
              {activeTab === 'notes' && (
                <div className="space-y-4">
                  <form onSubmit={handleAddNote} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="הוסף הערה..."
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      className="flex-1 p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs focus:outline-none focus:border-brand-primary"
                    />
                    <button
                      type="submit"
                      disabled={addingNote || !newNote.trim()}
                      className="px-4 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-semibold hover:bg-brand-primary-hover transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {addingNote ? 'מוסיף...' : 'הוסף'}
                    </button>
                  </form>

                  <div className="space-y-2">
                    {notes.length === 0 ? (
                      <div className="text-center py-8 text-xs text-dark-text-muted light:text-light-text-muted">
                        אין הערות עדיין
                      </div>
                    ) : (
                      notes.map((n) => (
                        <div key={n.id} className="p-3 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text flex items-center justify-between text-xs">
                          <span>{n.note}</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteNote(n.id)}
                            className="text-brand-expense hover:bg-brand-expense/10 p-1 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* 4. Links Tab (With integrated candidates, fee classification & search picker) */}
              {activeTab === 'links' && (
                <div className="space-y-4">
                  {/* Currently Linked Transactions */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted px-1">
                      תנועות מקושרות ({links.length})
                    </div>
                    {links.length === 0 ? (
                      <div className="p-4 rounded-xl border border-dashed border-dark-border light:border-light-border text-center text-xs text-dark-text-muted light:text-light-text-muted bg-dark-surface-elevated/20 light:bg-light-surface-elevated/20">
                        אין תנועות מקושרות כרגע לתנועה זו.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {links.map((lnk) => (
                          <div key={lnk.linkId} className="p-3 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 space-y-2 text-xs">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Link2 className="w-4 h-4 text-brand-primary shrink-0" />
                                <div className="min-w-0">
                                  <div className="font-semibold text-dark-text light:text-light-text truncate">
                                    {cleanSpacedHebrew(lnk.userDescription || lnk.merchantName || lnk.description || 'ללא תיאור')}
                                  </div>
                                  <div className="text-[11px] text-dark-text-muted light:text-light-text-muted flex items-center gap-2">
                                    <span>{formatDate(lnk.date, 'he')}</span>
                                    <span>•</span>
                                    <span className={Number(lnk.amount) < 0 ? 'text-brand-expense' : 'text-brand-income font-medium'}>
                                      {formatILS(lnk.amount)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`px-2 py-0.5 rounded-full font-medium text-[10px] ${
                                  lnk.linkType === 'installment'
                                    ? 'bg-brand-primary/20 text-brand-primary font-bold'
                                    : lnk.linkType === 'cc_billing_match'
                                    ? 'bg-emerald-500/20 text-emerald-400 font-bold'
                                    : 'bg-brand-primary/15 text-brand-primary'
                                }`}>
                                  {lnk.linkType === 'refund'
                                    ? 'זיכוי'
                                    : lnk.linkType === 'correction'
                                    ? 'תיקון'
                                    : lnk.linkType === 'installment'
                                    ? 'תשלומים 💳'
                                    : lnk.linkType === 'cc_billing_match'
                                    ? 'חיוב אשראי 💳'
                                    : 'קשורה'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUnlink(lnk.linkId)}
                                  className="p-1.5 text-brand-expense hover:bg-brand-expense/10 rounded-lg transition-colors cursor-pointer"
                                  title="בטל קישור"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Fee Classification Toggle */}
                            {lnk.feeAmount > 0 && (
                              <div className="flex items-center justify-between pt-1.5 border-t border-dark-border/40 light:border-light-border/40 text-[11px]">
                                <span className="text-amber-500 font-mono">
                                  הפרש עמלה: {formatILS(lnk.feeAmount)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleToggleFeeClassification(lnk.linkId, lnk.isFeeClassified)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                                    lnk.isFeeClassified
                                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                      : 'bg-dark-surface light:bg-light-surface text-dark-text-muted light:text-light-text-muted border border-dark-border light:border-light-border'
                                  }`}
                                >
                                  {lnk.isFeeClassified ? '✓ סווג כעמלה' : '+ סווג כעמלה'}
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Reconciliation Candidates Section */}
                  {candidates.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-dark-border/60 light:border-light-border/60">
                      <div className="text-xs font-semibold text-brand-primary flex items-center gap-1.5 px-1">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>מועמדים להתאמה אוטומטית ({candidates.length})</span>
                      </div>
                      <div className="space-y-2">
                        {candidates.map((cand) => (
                          <div
                            key={cand.candidateTxId || cand.id}
                            className="p-3 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated/60 light:bg-light-surface-elevated/60 space-y-2 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-dark-text light:text-light-text truncate">
                                {cleanSpacedHebrew(cand.userDescription || cand.merchantName || cand.description || 'ללא תיאור')}
                              </span>
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-brand-primary/15 text-brand-primary">
                                {Math.round(cand.matchScore || cand.score || 0)}% התאמה
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-dark-text-muted light:text-light-text-muted text-[11px]">
                              <span>{formatDate(cand.date, 'he')} • {cand.accountDisplayName || cand.bankCompany}</span>
                              <span className="font-mono font-bold text-dark-text light:text-light-text">
                                {formatILS(cand.amount)}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleExecuteCandidateLink(cand)}
                              className="w-full mt-1 py-1.5 rounded-lg bg-brand-primary hover:bg-brand-primary-hover text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Link2 className="w-3.5 h-3.5" />
                              <span>קשר תנועה זו עכשיו</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Linking Action Section with Picker */}
                  <div className="pt-3 space-y-3 border-t border-dark-border/60 light:border-light-border/60">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
                        סוג הקשר לחיבור
                      </label>
                      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-dark-surface-elevated light:bg-light-surface-elevated border border-dark-border light:border-light-border text-xs">
                        <button
                          type="button"
                          onClick={() => setLinkType('refund')}
                          className={`py-1.5 px-2 rounded-lg font-medium transition-all ${
                            linkType === 'refund'
                              ? 'bg-brand-primary text-white shadow-sm'
                              : 'text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
                          }`}
                        >
                          זיכוי / ביטול
                        </button>
                        <button
                          type="button"
                          onClick={() => setLinkType('related')}
                          className={`py-1.5 px-2 rounded-lg font-medium transition-all ${
                            linkType === 'related'
                              ? 'bg-brand-primary text-white shadow-sm'
                              : 'text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
                          }`}
                        >
                          תנועה קשורה
                        </button>
                        <button
                          type="button"
                          onClick={() => setLinkType('correction')}
                          className={`py-1.5 px-2 rounded-lg font-medium transition-all ${
                            linkType === 'correction'
                              ? 'bg-brand-primary text-white shadow-sm'
                              : 'text-dark-text-muted light:text-light-text-muted hover:text-dark-text light:hover:text-light-text'
                          }`}
                        >
                          תיקון / התאמה
                        </button>
                      </div>
                    </div>

                    {/* Transaction Search & Picker */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
                        בחר תנועה לקישור (חיפוש וסינון מהיר)
                      </label>
                      <div className="relative">
                        <Search className="w-4 h-4 text-dark-text-muted light:text-light-text-muted absolute right-3 top-3 pointer-events-none" />
                        <input
                          type="text"
                          value={linkSearch}
                          onChange={(e) => setLinkSearch(e.target.value)}
                          placeholder="חפש לפי שם בית עסק, תיאור, סכום..."
                          className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text light:text-light-text text-xs focus:outline-none focus:border-brand-primary"
                        />
                      </div>

                      {linkingSuccess && (
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                          <Check className="w-4 h-4 shrink-0" />
                          <span>{linkingSuccess}</span>
                        </div>
                      )}

                      {/* List of Linkable Transactions */}
                      <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                        {loadingLinkable ? (
                          <div className="py-6 text-center text-xs text-dark-text-muted light:text-light-text-muted flex items-center justify-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin text-brand-primary" />
                            <span>מחפש תנועות...</span>
                          </div>
                        ) : linkableTxs.length === 0 ? (
                          <div className="py-6 text-center text-xs text-dark-text-muted light:text-light-text-muted">
                            לא נמצאו תנועות תואמות
                          </div>
                        ) : (
                          linkableTxs.map((ltx) => (
                            <button
                              key={ltx.id}
                              type="button"
                              onClick={() => handleLinkDirect(ltx.id)}
                              className="w-full text-right p-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated/50 light:bg-light-surface-elevated/50 hover:bg-dark-surface-elevated light:hover:bg-light-surface-elevated hover:border-brand-primary/50 transition-all flex items-center justify-between gap-2.5 group cursor-pointer"
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <CategoryBadge category={ltx.category} size={18} />
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold text-xs text-dark-text light:text-light-text truncate group-hover:text-brand-primary transition-colors">
                                    {cleanSpacedHebrew(ltx.userDescription || getTransactionTitle(ltx))}
                                  </div>
                                  <div className="text-[10px] text-dark-text-muted light:text-light-text-muted flex items-center gap-1.5 mt-0.5">
                                    <span>{formatDate(ltx.date, 'he')}</span>
                                    <span>•</span>
                                    <span className="truncate">{ltx.accountDisplayName || ltx.bankCompany}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="text-left shrink-0">
                                <div className={`text-xs font-bold font-mono ${ltx.amount > 0 ? 'text-brand-income' : 'text-dark-text light:text-light-text'}`}>
                                  {formatILS(ltx.amount, { showSign: true })}
                                </div>
                                <span className="text-[10px] text-brand-primary font-semibold group-hover:underline">
                                  קשר +
                                </span>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 5. Splits Tab */}
              {activeTab === 'splits' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-xs space-y-2">
                    <div className="flex justify-between font-semibold">
                      <span className="text-dark-text-muted light:text-light-text-muted">סכום מקורי:</span>
                      <span className="font-bold text-sm font-mono text-dark-text light:text-light-text">{formatILS(parentAmount)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-dark-text-muted light:text-light-text-muted">סכום פיצולים נוכחי:</span>
                      <span className={splitsTotal <= parentAmount + 0.01 && splitsTotal > 0 ? 'text-brand-income font-bold text-sm font-mono' : 'text-brand-expense font-bold text-sm font-mono'}>
                        {formatILS(splitsTotal)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-dark-border/60 light:border-light-border/60">
                      <span className="font-semibold text-dark-text light:text-light-text">
                        {remainingAmount > 0.01 ? 'יתרה שתוקצה לקטגוריה הראשית:' : 'יתרה לחלוקה:'}
                      </span>
                      <span className={`font-bold text-sm font-mono ${Math.abs(remainingAmount) < 0.01 ? 'text-brand-income' : 'text-brand-primary'}`}>
                        {formatILS(remainingAmount)}
                      </span>
                    </div>
                  </div>

                  {splitError && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{splitError}</span>
                    </div>
                  )}

                  <div className="space-y-2.5">
                    {splits.map((s, idx) => (
                      <div key={idx} className="p-3 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.01"
                            value={s.amount || ''}
                            onChange={(e) => handleSplitChange(idx, 'amount', e.target.value)}
                            placeholder="0.00"
                            className="w-28 p-2 rounded-lg border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text text-xs font-mono"
                          />
                          <div className="flex-1 min-w-[130px]">
                            <CategoryPicker
                              value={s.category}
                              onChange={(val) => handleSplitChange(idx, 'category', val)}
                              placeholder="בחר קטגוריה..."
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveSplitRow(idx)}
                            className="p-2 text-brand-expense hover:bg-brand-expense/10 rounded-lg shrink-0 transition-colors cursor-pointer"
                            title="הסר שורה"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={s.description || ''}
                          onChange={(e) => handleSplitChange(idx, 'description', e.target.value)}
                          placeholder="תיאור לפיצול (אופציונלי)..."
                          className="w-full p-2 rounded-lg border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface text-dark-text light:text-light-text text-xs"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleAddSplitRow}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface hover:border-brand-primary text-xs font-semibold text-dark-text light:text-light-text transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>הוסף שורת פיצול</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveSplits}
                      disabled={savingSplits || splits.length === 0 || splitsTotal > parentAmount + 0.01 || splitsTotal <= 0}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-xs font-semibold transition-all ${
                        splitsTotal > 0 && splitsTotal <= parentAmount + 0.01
                          ? 'bg-brand-primary hover:bg-brand-primary-hover shadow-md shadow-brand-primary/20 cursor-pointer'
                          : 'bg-dark-border light:bg-light-border text-dark-text-muted light:text-light-text-muted cursor-not-allowed'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                      <span>{savingSplits ? 'שומר...' : 'שמור פיצולים'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* 6. Similar Transactions Tab */}
              {activeTab === 'similar' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl border border-dark-border/80 light:border-light-border/80 bg-dark-surface-elevated light:bg-light-surface-elevated text-xs space-y-1">
                    <div className="font-semibold text-dark-text light:text-light-text flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-brand-primary" />
                      <span>תנועות נוספות עבור אותו בית עסק</span>
                    </div>
                    <div className="text-dark-text-muted light:text-light-text-muted">
                      בית עסק:{' '}
                      <span className="font-bold text-dark-text light:text-light-text">
                        {cleanSpacedHebrew(merchantName || tx.merchantName)}
                      </span>{' '}
                      ({similarTxs.length} תנועות נוספות במערכת)
                    </div>
                  </div>

                  {similarTxs.length === 0 ? (
                    <div className="py-10 text-center text-xs text-dark-text-muted light:text-light-text-muted border border-dashed border-dark-border light:border-light-border rounded-xl p-6 bg-dark-surface-elevated/20 light:bg-light-surface-elevated/20">
                      <Layers className="w-8 h-8 mx-auto text-dark-text-muted light:text-light-text-muted mb-2 opacity-50" />
                      <div className="font-semibold">לא נמצאו תנועות נוספות עבור בית עסק זה</div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {similarTxs.map((stx) => (
                        <div
                          key={stx.id}
                          className="p-3 rounded-xl border border-dark-border/70 light:border-light-border/70 bg-dark-surface-elevated/50 light:bg-light-surface-elevated/50 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <CategoryBadge category={stx.category} size={18} />
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-dark-text light:text-light-text truncate">
                                {cleanSpacedHebrew(stx.userDescription || getTransactionTitle(stx))}
                              </div>
                              <div className="text-[11px] text-dark-text-muted light:text-light-text-muted flex items-center gap-2 mt-0.5">
                                <span className="font-mono">{formatDate(stx.date, 'he')}</span>
                                <span>•</span>
                                <span className={parseFloat(stx.amount) < 0 ? 'text-dark-text light:text-light-text font-bold' : 'text-brand-income font-bold'}>
                                  {formatILS(stx.amount, { showSign: true })}
                                </span>
                              </div>
                            </div>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-dark-surface light:bg-light-surface border border-dark-border/40 text-dark-text-muted light:text-light-text-muted shrink-0">
                            {stx.category || 'ללא סיווג'}
                          </span>
                        </div>
                      ))}

                      {/* Total of all similar transactions */}
                      <div className="mt-3 p-3.5 rounded-xl border border-dark-border/80 light:border-light-border/80 bg-dark-surface-elevated light:bg-light-surface-elevated flex items-center justify-between text-xs font-semibold">
                        <span className="text-dark-text-muted light:text-light-text-muted">
                          סך הכל ({similarTxs.length + 1} תנועות):
                        </span>
                        <span className="text-sm font-bold font-mono text-dark-text light:text-light-text" dir="ltr">
                          {formatILS(
                            (parseFloat(tx.amount) || 0) + similarTxs.reduce((acc, stx) => acc + (parseFloat(stx.amount) || 0), 0),
                            { showSign: true }
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 7. Scraper Raw Data Tab */}
              {activeTab === 'scraper' && (() => {
                let parsedRaw = tx.rawData;
                if (typeof parsedRaw === 'string') {
                  try { parsedRaw = JSON.parse(parsedRaw); } catch (e) { parsedRaw = null; }
                }
                const rawObj = parsedRaw || {};
                const rawJsonString = JSON.stringify(tx.rawData ? (typeof tx.rawData === 'string' ? JSON.parse(tx.rawData) : tx.rawData) : {
                  id: tx.id,
                  identifier: tx.identifier,
                  date: tx.date,
                  processedDate: tx.processedDate,
                  originalAmount: tx.originalAmount,
                  originalCurrency: tx.originalCurrency,
                  chargedAmount: tx.chargedAmount,
                  description: tx.description,
                  memo: tx.memo,
                  category: tx.category,
                  status: tx.status,
                  type: tx.type,
                  installments: tx.installments
                }, null, 2);

                const handleCopyJson = () => {
                  navigator.clipboard.writeText(rawJsonString);
                  setCopiedRaw(true);
                  setTimeout(() => setCopiedRaw(false), 2000);
                };

                const scraperFields = [
                  { label: 'מזהה תנועה (Identifier)', value: tx.identifier || rawObj.identifier || tx.id, icon: <Hash className="w-3.5 h-3.5 text-brand-primary" /> },
                  { label: 'סטטוס תנועה (Status)', value: tx.status || rawObj.status || 'completed', badge: tx.status === 'pending' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400' },
                  { label: 'סוג תנועה (Type)', value: tx.type || rawObj.type || (parseFloat(tx.amount) < 0 ? 'expense' : 'income') },
                  { label: 'סכום מקורי (Original Amount)', value: rawObj.originalAmount != null ? `${rawObj.originalAmount} ${rawObj.originalCurrency || tx.originalCurrency || 'ILS'}` : (tx.originalAmount ? `${tx.originalAmount} ${tx.originalCurrency || 'ILS'}` : 'לא צוין') },
                  { label: 'סכום חיוב (Charged Amount)', value: rawObj.chargedAmount != null ? `${rawObj.chargedAmount} ILS` : (tx.chargedAmount ? `${tx.chargedAmount} ILS` : formatILS(tx.amount)) },
                  { label: 'תאריך עסקה (Tx Date)', value: formatDate(tx.date, 'he') },
                  { label: 'תאריך עיבוד/חיוב (Processed Date)', value: tx.processedDate || rawObj.processedDate ? formatDate(tx.processedDate || rawObj.processedDate, 'he') : 'לא זמין' },
                  { label: 'סיווג ראשוני מהסקריפר', value: rawObj.category || 'לא סווג ע״י המקור' },
                  { 
                    label: 'תשלומי קרדיט/תשלומים', 
                    value: instInfo.isInstallment 
                      ? `${instInfo.text}${instInfo.totalAmount > 0 ? ` (סך כולל: ${formatILS(instInfo.totalAmount)})` : ''}` 
                      : 'תשלום רגיל (תשלום יחיד)',
                    badge: instInfo.isInstallment ? 'bg-brand-primary/20 text-brand-primary' : null
                  },
                  { label: 'חשבון / כרטיס מקור', value: `${tx.accountDisplayName || tx.bankCompany || ''} (${tx.cardLast4 ? `••${tx.cardLast4}` : 'ראשי'})` }
                ];

                return (
                  <div className="space-y-4">
                    {/* Prominent Original Description & Memo Card */}
                    <div className="p-3.5 rounded-xl border border-brand-primary/30 bg-brand-primary/5 space-y-2">
                      <div className="text-[11px] font-bold text-brand-primary">
                        פירוט מקורי מהבנק / כרטיס אשראי (Original Description):
                      </div>
                      <div className="text-sm font-semibold text-dark-text light:text-light-text select-all">
                        {cleanSpacedHebrew(tx.description) || 'ללא תיאור נוסף'}
                      </div>
                      {tx.memo && (
                        <div className="text-xs text-dark-text-muted light:text-light-text-muted pt-1.5 border-t border-brand-primary/20">
                          <span className="font-semibold">הערות ספק (Memo):</span> {cleanSpacedHebrew(tx.memo)}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted flex items-center gap-1.5">
                        <Database className="w-4 h-4 text-brand-primary" />
                        <span>כל המידע הגולמי שנשלף מסקריפר הבנק/האשראי</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyJson}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-xs font-medium hover:border-brand-primary transition-colors text-dark-text light:text-light-text cursor-pointer"
                      >
                        {copiedRaw ? <Check className="w-3.5 h-3.5 text-brand-income" /> : <Copy className="w-3.5 h-3.5 text-dark-text-muted" />}
                        <span>{copiedRaw ? 'הועתק!' : 'העתק JSON'}</span>
                      </button>
                    </div>

                    {/* Structured Fields Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {scraperFields.map((field, idx) => (
                        <div key={idx} className="p-3 rounded-xl border border-dark-border/70 light:border-light-border/70 bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 space-y-1">
                          <div className="text-[11px] font-medium text-dark-text-muted light:text-light-text-muted flex items-center gap-1">
                            {field.icon}
                            <span>{field.label}</span>
                          </div>
                          <div className="text-xs font-semibold break-all text-dark-text light:text-light-text">
                            {field.badge ? (
                              <span className={`px-2 py-0.5 rounded text-[11px] ${field.badge}`}>{field.value}</span>
                            ) : (
                              field.value
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Raw JSON Code Block */}
                    <div className="space-y-1.5">
                      <div className="text-xs font-semibold text-dark-text-muted light:text-light-text-muted">
                        JSON גולמי מלא (Full Raw Scraper Object):
                      </div>
                      <pre className="p-3 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated light:bg-light-surface-elevated text-[11px] font-mono text-emerald-600 dark:text-emerald-400 overflow-x-auto max-h-60 leading-relaxed text-left" dir="ltr">
                        {rawJsonString}
                      </pre>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Footer Notice */}
            <div className="p-3 text-center border-t border-dark-border light:border-light-border bg-dark-surface light:bg-light-surface">
              <p className="text-[10px] text-dark-text-muted light:text-light-text-muted flex items-center justify-center gap-1">
                <ShieldAlert className="w-3 h-3 text-dark-text-muted light:text-light-text-muted" />
                FinTrack Zero-Trust TMA • ממשק מאובטח ומבודד
              </p>
            </div>
          </div>
          );
        })()}
      </div>
    </>
  );
}

