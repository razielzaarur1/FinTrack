/**
 * FinTrack Date Utilities for Custom Monthly Financial Cycles
 * Allows any billing / cycle start day (1 to 31).
 * E.g., startDay = 10 -> Month of March 2026 runs from 2026-03-10 through 2026-04-09.
 */

export const HEBREW_MONTHS_FULL = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
];

export const HEBREW_MONTHS_SHORT = [
  'ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני',
  'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'
];

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function getDaysInMonth(year, month) {
  // month is 1-indexed (1 to 12)
  return new Date(year, month, 0).getDate();
}

/**
 * Format a Date object to 'YYYY-MM-DD' in local time
 */
export function toLocalDateStr(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Calculate the exact start and end date bounds for a financial month
 * @param {number|string} year - 4 digit year (e.g. 2026)
 * @param {number|string} month - 1-indexed month (1 to 12)
 * @param {number|string} startDay - 1 to 31
 */
export function getFinancialMonthRange(year, month, startDay = 1) {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const sDay = Math.min(31, Math.max(1, parseInt(startDay, 10) || 1));
  const monthKey = `${y}-${pad2(m)}`;
  const monthName = HEBREW_MONTHS_FULL[m - 1] || monthKey;
  const monthNameShort = HEBREW_MONTHS_SHORT[m - 1] || monthKey;

  if (sDay === 1) {
    const daysInM = getDaysInMonth(y, m);
    const startDate = `${y}-${pad2(m)}-01`;
    const endDate = `${y}-${pad2(m)}-${pad2(daysInM)}`;
    return {
      year: y,
      month: m,
      startDay: 1,
      monthKey,
      startDate,
      endDate,
      label: `${monthName} ${y}`,
      shortLabel: `${monthNameShort} ${String(y).slice(2)}`,
      displayRange: `${pad2(1)}/${pad2(m)} – ${pad2(daysInM)}/${pad2(m)}`,
      fullDisplayRange: `01/${pad2(m)}/${y} – ${pad2(daysInM)}/${pad2(m)}/${y}`,
    };
  }

  // Cycle starts on sDay of month m (capped to number of days in month m)
  const startDayClamped = Math.min(sDay, getDaysInMonth(y, m));
  const startDate = `${y}-${pad2(m)}-${pad2(startDayClamped)}`;

  // Cycle ends on (sDay - 1) of month m + 1
  let nextYear = y;
  let nextMonth = m + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  const endDayClamped = Math.min(sDay - 1, getDaysInMonth(nextYear, nextMonth));
  const endDate = `${nextYear}-${pad2(nextMonth)}-${pad2(endDayClamped)}`;

  const displayRange = `${pad2(startDayClamped)}/${pad2(m)} – ${pad2(endDayClamped)}/${pad2(nextMonth)}`;
  const fullDisplayRange = `${pad2(startDayClamped)}/${pad2(m)}/${y} – ${pad2(endDayClamped)}/${pad2(nextMonth)}/${nextYear}`;

  return {
    year: y,
    month: m,
    startDay: sDay,
    monthKey,
    startDate,
    endDate,
    label: `${monthName} ${y} (${displayRange})`,
    shortLabel: `${monthNameShort} ${String(y).slice(2)}`,
    displayRange,
    fullDisplayRange,
  };
}

/**
 * Get current active financial month based on reference date and startDay
 */
export function getCurrentFinancialMonth(startDay = 1, refDate = new Date()) {
  const sDay = Math.min(31, Math.max(1, parseInt(startDay, 10) || 1));
  const d = refDate instanceof Date ? refDate : new Date(refDate);
  const curDay = d.getDate();
  let year = d.getFullYear();
  let month = d.getMonth() + 1;

  if (sDay > 1 && curDay < sDay) {
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
  }

  return getFinancialMonthRange(year, month, sDay);
}

/**
 * Get previous financial month
 */
export function getPreviousFinancialMonth(startDay = 1, refDate = new Date()) {
  const current = getCurrentFinancialMonth(startDay, refDate);
  let prevYear = current.year;
  let prevMonth = current.month - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }
  return getFinancialMonthRange(prevYear, prevMonth, startDay);
}

/**
 * Determine which financial month key (YYYY-MM) a specific transaction date falls into
 */
export function getFinancialMonthKey(dateInput, startDay = 1) {
  if (!dateInput) return null;
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return null;

  const sDay = Math.min(31, Math.max(1, parseInt(startDay, 10) || 1));
  const curDay = d.getDate();
  let year = d.getFullYear();
  let month = d.getMonth() + 1;

  if (sDay > 1 && curDay < sDay) {
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
  }

  return `${year}-${pad2(month)}`;
}

/**
 * Generate a list of past N financial months (e.g. for dropdowns and trend charts)
 */
export function getPastFinancialMonths(count = 12, startDay = 1, refDate = new Date()) {
  const current = getCurrentFinancialMonth(startDay, refDate);
  const result = [];

  let curYear = current.year;
  let curMonth = current.month;

  for (let i = 0; i < count; i++) {
    result.push(getFinancialMonthRange(curYear, curMonth, startDay));
    curMonth -= 1;
    if (curMonth < 1) {
      curMonth = 12;
      curYear -= 1;
    }
  }

  return result;
}

/**
 * Format a human-readable Hebrew range string
 */
export function formatHebrewCycleRange(startDate, endDate) {
  if (!startDate || !endDate) return '';
  const [sy, sm, sd] = startDate.split('-');
  const [ey, em, ed] = endDate.split('-');
  if (!sy || !ey) return '';

  return `${parseInt(sd, 10)} ב${HEBREW_MONTHS_FULL[parseInt(sm, 10) - 1]} – ${parseInt(ed, 10)} ב${HEBREW_MONTHS_FULL[parseInt(em, 10) - 1]} ${ey}`;
}
