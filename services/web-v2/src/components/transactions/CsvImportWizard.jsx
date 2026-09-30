'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Upload,
  FileSpreadsheet,
  Check,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  X,
  Plus,
  RefreshCw,
  Calendar,
  Building2,
  CreditCard,
  Layers,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatILS } from '@/lib/formatters';

// Heuristic keyword matchers for Israeli banks / cards
const KEYWORDS = {
  date: ['תאריך', 'תאריך עסקה', 'תאריך חיוב', 'תאריך פעולה', 'תאריך ביצוע', 'date', 'tx_date', 'transaction_date'],
  merchant: ['בית עסק', 'שם בית עסק', 'שם עסק', 'תיאור', 'פירוט', 'תיאור פעולה', 'merchant', 'description', 'payee', 'details'],
  amount: ['סכום', 'סכום חיוב', 'סכום עסקה', 'סכום מקורי', 'סך הכל', 'סכום בשח', 'amount', 'total', 'sum'],
  debit: ['חובה', 'סכום חובה', 'הוצאה', 'debit', 'expense'],
  credit: ['זכות', 'סכום זכות', 'הכנסה', 'credit', 'income'],
  category: ['קטגוריה', 'ענף', 'סיווג', 'סוג פעולה', 'category', 'type'],
  account: ['חשבון', 'מספר חשבון', '4 ספרות', 'ארבע ספרות', 'כרטיס', 'מספר כרטיס', 'account', 'card', 'last4'],
  notes: ['הערות', 'מידע נוסף', 'פתק', 'notes', 'memo', 'comment'],
};

// Robust CSV Line Parser handling quotes and delimiters
function parseCsvLine(line, delimiter = ',') {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Auto-detect delimiter
function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 5);
  if (lines.length === 0) return ',';

  const counts = { ',': 0, ';': 0, '\t': 0 };
  for (const line of lines) {
    counts[','] += (line.match(/,/g) || []).length;
    counts[';'] += (line.match(/;/g) || []).length;
    counts['\t'] += (line.match(/\t/g) || []).length;
  }

  if (counts[';'] > counts[','] && counts[';'] > counts['\t']) return ';';
  if (counts['\t'] > counts[','] && counts['\t'] > counts[';']) return '\t';
  return ',';
}

