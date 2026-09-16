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

  let nextYear = y;
  let nextMonth = m + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  const endDayClamped = Math.min(sDay - 1, getDaysInMonth(nextYear, nextMonth));
  const endDate = `${nextYear}-${pad2(nextMonth)}-${pad2(endDayClamped)}`;

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

  if (sDay > 1 && curDay < sDay) {
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
export function getFinancialMonthSqlExpression(startDay = 1, dateColumn = 't.date') {
  const sDay = Math.min(31, Math.max(1, parseInt(startDay, 10) || 1));
  if (sDay === 1) {
    return `TO_CHAR(${dateColumn}, 'YYYY-MM')`;
  }
  return `(CASE 
    WHEN EXTRACT(DAY FROM ${dateColumn}) >= ${sDay} THEN TO_CHAR(${dateColumn}, 'YYYY-MM')
    ELSE TO_CHAR(${dateColumn} - INTERVAL '1 month', 'YYYY-MM')
  END)`;
}
