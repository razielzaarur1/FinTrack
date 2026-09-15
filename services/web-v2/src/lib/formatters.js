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
 * Detects if a transaction is from BIT and formats its display name:
 * "bit [original transaction description or memo]"
 */
export const formatBitTransactionName = (merchantName, description, memo) => {
  const m = cleanSpacedHebrew(merchantName || '').trim();
  const d = cleanSpacedHebrew(description || '').trim();
  const mem = cleanSpacedHebrew(memo || '').trim();

  // Check if BIT appears in merchantName, description, or memo
  const isBit = /(?:^|[\s\-_/])(?:bit|ביט)(?:$|[\s\-_/])/i.test(m) ||
                /(?:^|[\s\-_/])(?:bit|ביט)(?:$|[\s\-_/])/i.test(d) ||
                /(?:^|[\s\-_/])(?:bit|ביט)(?:$|[\s\-_/])/i.test(mem);

  if (!isBit) return null;

  // Extract the original description / memo details beyond the word "bit"
  const candidates = [d, mem, m];
  let detail = '';

  for (const str of candidates) {
    if (!str) continue;
    let cleaned = str
      .replace(/(?:^|[\s\-_/])(?:bit|ביט|העברה בביט|חיוב ביט|תשלום בביט)(?:$|[\s\-_/])/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    cleaned = cleaned.replace(/^[\s\-_:.]+|[\s\-_:.]+$/g, '').trim();

    if (cleaned && !/^(בית עסק|העברה|חיוב|תשלום)$/.test(cleaned) && cleaned.length >= 2) {
      detail = cleaned;
      break;
    }
  }

  if (!detail) {
    for (const str of candidates) {
      const clean = (str || '').replace(/^[\s\-_:.]+|[\s\-_:.]+$/g, '').trim();
      if (clean && !/^(bit|ביט|בית עסק)$/i.test(clean)) {
        detail = clean;
        break;
      }
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