// Normalize date to YYYY-MM-DD
function normalizeDate(raw) {
  if (!raw) return null;
  const str = raw.trim();

  // DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmyMatch) {
    let day = dmyMatch[1].padStart(2, '0');
    let month = dmyMatch[2].padStart(2, '0');
    let year = dmyMatch[3];
    if (year.length === 2) year = '20' + year;
    return `${year}-${month}-${day}`;
  }

  // YYYY-MM-DD
  const ymdMatch = str.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (ymdMatch) {
    let year = ymdMatch[1];
    let month = ymdMatch[2].padStart(2, '0');
    let day = ymdMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

export default function CsvImportWizard({ isOpen, onClose, onImportSuccess }) {
  const [step, setStep] = useState(1); // 1: Upload, 2: Mapping, 3: Account Review & Summary, 4: Result
  const [file, setFile] = useState(null);
  const [csvRaw, setCsvRaw] = useState('');
  const [headers, setHeaders] = useState([]);
  const [parsedRows, setParsedRows] = useState([]);
  const [delimiter, setDelimiter] = useState(',');

  // Column mapping
  const [mapping, setMapping] = useState({
    date: '',
    merchant: '',
    amountMode: 'single', // 'single' or 'split' (debit/credit)
    amount: '',
    debit: '',
    credit: '',
    category: '',
    account: '',
    notes: '',
  });

  // Existing user accounts from API
  const [existingAccounts, setExistingAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // Grouped accounts detected from file
  // Array of { tempKey, detectedName, txCount, totalAmount, action: 'existing'|'create', accountId, newName, bankCompany }
  const [accountConfigs, setAccountConfigs] = useState([]);

  // Import execution state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Load existing accounts on mount
  useEffect(() => {
    if (isOpen) {
      loadAccounts();
    }
  }, [isOpen]);

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const res = await api.getAccounts();
      if (res.data) {
        setExistingAccounts(res.data);
      }
    } catch (err) {
      console.error('Failed to load accounts for CSV import', err);
    } finally {
      setLoadingAccounts(false);
    }
  };

  // Step 1: File selection & initial parsing
  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    processFile(selectedFile);
  };

  const processFile = (selectedFile) => {
    setFile(selectedFile);
    setErrorMessage('');
    const reader = new FileReader();

    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text !== 'string' || !text.trim()) {
        setErrorMessage('הקובץ שנבחר ריק');
        return;
      }

      setCsvRaw(text);
      const delim = detectDelimiter(text);
      setDelimiter(delim);

      const allLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (allLines.length < 2) {
        setErrorMessage('הקובץ מכיל פחות מ-2 שורות (דרושה כותרת ולפחות תנועה אחת)');
        return;
      }

      const rawHeaders = parseCsvLine(allLines[0], delim);
      setHeaders(rawHeaders);

      const rows = [];
      for (let i = 1; i < allLines.length; i++) {
        const row = parseCsvLine(allLines[i], delim);
        if (row.some((cell) => cell.length > 0)) {
          rows.push(row);
        }
      }
      setParsedRows(rows);

      // Auto-map columns
      const autoMap = {
        date: '',
        merchant: '',
        amountMode: 'single',
        amount: '',
        debit: '',
        credit: '',
        category: '',
        account: '',
        notes: '',
      };

      rawHeaders.forEach((h) => {
        const clean = h.trim().toLowerCase();
        for (const [key, words] of Object.entries(KEYWORDS)) {
          if (words.some((w) => clean.includes(w))) {
            if (key === 'debit') {
              autoMap.debit = h;
              autoMap.amountMode = 'split';
            } else if (key === 'credit') {
              autoMap.credit = h;
              autoMap.amountMode = 'split';
            } else if (!autoMap[key]) {
              autoMap[key] = h;
            }
          }
        }
      });

      // If split columns weren't both found, default to single amount
      if (autoMap.amountMode === 'split' && (!autoMap.debit || !autoMap.credit)) {
        autoMap.amountMode = 'single';
      }

      setMapping(autoMap);
      setStep(2);
    };

    reader.readAsText(selectedFile);
  };

  // Step 2 -> Step 3: Prepare Summary & Account configurations
  const handleProceedToSummary = () => {
    if (!mapping.date) {
      setErrorMessage('יש לבחור עמודת תאריך');
      return;
    }
    if (mapping.amountMode === 'single' && !mapping.amount) {
      setErrorMessage('יש לבחור עמודת סכום');
      return;
    }
    if (mapping.amountMode === 'split' && (!mapping.debit || !mapping.credit)) {
      setErrorMessage('יש לבחור עמודות חובה וזכות');
      return;
    }
    setErrorMessage('');

    // Group transactions by detected account column
    const dateIdx = headers.indexOf(mapping.date);
    const amountIdx = mapping.amountMode === 'single' ? headers.indexOf(mapping.amount) : -1;
    const debitIdx = mapping.amountMode === 'split' ? headers.indexOf(mapping.debit) : -1;
    const creditIdx = mapping.amountMode === 'split' ? headers.indexOf(mapping.credit) : -1;
    const accountIdx = mapping.account ? headers.indexOf(mapping.account) : -1;

    const groupMap = new Map();

    parsedRows.forEach((row, idx) => {
      let rawAccName = accountIdx >= 0 && row[accountIdx] ? row[accountIdx].trim() : 'חשבון ברירת מחדל';
      if (!rawAccName) rawAccName = 'חשבון ברירת מחדל';

      let amountVal = 0;
      if (mapping.amountMode === 'single') {
        const cleanAmount = (row[amountIdx] || '').replace(/[,₪$]/g, '').trim();
        amountVal = parseFloat(cleanAmount) || 0;
      } else {
        const debitVal = parseFloat((row[debitIdx] || '').replace(/[,₪$]/g, '').trim()) || 0;
        const creditVal = parseFloat((row[creditIdx] || '').replace(/[,₪$]/g, '').trim()) || 0;
        amountVal = creditVal > 0 ? creditVal : -Math.abs(debitVal);
      }

      if (!groupMap.has(rawAccName)) {
        groupMap.set(rawAccName, {
          detectedName: rawAccName,
          count: 0,
          total: 0,
        });
      }

      const grp = groupMap.get(rawAccName);
      grp.count += 1;
      grp.total += amountVal;
    });

    // Build configuration items
    const configs = [];
    let keyIdx = 0;

    groupMap.forEach((val, accName) => {
      keyIdx++;
      const tempKey = `acc_temp_${keyIdx}`;
      // Check if existing account has matching name or last 4 digits
      const matchedExisting = existingAccounts.find((a) => {
        const disp = (a.displayName || '').toLowerCase();
        const num = (a.accountNumber || '').slice(-4);
        const target = accName.toLowerCase();
        return disp.includes(target) || target.includes(disp) || (num && target.includes(num));
      });

      configs.push({
        tempKey,
        detectedName: accName,
        txCount: val.count,
        totalAmount: val.total,
        action: matchedExisting ? 'existing' : (existingAccounts.length > 0 ? 'existing' : 'create'),
        accountId: matchedExisting ? matchedExisting.id : (existingAccounts[0]?.id || ''),
        displayName: accName === 'חשבון ברירת מחדל' ? 'חשבון ייבוא חדש' : accName,
        bankCompany: 'manual',
        currency: 'ILS',
      });
    });

    setAccountConfigs(configs);
    setStep(3);
  };

  // Step 3: Execute Import
  const handleExecuteImport = async () => {
    setImporting(true);
    setErrorMessage('');

    try {
      const dateIdx = headers.indexOf(mapping.date);
      const merchantIdx = mapping.merchant ? headers.indexOf(mapping.merchant) : -1;
      const amountIdx = mapping.amountMode === 'single' ? headers.indexOf(mapping.amount) : -1;
      const debitIdx = mapping.amountMode === 'split' ? headers.indexOf(mapping.debit) : -1;
      const creditIdx = mapping.amountMode === 'split' ? headers.indexOf(mapping.credit) : -1;
      const categoryIdx = mapping.category ? headers.indexOf(mapping.category) : -1;
      const accountIdx = mapping.account ? headers.indexOf(mapping.account) : -1;
      const notesIdx = mapping.notes ? headers.indexOf(mapping.notes) : -1;

      // Build payload transactions
      const transactions = [];

      for (let i = 0; i < parsedRows.length; i++) {
        const row = parsedRows[i];
        const rawDate = row[dateIdx];
        const normalizedD = normalizeDate(rawDate);
        if (!normalizedD) continue;

        let amountVal = 0;
        if (mapping.amountMode === 'single') {
          const cleanAmount = (row[amountIdx] || '').replace(/[,₪$]/g, '').trim();
          amountVal = parseFloat(cleanAmount) || 0;
        } else {
          const debitVal = parseFloat((row[debitIdx] || '').replace(/[,₪$]/g, '').trim()) || 0;
          const creditVal = parseFloat((row[creditIdx] || '').replace(/[,₪$]/g, '').trim()) || 0;
          amountVal = creditVal > 0 ? creditVal : -Math.abs(debitVal);
        }

        if (isNaN(amountVal) || amountVal === 0) continue;

        let rawAccName = accountIdx >= 0 && row[accountIdx] ? row[accountIdx].trim() : 'חשבון ברירת מחדל';
        if (!rawAccName) rawAccName = 'חשבון ברירת מחדל';

        const configMatch = accountConfigs.find((c) => c.detectedName === rawAccName) || accountConfigs[0];
        const accountKey = configMatch?.tempKey;
        const accountId = configMatch?.action === 'existing' ? configMatch.accountId : null;

        const merchantStr = merchantIdx >= 0 ? (row[merchantIdx] || '').trim() : '';
        const categoryStr = categoryIdx >= 0 ? (row[categoryIdx] || '').trim() : '';
        const notesStr = notesIdx >= 0 ? (row[notesIdx] || '').trim() : '';

        transactions.push({
          accountKey,
          accountId,
          date: normalizedD,
          amount: amountVal,
          currency: 'ILS',
          merchantName: merchantStr || 'תנועה מיובאת',
          description: merchantStr,
          category: categoryStr || undefined,
          notes: notesStr || undefined,
        });
      }

      if (transactions.length === 0) {
        throw new Error('לא זוהו תנועות תקינות לייבוא מתוך הקובץ');
      }

      // Accounts payload
      const accountsPayload = accountConfigs.map((c) => ({
        tempKey: c.tempKey,
        action: c.action,
        accountId: c.action === 'existing' ? c.accountId : undefined,
        displayName: c.displayName,
        bankCompany: c.bankCompany || 'manual',
        currency: c.currency || 'ILS',
      }));

      const res = await api.importCsvTransactions({
        accounts: accountsPayload,
        transactions,
      });

      if (res.data?.success) {
        setImportResult(res.data);
        setStep(4);
        window.dispatchEvent(new CustomEvent('fintrack_transactions_updated'));
        window.dispatchEvent(new CustomEvent('fintrack_accounts_updated'));
        if (onImportSuccess) onImportSuccess(res.data);
      } else {
        throw new Error(res.error || 'שגיאה בייבוא הנתונים לשרת');
      }
    } catch (err) {
      console.error('Import error:', err);
      setErrorMessage(err.message || 'שגיאה בייבוא הנתונים');
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150" dir="rtl">
      <div className="w-full max-w-3xl bg-dark-surface light:bg-light-surface border border-dark-border light:border-light-border rounded-2xl p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-dark-border/60 light:border-light-border/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-primary/15 text-brand-primary flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-dark-text light:text-light-text flex items-center gap-2">
                <span>ייבוא תנועות חכם מקובץ CSV / אקסל</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                  שלב {step} מתוך 3
                </span>
              </h3>
              <p className="text-xs text-dark-text-muted light:text-light-text-muted">
                קליטה מהירה של תנועות מבנקים וכרטיסי אשראי, זיהוי אוטומטי של עמודות ושיוך לפי חשבון
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-dark-surface-elevated text-dark-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* ── STEP 1: Upload File ────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4 py-4">
              <label className="border-2 border-dashed border-dark-border hover:border-brand-primary light:border-light-border rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-dark-surface-elevated/40 light:bg-light-surface-elevated/40 hover:bg-dark-surface-elevated/80 group">
                <div className="w-14 h-14 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Upload className="w-7 h-7" />
                </div>
                <div className="font-bold text-sm text-dark-text light:text-light-text">
                  בחר קובץ CSV או גרור לכאן
                </div>
                <div className="text-xs text-dark-text-muted light:text-light-text-muted mt-1 max-w-sm">
                  תומך בקבצי תנועות מכל הבנקים וכרטיסי האשראי בישראל (לאומי, פועלים, דיסקונט, מזרחי, מקס, כאל, ישראכרט)
                </div>
                <input
                  type="file"
                  accept=".csv,.txt,.tsv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              <div className="p-4 rounded-xl bg-dark-surface-elevated/60 light:bg-light-surface-elevated/60 border border-dark-border/60 text-xs text-dark-text-muted space-y-1">
                <div className="font-semibold text-dark-text light:text-light-text flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-brand-primary" />
                  <span>זיהוי אוטומטי חכם:</span>
                </div>
                <div>המערכת מזהה בעצמה פסיקים, נקודה-פסיק, עמודות תאריך, סכומי חובה/זכות ושמות בתי עסק.</div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Column Mapping & Preview ───────────────────────── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-dark-text-muted">
                  קובץ: <span className="text-dark-text font-bold">{file?.name}</span> ({parsedRows.length} שורות זוהו)
                </div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs text-brand-primary hover:underline flex items-center gap-1"
                >
                  <ArrowRight className="w-3 h-3" />
                  <span>החלף קובץ</span>
                </button>
              </div>

              {/* Mapping Controls Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-4 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated/40 text-xs">
                <div className="space-y-1">
                  <label className="font-semibold text-dark-text-muted">עמודת תאריך *</label>
                  <select
                    value={mapping.date}
                    onChange={(e) => setMapping({ ...mapping, date: e.target.value })}
                    className="w-full p-2 rounded-lg border border-dark-border bg-dark-surface text-dark-text font-medium"
                  >
                    <option value="">-- בחר עמודה --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-dark-text-muted">בית עסק / תיאור</label>
                  <select
                    value={mapping.merchant}
                    onChange={(e) => setMapping({ ...mapping, merchant: e.target.value })}
                    className="w-full p-2 rounded-lg border border-dark-border bg-dark-surface text-dark-text font-medium"
                  >
                    <option value="">-- בחר עמודה --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-dark-text-muted">מבנה סכום</label>
                  <select
                    value={mapping.amountMode}
                    onChange={(e) => setMapping({ ...mapping, amountMode: e.target.value })}
                    className="w-full p-2 rounded-lg border border-dark-border bg-dark-surface text-dark-text font-medium"
                  >
                    <option value="single">עמודת סכום יחידה (סכום חיובי/שלילי)</option>
                    <option value="split">שתי עמודות נפרדות (חובה / זכות)</option>
                  </select>
                </div>

                {mapping.amountMode === 'single' ? (
                  <div className="space-y-1">
                    <label className="font-semibold text-dark-text-muted">עמודת סכום *</label>
                    <select
                      value={mapping.amount}
                      onChange={(e) => setMapping({ ...mapping, amount: e.target.value })}
                      className="w-full p-2 rounded-lg border border-dark-border bg-dark-surface text-dark-text font-medium"
                    >
                      <option value="">-- בחר עמודה --</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      <label className="font-semibold text-dark-text-muted">עמודת חובה (הוצאה) *</label>
                      <select
                        value={mapping.debit}
                        onChange={(e) => setMapping({ ...mapping, debit: e.target.value })}
                        className="w-full p-2 rounded-lg border border-dark-border bg-dark-surface text-dark-text font-medium"
                      >
                        <option value="">-- בחר עמודה --</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="font-semibold text-dark-text-muted">עמודת זכות (הכנסה) *</label>
                      <select
                        value={mapping.credit}
                        onChange={(e) => setMapping({ ...mapping, credit: e.target.value })}
                        className="w-full p-2 rounded-lg border border-dark-border bg-dark-surface text-dark-text font-medium"
                      >
                        <option value="">-- בחר עמודה --</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <div className="space-y-1">
                  <label className="font-semibold text-dark-text-muted">עמודת קטגוריה (אופציונלי)</label>
                  <select
                    value={mapping.category}
                    onChange={(e) => setMapping({ ...mapping, category: e.target.value })}
                    className="w-full p-2 rounded-lg border border-dark-border bg-dark-surface text-dark-text font-medium"
                  >
                    <option value="">-- ללא עמודה --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-dark-text-muted">עמודת חשבון / 4 ספרות (אופציונלי)</label>
                  <select
                    value={mapping.account}
                    onChange={(e) => setMapping({ ...mapping, account: e.target.value })}
                    className="w-full p-2 rounded-lg border border-dark-border bg-dark-surface text-dark-text font-medium"
                  >
                    <option value="">-- ללא עמודה (חשבון אחיד) --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sample Preview Table */}
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-dark-text light:text-light-text flex items-center justify-between">
                  <span>תצוגה מקדימה של 3 שורות ראשונות לפי המיפוי:</span>
                  <span className="text-[11px] text-dark-text-muted font-normal">סה"כ {parsedRows.length} תנועות</span>
                </div>
                <div className="border border-dark-border light:border-light-border rounded-xl overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-dark-surface-elevated light:bg-light-surface-elevated text-dark-text-muted border-b border-dark-border">
                      <tr>
                        <th className="p-2.5">תאריך</th>
                        <th className="p-2.5">בית עסק</th>
                        <th className="p-2.5">סכום</th>
                        <th className="p-2.5">קטגוריה</th>
                        <th className="p-2.5">חשבון זוהה</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-border/50">
                      {parsedRows.slice(0, 3).map((row, idx) => {
                        const dateIdx = headers.indexOf(mapping.date);
                        const merchantIdx = headers.indexOf(mapping.merchant);
                        const amountIdx = headers.indexOf(mapping.amount);
                        const debitIdx = headers.indexOf(mapping.debit);
                        const creditIdx = headers.indexOf(mapping.credit);
                        const catIdx = headers.indexOf(mapping.category);
                        const accIdx = headers.indexOf(mapping.account);

                        let amt = 0;
                        if (mapping.amountMode === 'single') {
                          amt = parseFloat((row[amountIdx] || '').replace(/[,₪$]/g, '').trim()) || 0;
                        } else {
                          const d = parseFloat((row[debitIdx] || '').replace(/[,₪$]/g, '').trim()) || 0;
                          const c = parseFloat((row[creditIdx] || '').replace(/[,₪$]/g, '').trim()) || 0;
                          amt = c > 0 ? c : -Math.abs(d);
                        }

                        return (
                          <tr key={idx} className="hover:bg-dark-surface-elevated/30">
                            <td className="p-2.5 font-mono">{normalizeDate(row[dateIdx]) || row[dateIdx] || '-'}</td>
                            <td className="p-2.5 font-semibold text-dark-text">{row[merchantIdx] || '-'}</td>
                            <td className={`p-2.5 font-bold font-mono ${amt < 0 ? 'text-brand-expense' : 'text-brand-income'}`}>
                              {formatILS(amt)}
                            </td>
                            <td className="p-2.5 text-dark-text-muted">{row[catIdx] || 'ללא סיווג'}</td>
                            <td className="p-2.5 text-dark-text-muted">{row[accIdx] || 'חשבון יחיד'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 3: Account Review & Summary ───────────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-brand-primary/20 bg-brand-primary/5 space-y-2">
                <div className="font-bold text-sm text-dark-text light:text-light-text flex items-center justify-between">
                  <span>סיכום נתוני הייבוא</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary font-bold">
                    {parsedRows.length} תנועות מוכנות לקליטה
                  </span>
                </div>
                <div className="text-xs text-dark-text-muted">
                  זוהו בקובץ {accountConfigs.length} חשבונות. בחר עבור כל חשבון האם לשייך אותו לחשבון קיים או ליצור חשבון חדש במערכת:
                </div>
              </div>

              {/* Accounts Mapping List */}
              <div className="space-y-3">
                {accountConfigs.map((cfg, idx) => (
                  <div
                    key={cfg.tempKey}
                    className="p-4 rounded-xl border border-dark-border light:border-light-border bg-dark-surface-elevated/40 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-dark-border/40 pb-2">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-brand-cyan" />
                        <span className="font-bold text-xs text-dark-text">
                          זוהה בקובץ: "{cfg.detectedName}"
                        </span>
                      </div>
                      <div className="text-xs text-dark-text-muted flex items-center gap-3">
                        <span>{cfg.txCount} תנועות</span>
                        <span className="font-bold font-mono text-dark-text">{formatILS(cfg.totalAmount)}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="space-y-1">
                        <label className="font-semibold text-dark-text-muted">פעולה</label>
                        <select
                          value={cfg.action}
                          onChange={(e) => {
                            const updated = [...accountConfigs];
                            updated[idx].action = e.target.value;
                            setAccountConfigs(updated);
                          }}
                          className="w-full p-2 rounded-lg border border-dark-border bg-dark-surface text-dark-text font-medium"
                        >
                          <option value="existing">שייך לחשבון קיים במערכת</option>
                          <option value="create">➕ צור חשבון חדש במערכת</option>
                        </select>
                      </div>

                      {cfg.action === 'existing' ? (
                        <div className="space-y-1">
                          <label className="font-semibold text-dark-text-muted">בחר חשבון יעד</label>
                          <select
                            value={cfg.accountId}
                            onChange={(e) => {
                              const updated = [...accountConfigs];
                              updated[idx].accountId = e.target.value;
                              setAccountConfigs(updated);
                            }}
                            className="w-full p-2 rounded-lg border border-dark-border bg-dark-surface text-dark-text font-medium"
                          >
                            {existingAccounts.map((acc) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.displayName || acc.bankCompany} {acc.accountNumber ? `(..${acc.accountNumber.slice(-4)})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <label className="font-semibold text-dark-text-muted">שם החשבון החדש</label>
                          <input
                            type="text"
                            value={cfg.displayName}
                            onChange={(e) => {
                              const updated = [...accountConfigs];
                              updated[idx].displayName = e.target.value;
                              setAccountConfigs(updated);
                            }}
                            placeholder="למשל: בנק לאומי (1234)"
                            className="w-full p-2 rounded-lg border border-dark-border bg-dark-surface text-dark-text font-medium"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 4: Success Result ─────────────────────────────────── */}
          {step === 4 && importResult && (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in">
              <div className="w-16 h-16 rounded-full bg-brand-income/15 text-brand-income flex items-center justify-center shadow-lg">
                <Check className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-bold text-dark-text light:text-light-text">
                  הייבוא הושלם בהצלחה!
                </h4>
                <p className="text-xs text-dark-text-muted light:text-light-text-muted max-w-md">
                  נקלטו בהצלחה {importResult.insertedCount} תנועות חדשות במסד הנתונים
                  {importResult.accountsCreated > 0 ? ` ונוצרו ${importResult.accountsCreated} חשבונות חדשים.` : '.'}
                </p>
              </div>

              <div className="flex items-center gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-bold shadow-md hover:bg-brand-primary-hover transition-colors cursor-pointer"
                >
                  מעולה, סגור חלון
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {step < 4 && (
          <div className="pt-3 border-t border-dark-border/60 light:border-light-border/60 flex items-center justify-between">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="px-4 py-2 rounded-xl border border-dark-border light:border-light-border text-xs font-medium text-dark-text hover:bg-dark-surface-elevated transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
                <span>חזור</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-dark-border text-xs font-medium text-dark-text-muted hover:text-dark-text"
              >
                ביטול
              </button>

              {step === 2 && (
                <button
                  type="button"
                  onClick={handleProceedToSummary}
                  className="px-5 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-primary-hover transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <span>המשך לסיכום חשבונות</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}

              {step === 3 && (
                <button
                  type="button"
                  onClick={handleExecuteImport}
                  disabled={importing}
                  className="px-6 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-primary-hover transition-colors flex items-center gap-2 shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>{importing ? 'מייבא נתונים...' : 'בצע ייבוא תנועות עכשיו'}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
