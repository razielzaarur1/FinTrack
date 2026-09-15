/**
 * Historical Exchange Rate & Conversion Fee Service
 * Fetches official representative rates (e.g. from European Central Bank / Frankfurter API)
 * with smart in-memory caching and fallback baselines.
 */

const rateCache = new Map();

// Updated fallback baseline rates to ILS if all external APIs are completely unreachable
const FALLBACK_RATES_TO_ILS = {
  USD: 3.65,
  EUR: 3.75,
  GBP: 4.45,
  CAD: 2.65,
  AUD: 2.35,
  CHF: 4.05,
  JPY: 0.024,
  CNY: 0.50,
  THB: 0.10,
  TRY: 0.10,
  AED: 0.99,
  JOD: 5.15,
};

/**
 * Normalizes ISO date string to YYYY-MM-DD
 */
export function normalizeDateStr(dateInput) {
  if (!dateInput) return new Date().toISOString().slice(0, 10);
  if (dateInput instanceof Date) return dateInput.toISOString().slice(0, 10);
  const str = String(dateInput).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

/**
 * Normalizes currency code (e.g. '$' -> 'USD', '€' -> 'EUR', '£' -> 'GBP')
 */
export function normalizeCurrency(currency) {
  if (!currency) return 'ILS';
  const c = String(currency).trim().toUpperCase();
  if (c === '$' || c === 'USD' || c === 'דולר') return 'USD';
  if (c === '€' || c === 'EUR' || c === 'אירו' || c === 'יורו') return 'EUR';
  if (c === '£' || c === 'GBP' || c === 'פאונד' || c === 'לירה שטרלינג') return 'GBP';
  if (c === '₪' || c === 'ILS' || c === 'NIS' || c === 'שקל') return 'ILS';
  return c;
}

/**
 * Fetches representative rate from foreign currency to target currency (default: ILS)
 * for a specific historical date across multiple resilient API endpoints.
 */
export async function getHistoricalRate(fromCurrency, toCurrency = 'ILS', dateInput = null) {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);

  if (from === to) {
    return 1.0;
  }

  const dateStr = normalizeDateStr(dateInput);
  const cacheKey = `${dateStr}_${from}_${to}`;

  if (rateCache.has(cacheKey)) {
    return rateCache.get(cacheKey);
  }

  // 1. Try Frankfurter API (dev endpoint)
  try {
    const url1 = `https://api.frankfurter.dev/v1/${dateStr}?base=${from}&symbols=${to}`;
    const res1 = await fetch(url1, { signal: AbortSignal.timeout(3500) });
    if (res1.ok) {
      const data1 = await res1.json();
      const rate1 = parseFloat(data1?.rates?.[to]);
      if (!isNaN(rate1) && rate1 > 0) {
        rateCache.set(cacheKey, rate1);
        return rate1;
      }
    }
  } catch (_) {}

  // 2. Try Frankfurter API (app endpoint)
  try {
    const url2 = `https://api.frankfurter.app/${dateStr}?from=${from}&to=${to}`;
    const res2 = await fetch(url2, { signal: AbortSignal.timeout(3500) });
    if (res2.ok) {
      const data2 = await res2.json();
      const rate2 = parseFloat(data2?.rates?.[to]);
      if (!isNaN(rate2) && rate2 > 0) {
        rateCache.set(cacheKey, rate2);
        return rate2;
      }
    }
  } catch (_) {}

  // 3. Try open.er-api.com
  try {
    const url3 = `https://open.er-api.com/v6/latest/${from}`;
    const res3 = await fetch(url3, { signal: AbortSignal.timeout(3500) });
    if (res3.ok) {
      const data3 = await res3.json();
      const rate3 = parseFloat(data3?.rates?.[to]);
      if (!isNaN(rate3) && rate3 > 0) {
        rateCache.set(cacheKey, rate3);
        return rate3;
      }
    }
  } catch (_) {}

  // 4. Fallback to baseline
  const fallback = FALLBACK_RATES_TO_ILS[from] || 3.70;
  rateCache.set(cacheKey, fallback);
  return fallback;
}

