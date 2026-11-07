/**
 * Helper to fetch system settings and compute financial month bounds for queries
 */

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function getDaysInMonth(year, month) {
  // month is 1-indexed (1 to 12)
  return new Date(year, month, 0).getDate();
}

/**
 * Fetch the user's configured monthStartDay from system_settings
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @returns {Promise<number>} Day of month (1 to 31)
 */
export async function getSystemMonthStartDay(pool, userId = DEFAULT_USER_ID) {
  try {
    const res = await pool.query(
      `SELECT settings->>'monthStartDay' AS start_day FROM system_settings WHERE user_id = $1`,
      [userId]
    );
    if (res.rows.length > 0 && res.rows[0].start_day !== null && res.rows[0].start_day !== undefined) {
      const parsed = parseInt(res.rows[0].start_day, 10);
      if (!isNaN(parsed)) {
        return Math.min(31, Math.max(1, parsed));
      }
    }
  } catch (err) {
    console.error('Failed to get system monthStartDay:', err);
  }
  return 10; // Default financial month cycle start day
}

/**
 * Calculate the exact start and end date bounds for a financial month
 * @param {number|string} year - 4 digit year (e.g. 2026)
 * @param {number|string} month - 1-indexed month (1 to 12)
 * @param {number|string} startDay - 1 to 31
 * @returns {{ startDate: string, endDate: string, year: number, month: number, monthKey: string }}
 */
export function getFinancialMonthBounds(year, month, startDay = 1) {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const sDay = Math.min(31, Math.max(1, parseInt(startDay, 10) || 1));
  const monthKey = `${y}-${pad2(m)}`;

  if (sDay === 1) {
    const daysInM = getDaysInMonth(y, m);
    return {
      startDate: `${y}-${pad2(m)}-01`,
      endDate: `${y}-${pad2(m)}-${pad2(daysInM)}`,
      year: y,
      month: m,
      monthKey,
    };
  }

  const startDayClamped = Math.min(sDay, getDaysInMonth(y, m));
  const startDate = `${y}-${pad2(m)}-${pad2(startDayClamped)}`;

  // The cycle ends the day before the NEXT cycle starts (its start day is also clamped to the
  // length of that month), so consecutive cycles never overlap and never leave gaps.
  let nextYear = y;
  let nextMonth = m + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  const nextStartClamped = Math.min(sDay, getDaysInMonth(nextYear, nextMonth));
  const endDay = new Date(Date.UTC(nextYear, nextMonth - 1, nextStartClamped - 1));
  const endDate = `${endDay.getUTCFullYear()}-${pad2(endDay.getUTCMonth() + 1)}-${pad2(endDay.getUTCDate())}`;

  return {
    startDate,
    endDate,
    year: y,
    month: m,
    monthKey,
  };
}

/**
 * Calculate current active financial month bounds
 * @param {number|string} startDay
 * @param {Date} refDate
 */
export function getCurrentFinancialMonthBounds(startDay = 1, refDate = new Date()) {
  const sDay = Math.min(31, Math.max(1, parseInt(startDay, 10) || 1));
  const d = refDate instanceof Date ? refDate : new Date(refDate);
  const curDay = d.getDate();
  let year = d.getFullYear();
  let month = d.getMonth() + 1;

  // Compare against the clamped start day of the current month (e.g. day 31 -> Feb 28)
  if (sDay > 1 && curDay < Math.min(sDay, getDaysInMonth(year, month))) {
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
  }

  return getFinancialMonthBounds(year, month, sDay);
}

/**
 * Returns SQL expression to calculate the financial month key for any transaction date
 * @param {number} startDay
 * @param {string} dateColumn
 * @returns {string}
 */
export function getFinancialMonthSqlExpression(startDay = 1, dateColumn = 'COALESCE(t.effective_date, t.date)') {
  const sDay = Math.min(31, Math.max(1, parseInt(startDay, 10) || 1));
  if (sDay === 1) {
    return `TO_CHAR(${dateColumn}, 'YYYY-MM')`;
  }
  // Mirrors getFinancialMonthBounds: the cycle of a month starts on LEAST(startDay, days-in-month).
  return `(CASE 
    WHEN EXTRACT(DAY FROM ${dateColumn}) >= LEAST(${sDay}, EXTRACT(DAY FROM (DATE_TRUNC('month', ${dateColumn}) + INTERVAL '1 month' - INTERVAL '1 day')))
      THEN TO_CHAR(${dateColumn}, 'YYYY-MM')
    ELSE TO_CHAR(DATE_TRUNC('month', ${dateColumn}) - INTERVAL '1 month', 'YYYY-MM')
  END)`;
}

const HEBREW_MONTHS_SHORT = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];

/**
 * Build the chronological list (oldest first) of the last `count` financial months,
 * ending with the current one.
 */
export function buildFinancialMonthLabels(startDay, count, refDate = new Date()) {
  const current = getCurrentFinancialMonthBounds(startDay, refDate);
  const labels = [];
  let y = current.year;
  let m = current.month;
  for (let i = 0; i < count; i++) {
    const b = getFinancialMonthBounds(y, m, startDay);
    labels.unshift({
      key: b.monthKey,
      label: `${HEBREW_MONTHS_SHORT[b.month - 1]} ${String(b.year).slice(2)}`,
      year: b.year,
      month: b.month,
      startDate: b.startDate,
      endDate: b.endDate,
    });
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return labels;
}

/** 'YYYY-MM-DD' for a local Date (no timezone shifting). */
export function toLocalDateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Whole days between two 'YYYY-MM-DD' strings (b - a), timezone independent. */
export function daysBetween(a, b) {
  const [ay, am, ad] = String(a).slice(0, 10).split('-').map(Number);
  const [by, bm, bd] = String(b).slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}
