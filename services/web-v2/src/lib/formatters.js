export const formatILS = (amount, options = {}) => {
  const { compact = false, showSign = false, decimals = 2 } = options;
  const num = parseFloat(amount) || 0;
  
  if (compact && Math.abs(num) >= 1000) {
    const formatted = new Intl.NumberFormat('he-IL', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(num);
    return `₪${formatted}`;
  }

  const formatted = new Intl.NumberFormat('he-IL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(num));

  if (showSign) {
    const sign = num > 0 ? '+' : num < 0 ? '-' : '';
    return `${sign}₪${formatted}`;
  }

  return num < 0 ? `-₪${formatted}` : `₪${formatted}`;
};

export const formatCurrency = (amount, currency = 'ILS', options = {}) => {
  const num = parseFloat(amount) || 0;
  const curr = (currency || 'ILS').toUpperCase().trim();
  const decimals = options.decimals ?? 2;
  const absFormatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(num));

  const sign = num < 0 ? '-' : (options.showSign && num > 0 ? '+' : '');

  if (curr === 'USD' || curr === '$') return `${sign}$${absFormatted}`;
  if (curr === 'EUR' || curr === '€') return `${sign}€${absFormatted}`;
  if (curr === 'GBP' || curr === '£') return `${sign}£${absFormatted}`;
  if (curr === 'ILS' || curr === 'NIS' || curr === '₪') return `${sign}₪${absFormatted}`;
  return `${sign}${absFormatted} ${curr}`;
};

export const formatDate = (dateInput, locale = 'he') => {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';

  return new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
};

export const formatRelativeTime = (dateInput, locale = 'he') => {
  if (!dateInput) return locale === 'he' ? 'טרם עודכן' : 'Never updated';
  const d = new Date(dateInput);
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);

  if (diffSec < 60) return locale === 'he' ? 'ממש עכשיו' : 'Just now';
  if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    return locale === 'he' ? `לפני ${mins} דקות` : `${mins}m ago`;
  }
  if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    return locale === 'he' ? `לפני ${hours} שעות` : `${hours}h ago`;
  }
  const days = Math.floor(diffSec / 86400);
  return locale === 'he' ? `לפני ${days} ימים` : `${days}d ago`;
};

/**
 * Collapses spaced-out Hebrew characters commonly returned in card statement PDFs/tables.
 * Example: "ב י  ד ר א ג ס ט ו ר ס  א ר י א ל" -> "בי דראגסטורס אריאל"
 */
export const cleanSpacedHebrew = (str) => {
  if (!str || typeof str !== 'string') return str || '';
  const hebrewLetterRegex = /^[\u0590-\u05FF]$/;
  // Split by double or more whitespace (word boundaries in spaced text)
  const parts = str.split(/\s{2,}/);
  const cleaned = parts.map((part) => {
    const tokens = part.trim().split(/\s+/);
    if (tokens.length >= 2 && tokens.every((t) => hebrewLetterRegex.test(t) || /^[0-9]$/.test(t))) {
      return tokens.join('');
    }
    // Also handle single space separated sequence of single Hebrew letters
    let res = part;
    let prev;
    do {
      prev = res;
      res = res.replace(/(^|[\s])([\u0590-\u05FF])\s([\u0590-\u05FF])(?=[\s]|$)/g, '$1$2$3');
    } while (res !== prev);
    return res;
  });
  return cleaned.join(' ').replace(/\s+/g, ' ').trim();
};

/**
 * Checks whether a transaction originates from the BIT payment service.
 * Handles Hebrew prepositions (בביט, לביט, מביט, ב-bit), spaced characters (ב י ט, b i t),
 * card descriptors (BIT*1234, BIT-PURCHASE), and excludes insurance/cancellation words (ביטוח, ביטול).
 */