/**
 * Analyzes a transaction and calculates conversion fee, fee per currency unit,
 * and spread percentage against the official representative rate on the transaction date.
 *
 * @param {object} tx - Transaction row or object
 * @returns {Promise<object|null>} FX details or null if transaction is not in foreign currency
 */
export async function calculateFxDetails(tx) {
  if (!tx) return null;

  const rawData = typeof tx.raw_data === 'string'
    ? (() => { try { return JSON.parse(tx.raw_data); } catch (_) { return {}; } })()
    : (tx.raw_data || tx.rawData || {});

  const originalCurrency = normalizeCurrency(
    rawData.originalCurrency || 
    rawData.original_currency || 
    tx.originalCurrency || 
    tx.original_currency || 
    (tx.currency !== 'ILS' && tx.currency !== 'NIS' ? tx.currency : null)
  );

  const chargedCurrency = normalizeCurrency(
    rawData.chargedCurrency || 
    rawData.charged_currency || 
    tx.chargedCurrency || 
    tx.charged_amount || 
    'ILS'
  );

  // Check if foreign transaction
  const isForeign = originalCurrency !== 'ILS' || (chargedCurrency === 'ILS' && originalCurrency !== chargedCurrency);
  if (!isForeign) {
    return null;
  }

  const rawOrigAmt = parseFloat(
    rawData.originalAmount ?? 
    rawData.original_amount ?? 
    tx.originalAmount ?? 
    tx.original_amount
  );
  const rawChgAmt = parseFloat(
    rawData.chargedAmount ?? 
    rawData.charged_amount ?? 
    tx.chargedAmount ?? 
    tx.charged_amount ?? 
    tx.amount
  );

  const foreignAmount = Math.abs(!isNaN(rawOrigAmt) && rawOrigAmt !== 0 ? rawOrigAmt : (parseFloat(tx.amount) || 0));
  const ilsAmount = Math.abs(!isNaN(rawChgAmt) && rawChgAmt !== 0 ? rawChgAmt : (parseFloat(tx.amount) || 0));

  if (foreignAmount <= 0 || ilsAmount <= 0) {
    return null;
  }

  // Use processed date if available (usually when credit card company locks settlement rate) or transaction date
  const dateStr = normalizeDateStr(tx.processed_date || tx.processedDate || tx.date || rawData.processedDate || rawData.date);

  // Get official representative exchange rate for this transaction date
  const representativeRate = await getHistoricalRate(originalCurrency, 'ILS', dateStr);

  // Cost at the official representative rate
  const costAtRepresentativeRate = parseFloat((foreignAmount * representativeRate).toFixed(2));

  // Actual effective rate charged by card company / bank
  const effectiveRate = parseFloat((ilsAmount / foreignAmount).toFixed(4));

  // Conversion fee in ILS (difference between charged amount and official representative cost)
  const conversionFeeILS = parseFloat((ilsAmount - costAtRepresentativeRate).toFixed(2));

  // Fee per single unit of foreign currency in ILS
  const feePerUnit = parseFloat((effectiveRate - representativeRate).toFixed(4));

  // Fee in Agorot per single foreign currency unit (e.g. 9 אגורות לכל יורו)
  const feePerUnitAgorot = Math.round(feePerUnit * 100);

  // Spread percentage
  const feePercent = representativeRate > 0
    ? parseFloat((((effectiveRate - representativeRate) / representativeRate) * 100).toFixed(2))
    : 0;

  return {
    isForeign: true,
    originalCurrency,
    foreignCurrency: originalCurrency, // Provided for frontend compatibility
    chargedCurrency: 'ILS',
    foreignAmount,
    ilsAmount,
    date: dateStr,
    rateDate: dateStr,
    representativeRate,
    effectiveRate,
    costAtRepresentativeRate,
    conversionFeeILS,
    feePerUnit,
    feePerUnitAgorot,
    feePercent,
    isPositiveFee: conversionFeeILS > 0,
  };
}

export default {
  normalizeDateStr,
  normalizeCurrency,
  getHistoricalRate,
  calculateFxDetails,
};
