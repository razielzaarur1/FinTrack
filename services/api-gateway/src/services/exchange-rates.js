/**
 * Historical Exchange Rate & Conversion Fee Service
 * Fetches official representative rates (e.g. from European Central Bank / Frankfurter API)
 * with smart in-memory caching and fallback baselines.
 */

const rateCache = new Map();

// Fallback rates if external API is unreachable
const FALLBACK_RATES_TO_ILS = {
  USD: 3.70,
  EUR: 4.02,
  GBP: 4.72,
  CAD: 2.72,
  AUD: 2.45,
  CHF: 4.15,
  JPY: 0.025,
  CNY: 0.51,
  THB: 0.10,
  TRY: 0.11,
  AED: 1.01,
  JOD: 5.22,
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
 * for a specific historical date.
 * Uses Frankfurter API (ECB official reference rates, free, fast, no API key required).
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

  try {
    // Frankfurter API automatically snaps to the latest preceding trading day on weekends/holidays
    const url = `https://api.frankfurter.app/${dateStr}?from=${from}&to=${to}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      const rate = parseFloat(data?.rates?.[to]);
      if (!isNaN(rate) && rate > 0) {
        rateCache.set(cacheKey, rate);
        return rate;
      }
    }
  } catch (err) {
    // Non-blocking, fallback will be used
  }

  // Fallback to baseline
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
    rawData.originalCurrency || tx.originalCurrency || tx.currency
  );
  const chargedCurrency = normalizeCurrency(
    rawData.chargedCurrency || tx.chargedCurrency || 'ILS'
  );

  // Check if foreign transaction
  const isForeign = originalCurrency !== 'ILS' || (chargedCurrency === 'ILS' && originalCurrency !== chargedCurrency);
  if (!isForeign) {
    return null;
  }

  const rawOrigAmt = parseFloat(rawData.originalAmount ?? tx.originalAmount);
  const rawChgAmt = parseFloat(rawData.chargedAmount ?? tx.chargedAmount ?? tx.amount);

  const foreignAmount = Math.abs(!isNaN(rawOrigAmt) && rawOrigAmt !== 0 ? rawOrigAmt : (parseFloat(tx.amount) || 0));
  const ilsAmount = Math.abs(!isNaN(rawChgAmt) && rawChgAmt !== 0 ? rawChgAmt : (parseFloat(tx.amount) || 0));

  if (foreignAmount <= 0 || ilsAmount <= 0) {
    return null;
  }

  const dateStr = normalizeDateStr(tx.date || rawData.date);

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

  // Fee in Agorot per single foreign currency unit (e.g. 30 אגורות לדולר)
  const feePerUnitAgorot = Math.round(feePerUnit * 100);

  // Spread percentage
  const feePercent = representativeRate > 0
    ? parseFloat((((effectiveRate - representativeRate) / representativeRate) * 100).toFixed(2))
    : 0;

  return {
    isForeign: true,
    originalCurrency,
    chargedCurrency: 'ILS',
    foreignAmount,
    ilsAmount,
    date: dateStr,
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
