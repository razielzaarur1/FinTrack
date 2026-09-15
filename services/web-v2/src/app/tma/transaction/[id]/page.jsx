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
  Globe
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

  // Telegram WebApp initialization & detection
  useEffect(() => {
    let checkInterval = null;
    let attempts = 0;

    const checkTg = () => {
      attempts++;
      if (typeof window !== 'undefined') {
        if (window.Telegram?.WebApp) {
          const tg = window.Telegram.WebApp;
          try {
            tg.ready();
            tg.expand();
            if (tg.setHeaderColor) tg.setHeaderColor('#0f172a');
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
        setSaveError(res.error || 'שגיאה בשמירת השינויים');
        if (typeof window !== 'undefined' && window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
        }
      } else {
        setSaveSuccess(true);
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
    if (!splitsBalanced) {
      setSplitError(`סכום הפיצולים חייב להיות שווה במדויק לסכום התנועה (נותרה יתרה: ${formatILS(remainingAmount)})`);
      return;
    }
    setSplitError('');
    setSavingSplits(true);
    try {
      const res = await api.saveTmaSplits(id, splits, token, initData);
      if (res.error) {
        setSplitError(res.error);
      } else {
        if (typeof window !== 'undefined' && window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
        setActiveTab('details');
      }
    } finally {
      setSavingSplits(false);
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

      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans rtl flex flex-col justify-between overflow-x-hidden">

        {/* Loading State */}
        {loading && isTelegramEnv !== false && (
          <div className="p-12 text-center space-y-3 my-auto">
            <div className="w-9 h-9 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-400">טוען את פרטי התנועה...</p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && isTelegramEnv !== false && (
          <div className="p-6 m-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs space-y-2 my-auto">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>שגיאה בגישה לתנועה</span>
            </div>
            <p className="text-slate-300 leading-relaxed">{error}</p>
            <p className="text-[11px] text-slate-400 pt-2 border-t border-rose-500/20">
              ודא שפתחת את הקישור מתוך הודעת הבוט בטלגרם ושלא חלפו יותר מ-7 ימים מעת קבלתה.
            </p>
          </div>
        )}

        {/* Main Content (Matching TransactionDrawer UI) */}
        {!loading && tx && isTelegramEnv !== false && (() => {
          const instInfo = extractInstallmentInfo(tx);
          return (
          <div className="w-full max-w-lg mx-auto min-h-screen flex flex-col justify-between bg-slate-950 border-x border-slate-800/80 shadow-2xl">
            {/* Header (Exact TransactionDrawer layout) */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60 sticky top-0 backdrop-blur-md z-20">
              <div className="flex items-center gap-3 min-w-0">
                <CategoryBadge category={category || tx.category} size={22} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-400">
                      {tx.accountDisplayName || tx.bankCompany?.toUpperCase()} {tx.cardLast4 ? `(••${tx.cardLast4})` : ''}
                    </span>
                    {tx.status === 'pending' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium">
                        ממתין
                      </span>
                    )}
                  </div>
                  <div className="text-base sm:text-lg font-bold mt-0.5 truncate text-slate-100 max-w-[220px] sm:max-w-xs">
                    {userDescription || cleanSpacedHebrew(getTransactionTitle(tx))}
                  </div>
                  <div className="text-xs text-slate-400 font-mono flex items-center gap-1.5 flex-wrap">
                    <span>{formatDate(tx.date, 'he')}</span>
                    <span>•</span>
                    <span className="font-bold text-slate-200">{formatILS(tx.amount, { showSign: true })}</span>
                    {instInfo.isInstallment && (
                      <>
                        <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-semibold">
                          💳 {instInfo.text}
                        </span>
                        {instInfo.totalAmount > Math.abs(parseFloat(tx.amount) || 0) && (
                          <span className="text-[10px] text-slate-400 font-sans">
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
                onClick={handleClose}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                title="סגור"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab Selector Bar (All 7 TransactionDrawer tabs) */}
            <div className="flex border-b border-slate-800 px-3 gap-1 text-xs font-medium bg-slate-900/40 overflow-x-auto no-scrollbar select-none sticky top-[73px] backdrop-blur-md z-10">
              <button
                type="button"
                onClick={() => setActiveTab('details')}
                className={`py-3 px-2.5 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
                  activeTab === 'details'
                    ? 'border-indigo-500 text-indigo-400 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
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
                    ? 'border-indigo-500 text-indigo-400 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
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
                    ? 'border-indigo-500 text-indigo-400 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
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
                    ? 'border-indigo-500 text-indigo-400 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
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
                    ? 'border-indigo-500 text-indigo-400 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
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
                    ? 'border-indigo-500 text-indigo-400 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
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
                    ? 'border-indigo-500 text-indigo-400 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
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
                    <label className="text-xs font-semibold text-slate-400">
                      כינוי מותאם אישית (יוצג ככותרת)
                    </label>
                    <input
                      type="text"
                      value={userDescription}
                      onChange={(e) => setUserDescription(e.target.value)}
                      placeholder={cleanSpacedHebrew(getTransactionTitle(tx))}
                      className="w-full p-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-100 text-sm font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>

                  {/* Read-Only Bank Merchant Name */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400">
                      שם בית העסק (מקור הבנק / כרטיס)
                    </label>
                    <div className="w-full p-2.5 rounded-xl border border-slate-800/80 bg-slate-900/60 text-slate-200 font-medium text-sm flex items-center justify-between">
                      <span className="truncate">{cleanSpacedHebrew(merchantName || tx.merchantName || 'לא צוין בית עסק')}</span>
                      {similarTxs.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setActiveTab('similar')}
                          className="text-[11px] text-indigo-400 hover:underline shrink-0 mr-2 font-semibold"
                        >
                          הצג דומות ({similarTxs.length})
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Read-Only Financial Metadata Chips Grid */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-xl border border-slate-800/80 bg-slate-900/50 space-y-1">
                      <div className="text-[10px] font-medium text-slate-400">סכום חיוב</div>
                      <div className={`text-xs sm:text-sm font-bold font-mono ${currentAmountNum > 0 ? 'text-emerald-400' : 'text-slate-100'}`}>
                        {formatILS(tx.amount, { showSign: true })}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl border border-slate-800/80 bg-slate-900/50 space-y-1">
                      <div className="text-[10px] font-medium text-slate-400">תאריך עסקה</div>
                      <div className="text-xs font-semibold text-slate-200 font-mono mt-0.5">
                        {formatDate(tx.date, 'he')}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl border border-slate-800/80 bg-slate-900/50 space-y-1">
                      <div className="text-[10px] font-medium text-slate-400">חשבון / כרטיס</div>
                      <div className="text-xs font-semibold text-slate-200 truncate mt-0.5" title={tx.accountDisplayName || tx.bankCompany}>
                        {tx.accountDisplayName || tx.bankCompany?.toUpperCase() || 'ראשי'}
                      </div>
                    </div>
                  </div>

                  {/* Foreign Currency & Conversion Fee Analysis Card */}
                  {tx.fxDetails && (
                    <div className="p-3.5 rounded-2xl border border-blue-500/30 bg-blue-500/10 space-y-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-bold text-slate-200">
                          <div className="p-1 rounded-md bg-blue-500/20 text-blue-400">
                            <Globe className="w-3.5 h-3.5" />
                          </div>
                          <span>עסקת מט״ח ({tx.fxDetails.foreignCurrency || tx.fxDetails.originalCurrency || 'מט״ח'}) ועלויות המרה</span>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-400 font-mono" dir="ltr">
                          {tx.fxDetails.foreignCurrency || tx.fxDetails.originalCurrency} / ILS
                        </span>
                      </div>

                      {/* 2-column: Original Foreign Amount vs Charged ILS */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 rounded-xl border border-slate-800/80 bg-slate-900/60 space-y-0.5">
                          <div className="text-[10px] text-slate-400">סכום במטבע מקורי</div>
                          <div className="text-xs sm:text-sm font-bold font-mono text-slate-100" dir="ltr">
                            {formatCurrency(tx.fxDetails.foreignAmount, tx.fxDetails.foreignCurrency || tx.fxDetails.originalCurrency)}
                          </div>
                        </div>

                        <div className="p-2 rounded-xl border border-slate-800/80 bg-slate-900/60 space-y-0.5">
                          <div className="text-[10px] text-slate-400">סכום חיוב בפועל בחשבון</div>
                          <div className="text-xs sm:text-sm font-bold font-mono text-rose-400" dir="ltr">
                            {formatILS(tx.fxDetails.ilsAmount)}
                          </div>
                        </div>
                      </div>

                      {/* Rates Breakdown */}
                      <div className="text-[11px] space-y-1 pt-1 border-t border-blue-500/20 text-slate-300">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">שער יציג לתאריך העסקה ({formatDate(tx.fxDetails.rateDate || tx.date, 'he')}):</span>
                          <span className="font-mono font-semibold" dir="ltr">
                            1 {tx.fxDetails.foreignCurrency || tx.fxDetails.originalCurrency} = ₪{Number(tx.fxDetails.representativeRate).toFixed(4)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">עלות לפי שער יציג (ללא עמלות):</span>
                          <span className="font-mono font-semibold" dir="ltr">
                            {formatILS(tx.fxDetails.costAtRepresentativeRate)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">שער חיוב אפקטיבי של הכרטיס:</span>
                          <span className="font-mono font-semibold text-amber-400" dir="ltr">
                            1 {tx.fxDetails.foreignCurrency || tx.fxDetails.originalCurrency} = ₪{Number(tx.fxDetails.effectiveRate).toFixed(4)}
                          </span>
                        </div>
                      </div>

                      {/* Conversion Fee Banner */}
                      {tx.fxDetails.isPositiveFee ? (
                        <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/25 space-y-1">
                          <div className="flex items-center justify-between font-bold text-amber-400">
                            <span>עמלת המרה ששולמה:</span>
                            <span className="font-mono" dir="ltr">
                              +{formatILS(tx.fxDetails.conversionFeeILS)}
                              {tx.fxDetails.feePercent > 0 && ` (+${tx.fxDetails.feePercent}%)`}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center justify-between">
                            <span>עלות עמלה ליחידת מטבע:</span>
                            <span className="font-semibold text-slate-200 font-mono" dir="rtl">
                              {Math.abs(tx.fxDetails.feePerUnitAgorot)} אגורות לכל {tx.fxDetails.foreignCurrency || tx.fxDetails.originalCurrency} (+{formatILS(Math.abs(tx.fxDetails.feePerUnit))})
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/25 space-y-1">
                          <div className="flex items-center justify-between font-bold text-emerald-400">
                            <span>הפרש לטובתך (חיוב נמוך מהשער היציג):</span>
                            <span className="font-mono" dir="ltr">
                              {formatILS(Math.abs(tx.fxDetails.conversionFeeILS))}
                              {tx.fxDetails.feePercent !== 0 && ` (${tx.fxDetails.feePercent}%)`}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center justify-between">
                            <span>הפרש ליחידת מטבע:</span>
                            <span className="font-semibold text-emerald-400 font-mono" dir="rtl">
                              {Math.abs(tx.fxDetails.feePerUnitAgorot)} אגורות לכל {tx.fxDetails.foreignCurrency || tx.fxDetails.originalCurrency} ({formatILS(Math.abs(tx.fxDetails.feePerUnit))})
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Installment Banner */}
                  {instInfo.isInstallment && (
                    <div className="p-3.5 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <CreditCard className="w-4 h-4 text-indigo-400 shrink-0" />
                        <div>
                          <div className="font-bold text-slate-200">עסקת תשלומים: {instInfo.text}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            סכום חיוב חודשי: {formatILS(tx.amount)}
                            {instInfo.totalAmount > 0 && ` • סך כולל של העסקה: ${formatILS(instInfo.totalAmount)}`}
                          </div>
                        </div>
                      </div>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                        {instInfo.number}/{instInfo.total}
                      </span>
                    </div>
                  )}

                  {/* Category Picker */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400">
                      קטגוריה
                    </label>
                    <CategoryPicker
                      value={category}
                      onChange={setCategory}
                      placeholder="בחר קטגוריה או תת-קטגוריה..."
                    />
                  </div>

                  {/* Checkboxes: Ignore & ApplyToSimilar */}
                  <div className="space-y-2 pt-1 border-t border-slate-800/60">
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isIgnored}
                        onChange={(e) => setIsIgnored(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                      />
                      <span>התעלם מתנועה זו (לא תיכלל בחישובים וגרפים)</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={applyToSimilar}
                        onChange={(e) => setApplyToSimilar(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
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
                        className="text-[11px] underline hover:text-emerald-300 font-semibold"
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
                    className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all cursor-pointer shadow-lg shadow-indigo-600/20 disabled:opacity-50"
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
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                    <button
                      type="button"
                      onClick={() => setUploadMode('file')}
                      className={`py-2 px-3 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 ${
                        uploadMode === 'file'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
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
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <LinkIcon className="w-3.5 h-3.5" />
                      <span>קישור דיגיטלי</span>
                    </button>
                  </div>

                  {/* Upload Action */}
                  {uploadMode === 'file' ? (
                    <div className="p-4 rounded-xl border border-dashed border-slate-800 bg-slate-900/50 text-center space-y-3">
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
                        className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                      >
                        {uploadingReceipt ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                            <span>מעלה ומנתח באמצעות AI...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 text-indigo-400" />
                            <span>בחר תמונה / צילום קבלה (עד 15MB)</span>
                          </>
                        )}
                      </button>
                      <p className="text-[10px] text-slate-500">תומך בתמונות (JPG, PNG) ובקובצי PDF</p>
                    </div>
                  ) : (
                    <form onSubmit={handleUrlReceipt} className="flex gap-2">
                      <input
                        type="url"
                        placeholder="הדבק קישור לחשבונית דיגיטלית (https://...)"
                        value={digitalUrl}
                        onChange={(e) => setDigitalUrl(e.target.value)}
                        className="flex-1 p-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        type="submit"
                        disabled={uploadingReceipt || !digitalUrl.trim()}
                        className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-colors disabled:opacity-50"
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
                    <div className="text-xs font-semibold text-slate-400 px-1">
                      קבלות וחשבוניות מקושרות ({receipts.length})
                    </div>
                    {receipts.length === 0 ? (
                      <div className="p-6 rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-500 bg-slate-900/30">
                        לא צורפו קבלות או חשבוניות לתנועה זו עדיין.
                      </div>
                    ) : (
                      receipts.map((r) => (
                        <div key={r.id} className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Receipt className="w-4 h-4 text-indigo-400 shrink-0" />
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-200 truncate">
                                {r.file_name || 'קבלה'}
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-2">
                                <span>{r.source_url ? 'קישור דיגיטלי' : 'קובץ'}</span>
                                {r.ai_analyzed && <span className="text-indigo-400">✨ נותח ע״י AI</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {r.source_url ? (
                              <a
                                href={r.source_url}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 text-indigo-400 hover:text-indigo-300 rounded-lg"
                                title="פתח קישור"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            ) : r.file_path ? (
                              <a
                                href={`/api/v2/transactions/tma/receipts/file/${r.file_path}?token=${encodeURIComponent(token)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 text-indigo-400 hover:text-indigo-300 rounded-lg"
                                title="הצג קובץ"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => handleDeleteReceipt(r.id)}
                              className="p-1.5 text-rose-400 hover:text-rose-300 rounded-lg"
                              title="מחק קבלה"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
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
                      className="flex-1 p-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="submit"
                      disabled={addingNote || !newNote.trim()}
                      className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-colors disabled:opacity-50"
                    >
                      {addingNote ? 'מוסיף...' : 'הוסף'}
                    </button>
                  </form>

                  <div className="space-y-2">
                    {notes.length === 0 ? (
                      <div className="text-center py-8 text-xs text-slate-500">
                        אין הערות עדיין
                      </div>
                    ) : (
                      notes.map((n) => (
                        <div key={n.id} className="p-3 rounded-xl border border-slate-800 bg-slate-900 text-slate-200 flex items-center justify-between text-xs">
                          <span>{n.note}</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteNote(n.id)}
                            className="text-rose-400 hover:text-rose-300 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* 4. Links Tab (With integrated transaction search & link picker!) */}
              {activeTab === 'links' && (
                <div className="space-y-4">
                  {/* Currently Linked Transactions */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-400 px-1">
                      תנועות מקושרות ({links.length})
                    </div>
                    {links.length === 0 ? (
                      <div className="p-4 rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-500 bg-slate-900/30">
                        אין תנועות מקושרות כרגע לתנועה זו.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {links.map((lnk) => (
                          <div key={lnk.linkId} className="p-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 flex items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Link2 className="w-4 h-4 text-indigo-400 shrink-0" />
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-200 truncate">
                                  {cleanSpacedHebrew(lnk.userDescription || lnk.merchantName || lnk.description || 'ללא תיאור')}
                                </div>
                                <div className="text-[11px] text-slate-400 flex items-center gap-2">
                                  <span>{formatDate(lnk.date, 'he')}</span>
                                  <span>•</span>
                                  <span className={Number(lnk.amount) < 0 ? 'text-rose-400' : 'text-emerald-400 font-medium'}>
                                    {formatILS(lnk.amount)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-medium text-[10px]">
                                {lnk.linkType === 'refund' ? 'זיכוי' : lnk.linkType === 'correction' ? 'תיקון' : 'קשורה'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUnlink(lnk.linkId)}
                                className="p-1.5 text-rose-400 hover:text-rose-300 rounded-lg transition-colors"
                                title="בטל קישור"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Linking Action Section with Picker */}
                  <div className="pt-3 space-y-3 border-t border-slate-800">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400">
                        סוג הקשר לחיבור
                      </label>
                      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                        <button
                          type="button"
                          onClick={() => setLinkType('refund')}
                          className={`py-1.5 px-2 rounded-lg font-medium transition-all ${
                            linkType === 'refund'
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          זיכוי / ביטול
                        </button>
                        <button
                          type="button"
                          onClick={() => setLinkType('related')}
                          className={`py-1.5 px-2 rounded-lg font-medium transition-all ${
                            linkType === 'related'
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          תנועה קשורה
                        </button>
                        <button
                          type="button"
                          onClick={() => setLinkType('correction')}
                          className={`py-1.5 px-2 rounded-lg font-medium transition-all ${
                            linkType === 'correction'
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          תיקון / התאמה
                        </button>
                      </div>
                    </div>

                    {/* Transaction Search & Picker */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-400">
                        בחר תנועה לקישור (חיפוש וסינון מהיר)
                      </label>
                      <div className="relative">
                        <Search className="w-4 h-4 text-slate-500 absolute right-3 top-3" />
                        <input
                          type="text"
                          value={linkSearch}
                          onChange={(e) => setLinkSearch(e.target.value)}
                          placeholder="חפש לפי שם בית עסק, תיאור, סכום..."
                          className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
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
                          <div className="py-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                            <span>מחפש תנועות...</span>
                          </div>
                        ) : linkableTxs.length === 0 ? (
                          <div className="py-6 text-center text-xs text-slate-500">
                            לא נמצאו תנועות תואמות
                          </div>
                        ) : (
                          linkableTxs.map((ltx) => (
                            <button
                              key={ltx.id}
                              type="button"
                              onClick={() => handleLinkDirect(ltx.id)}
                              className="w-full text-right p-2.5 rounded-xl border border-slate-800/80 bg-slate-900/60 hover:bg-slate-800 hover:border-indigo-500/50 transition-all flex items-center justify-between gap-2.5 group"
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <CategoryBadge category={ltx.category} size={18} />
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold text-xs text-slate-200 truncate group-hover:text-indigo-400 transition-colors">
                                    {cleanSpacedHebrew(ltx.userDescription || getTransactionTitle(ltx))}
                                  </div>
                                  <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                                    <span>{formatDate(ltx.date, 'he')}</span>
                                    <span>•</span>
                                    <span className="truncate">{ltx.accountDisplayName || ltx.bankCompany}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="text-left shrink-0">
                                <div className={`text-xs font-bold font-mono ${ltx.amount > 0 ? 'text-emerald-400' : 'text-slate-200'}`}>
                                  {formatILS(ltx.amount, { showSign: true })}
                                </div>
                                <span className="text-[10px] text-indigo-400 font-semibold group-hover:underline">
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
                  <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900 text-xs space-y-2">
                    <div className="flex justify-between font-semibold">
                      <span className="text-slate-400">סכום מקורי:</span>
                      <span className="font-bold text-sm">{formatILS(parentAmount)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">סכום פיצולים נוכחי:</span>
                      <span className={splitsBalanced ? 'text-emerald-400 font-bold text-sm' : 'text-rose-400 font-bold text-sm'}>
                        {formatILS(splitsTotal)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-slate-800">
                      <span className="font-semibold text-slate-200">יתרה לחלוקה:</span>
                      <span className={`font-bold text-sm ${Math.abs(remainingAmount) < 0.01 ? 'text-emerald-400' : 'text-amber-400'}`}>
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
                      <div key={idx} className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.01"
                            value={s.amount || ''}
                            onChange={(e) => handleSplitChange(idx, 'amount', e.target.value)}
                            placeholder="0.00"
                            className="w-28 p-2 rounded-lg border border-slate-800 bg-slate-950 text-xs font-mono text-slate-100"
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
                            className="p-2 text-rose-400 hover:bg-slate-800 rounded-lg shrink-0"
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
                          className="w-full p-2 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 text-xs"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleAddSplitRow}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-800 bg-slate-900 hover:border-indigo-500 text-xs font-semibold text-slate-200 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      <span>הוסף שורת פיצול</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveSplits}
                      disabled={savingSplits || splits.length === 0 || !splitsBalanced}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-xs font-semibold transition-all ${
                        splitsBalanced
                          ? 'bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/20'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
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
                  <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900 text-xs space-y-1">
                    <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-indigo-400" />
                      <span>תנועות נוספות עבור אותו בית עסק</span>
                    </div>
                    <div className="text-slate-400">
                      בית עסק:{' '}
                      <span className="font-bold text-slate-200">
                        {cleanSpacedHebrew(merchantName || tx.merchantName)}
                      </span>{' '}
                      ({similarTxs.length} תנועות נוספות במערכת)
                    </div>
                  </div>

                  {similarTxs.length === 0 ? (
                    <div className="py-10 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl p-6 bg-slate-900/30">
                      <Layers className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                      <div className="font-semibold">לא נמצאו תנועות נוספות עבור בית עסק זה</div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {similarTxs.map((stx) => (
                        <div
                          key={stx.id}
                          className="p-3 rounded-xl border border-slate-800/80 bg-slate-900/60 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <CategoryBadge category={stx.category} size={18} />
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-slate-200 truncate">
                                {cleanSpacedHebrew(stx.userDescription || getTransactionTitle(stx))}
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                                <span className="font-mono">{formatDate(stx.date, 'he')}</span>
                                <span>•</span>
                                <span className={parseFloat(stx.amount) < 0 ? 'text-slate-200 font-bold' : 'text-emerald-400 font-bold'}>
                                  {formatILS(stx.amount, { showSign: true })}
                                </span>
                              </div>
                            </div>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 shrink-0">
                            {stx.category || 'ללא סיווג'}
                          </span>
                        </div>
                      ))}

                      {/* Total of all similar transactions */}
                      <div className="mt-3 p-3.5 rounded-xl border border-slate-800 bg-slate-900 flex items-center justify-between text-xs font-semibold">
                        <span className="text-slate-400">
                          סך הכל ({similarTxs.length + 1} תנועות):
                        </span>
                        <span className="text-sm font-bold font-mono text-slate-100" dir="ltr">
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
                  { label: 'מזהה תנועה (Identifier)', value: tx.identifier || rawObj.identifier || tx.id, icon: <Hash className="w-3.5 h-3.5 text-indigo-400" /> },
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
                    badge: instInfo.isInstallment ? 'bg-indigo-500/20 text-indigo-300' : null
                  },
                  { label: 'חשבון / כרטיס מקור', value: `${tx.accountDisplayName || tx.bankCompany || ''} (${tx.cardLast4 ? `••${tx.cardLast4}` : 'ראשי'})` }
                ];

                return (
                  <div className="space-y-4">
                    {/* Prominent Original Description & Memo Card */}
                    <div className="p-3.5 rounded-xl border border-indigo-500/30 bg-indigo-500/5 space-y-2">
                      <div className="text-[11px] font-bold text-indigo-400">
                        פירוט מקורי מהבנק / כרטיס אשראי (Original Description):
                      </div>
                      <div className="text-sm font-semibold text-slate-100 select-all">
                        {cleanSpacedHebrew(tx.description) || 'ללא תיאור נוסף'}
                      </div>
                      {tx.memo && (
                        <div className="text-xs text-slate-400 pt-1.5 border-t border-indigo-500/20">
                          <span className="font-semibold">הערות ספק (Memo):</span> {cleanSpacedHebrew(tx.memo)}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                        <Database className="w-4 h-4 text-indigo-400" />
                        <span>כל המידע הגולמי שנשלף מסקריפר הבנק/האשראי</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyJson}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 text-xs font-medium hover:border-indigo-500 transition-colors text-slate-300"
                      >
                        {copiedRaw ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                        <span>{copiedRaw ? 'הועתק!' : 'העתק JSON'}</span>
                      </button>
                    </div>

                    {/* Structured Fields Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {scraperFields.map((field, idx) => (
                        <div key={idx} className="p-3 rounded-xl border border-slate-800/80 bg-slate-900/50 space-y-1">
                          <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                            {field.icon}
                            <span>{field.label}</span>
                          </div>
                          <div className="text-xs font-semibold break-all text-slate-200">
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
                      <div className="text-xs font-semibold text-slate-400">
                        JSON גולמי מלא (Full Raw Scraper Object):
                      </div>
                      <pre className="p-3 rounded-xl border border-slate-800 bg-slate-900 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-60 leading-relaxed text-left" dir="ltr">
                        {rawJsonString}
                      </pre>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Footer Notice */}
            <div className="p-3 text-center border-t border-slate-900 bg-slate-950">
              <p className="text-[10px] text-slate-600 flex items-center justify-center gap-1">
                <ShieldAlert className="w-3 h-3 text-slate-600" />
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