export const isBitTransaction = (merchantName, description, memo) => {
  const m = cleanSpacedHebrew(merchantName || '').trim();
  const d = cleanSpacedHebrew(description || '').trim();
  const mem = cleanSpacedHebrew(memo || '').trim();
  const allText = [m, d, mem].filter(Boolean).join(' ');

  return /(?:^|[^\w\u0590-\u05FF]|\s)(?:[בלמהכ]?-?bit|[בלמהכ]?-?ביט|b\s*i\s*t|ב\s*י\s*ט)(?:$|[^\w\u0590-\u05FF]|\s)/i.test(allText);
};

/**
 * Detects if a transaction is from BIT and formats its display name:
 * "bit [original transaction description or memo]"
 */
export const formatBitTransactionName = (merchantName, description, memo) => {
  const m = cleanSpacedHebrew(merchantName || '').trim();
  const d = cleanSpacedHebrew(description || '').trim();
  const mem = cleanSpacedHebrew(memo || '').trim();

  if (!isBitTransaction(m, d, mem)) return null;

  // Extract the original description / memo details beyond the word "bit"
  const candidates = [d, mem, m];
  let detail = '';

  for (const str of candidates) {
    if (!str) continue;
    let cleaned = str
      .replace(/(?:העברה|העברת|חיוב|תשלום|זיכוי|משיכה|הוראת קבע)\s+(?:ב-?|ל-?|מ-?)?(?:bit|ביט)/gi, ' ')
      .replace(/(?:^|[^\w\u0590-\u05FF]|\s)(?:[בלמהכ]?-?bit|[בלמהכ]?-?ביט|b\s*i\s*t|ב\s*י\s*ט)(?:$|[^\w\u0590-\u05FF]|\s)/gi, ' ')
      .replace(/(?:^|[\s\-_/])(?:אל|לכבוד|עבור|מאת|מ-|ל-)\s*/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    cleaned = cleaned.replace(/^[\s\-_:.*#/]+|[\s\-_:.*#/]+$/g, '').trim();

    if (cleaned && !/^(בית עסק|עסקאות באינטרנט|קניות באינטרנט|תשלום בנייד|העברה|חיוב|תשלום|זיכוי|משיכה)$/.test(cleaned) && cleaned.length >= 2) {
      detail = cleaned;
      break;
    }
  }

  if (detail) {
    return `bit ${cleanSpacedHebrew(detail)}`;
  }
  return 'bit';
};

/**
 * Resolves the display headline/title for a transaction:
 * Priority: userDescription > formatBitTransactionName > merchantName > description > 'ללא שם'
 */
export const getTransactionTitle = (tx) => {
  if (!tx) return 'ללא תיאור';
  if (tx.userDescription && tx.userDescription.trim()) {
    return cleanSpacedHebrew(tx.userDescription);
  }
  const rawMemo = tx.rawData?.memo || tx.memo;
  const bitName = formatBitTransactionName(tx.merchantName, tx.description, rawMemo);
  if (bitName) {
    return bitName;
  }
  return cleanSpacedHebrew(tx.merchantName || tx.description || 'ללא תיאור');
};

/**
 * Intelligently extracts installment metadata from transaction object, rawData, and text descriptions.
 * Handles Israeli credit card statement formats:
 * - Structured installments object: { number, total } or { current, count }
 * - Text patterns: "תשלום 1 מתוך 12", "תשלום 1/12", "(1/10)", "1 מתוך 5", "עסקה 1/3"
 * - Discrepancy between originalAmount (total deal sum) and chargedAmount (monthly installment charge)
 */
export const extractInstallmentInfo = (tx, rawOverride = null) => {
  if (!tx) {
    return { isInstallment: false, number: 1, total: 1, text: 'תשלום רגיל (תשלום יחיד)' };
  }

  let raw = rawOverride;
  if (!raw && tx.rawData) {
    raw = typeof tx.rawData === 'string' ? (() => { try { return JSON.parse(tx.rawData); } catch(e) { return {}; } })() : tx.rawData;
  }
  if (!raw || typeof raw !== 'object') raw = {};

  // 1. Check structured installments in tx or rawData
  const inst = tx.installments || raw.installments;
  if (inst) {
    if (typeof inst === 'object' && inst !== null) {
      const num = parseInt(inst.number ?? inst.current ?? inst.num ?? 1, 10);
      const total = parseInt(inst.total ?? inst.count ?? 1, 10);
      if (total > 1) {
        return {
          isInstallment: true,
          number: num,
          total: total,
          text: `תשלום ${num} מתוך ${total}`,
          chargedAmount: Math.abs(parseFloat(tx.chargedAmount || raw.chargedAmount || tx.amount || 0)),
          totalAmount: Math.abs(parseFloat(tx.originalAmount || raw.originalAmount || 0)),
        };
      }
    } else if (typeof inst === 'string' && inst.trim()) {
      const m = inst.match(/(\d+)\s*(?:מתוך|\/)\s*(\d+)/);
      if (m) {
        const num = parseInt(m[1], 10);
        const total = parseInt(m[2], 10);
        if (total > 1) {
          return {
            isInstallment: true,
            number: num,
            total: total,
            text: `תשלום ${num} מתוך ${total}`,
            chargedAmount: Math.abs(parseFloat(tx.chargedAmount || raw.chargedAmount || tx.amount || 0)),
            totalAmount: Math.abs(parseFloat(tx.originalAmount || raw.originalAmount || 0)),
          };
        }
      }
    }
  }

  // 2. Search for installment patterns in Hebrew descriptions / memos
  const textCandidates = [
    tx.description,
    tx.memo,
    tx.userDescription,
    raw.description,
    raw.memo,
    raw.originalDescription,
  ].filter(Boolean);

  for (const str of textCandidates) {
    const cleanStr = cleanSpacedHebrew(String(str));
    // Matches: "תשלום 2 מתוך 12", "תשלום 2/12", "תשלומים 2/12", "(2/12)", "2 מתוך 12", "2/12"
    const match = cleanStr.match(/(?:תשלום|תשלומים|עסקה)?\s*\(?(\d{1,2})\s*(?:מתוך|\/)\s*(\d{1,2})\)?/);
    if (match) {
      const num = parseInt(match[1], 10);
      const total = parseInt(match[2], 10);
      if (total > 1 && total <= 120 && num <= total) {
        return {
          isInstallment: true,
          number: num,
          total: total,
          text: `תשלום ${num} מתוך ${total}`,
          chargedAmount: Math.abs(parseFloat(tx.chargedAmount || raw.chargedAmount || tx.amount || 0)),
          totalAmount: Math.abs(parseFloat(tx.originalAmount || raw.originalAmount || 0)),
        };
      }
    }
  }

  // 3. Check for amount discrepancy in credit cards (original total deal vs single installment)
  const origAmt = Math.abs(parseFloat(raw.originalAmount || tx.originalAmount || 0));
  const chargedAmt = Math.abs(parseFloat(raw.chargedAmount || tx.chargedAmount || tx.amount || 0));
  if (origAmt > 0 && chargedAmt > 0 && origAmt > chargedAmt * 1.5) {
    const ratio = Math.round(origAmt / chargedAmt);
    if (ratio >= 2 && ratio <= 60 && Math.abs(origAmt - chargedAmt * ratio) < (chargedAmt * 0.15)) {
      return {
        isInstallment: true,
        number: 1,
        total: ratio,
        text: `עסקת ${ratio} תשלומים (${formatILS(chargedAmt)} / תשלום)`,
        chargedAmount: chargedAmt,
        totalAmount: origAmt,
      };
    }
  }

  // 4. Check if type explicitly says installments
  const typeStr = String(raw.type || tx.type || '').toLowerCase();
  if (typeStr.includes('installment') || typeStr.includes('תשלום')) {
    return {
      isInstallment: true,
      number: 1,
      total: 1,
      text: 'עסקה בתשלומים',
      chargedAmount: chargedAmt || Math.abs(parseFloat(tx.amount || 0)),
      totalAmount: origAmt || Math.abs(parseFloat(tx.amount || 0)),
    };
  }

  return { isInstallment: false, number: 1, total: 1, text: 'תשלום רגיל (תשלום יחיד)' };
};

