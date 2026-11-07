/**
 * Shared SQL building blocks + aggregate queries for every income / expense / category statistic.
 *
 * Every screen (dashboard, analytics overview, category breakdown, trends, averages, deep stats)
 * MUST go through these helpers so that the same transaction is always counted the same way:
 *   - amortized transactions are spread over their months (by effective_date || date)
 *   - split transactions are counted per split category
 *   - credit-card billing rows / inter-account transfers / ignored rows are never counted
 *   - accounts that are excluded from expenses (or fully-ignored prepaid cards) are never counted
 *   - refunds (positive amounts in an expense category) reduce the expense instead of adding to it
 *   - each transaction joins at most ONE category row (no duplicated rows -> no double counting)
 */
import { getFinancialMonthSqlExpression } from './settings-helper.js';

export const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

export const INCOME_CATEGORY_NAMES = [
  'משכורת', 'הכנסה', 'קצבה או מלגה', 'הכנסה מנכס', 'הכנסה מעסק',
  'דיווידנדים ורווחים', 'הכנסות שונות', 'הכנסות', 'Salary', 'Income',
];

export const EXCLUDED_CATEGORY_NAMES = ['חיוב אשראי', 'העברה בין חשבונות'];

export const CREDIT_CARD_COMPANIES = ['max', 'cal', 'visacal', 'isracard', 'amex'];

const sqlLiteral = (v) => `'${String(v).replace(/'/g, "''")}'`;
const sqlList = (arr) => arr.map(sqlLiteral).join(', ');

export const INCOME_NAMES_SQL = sqlList(INCOME_CATEGORY_NAMES);
export const CREDIT_CARDS_SQL = sqlList(CREDIT_CARD_COMPANIES);

/** NULL-safe "category is not a credit-card billing / transfer category". */
export function excludedCategoryCondition(col) {
  return EXCLUDED_CATEGORY_NAMES
    .map((n) => `COALESCE(${col}, '') NOT ILIKE ${sqlLiteral(`%${n}%`)}`)
    .join(' AND ');
}

/** Account level filters shared by all spending statistics. */
export const ACCOUNT_FILTER_SQL = `(a.include_in_expenses IS NOT FALSE)
  AND (a.is_prepaid IS NOT TRUE OR a.prepaid_mode IS DISTINCT FROM 'ignore_all')`;

/**
 * LEFT JOIN that resolves AT MOST ONE category row for a category name (exact name wins over
 * English name) so joins can never duplicate transaction rows.
 */
export function categoryJoinSql(catExpr, alias = 'c') {
  return `LEFT JOIN LATERAL (
    SELECT cc.name, cc.type, cc.color, cc.icon
    FROM categories cc
    WHERE cc.user_id = '${DEFAULT_USER_ID}'
      AND (cc.name = ${catExpr} OR cc.name_en = ${catExpr})
    ORDER BY (cc.name = ${catExpr}) DESC, cc.sort_order ASC, cc.name ASC
    LIMIT 1
  ) ${alias} ON true`;
}

function incomeCondSql(c, cat) {
  return `(${c}.type IN ('income', 'both') OR (${c}.type IS NULL AND ${cat} IN (${INCOME_NAMES_SQL})))`;
}

/** Income contribution of one row: positive amounts in income categories only. */
export function incomeAmountSql(amt, c, cat) {
  return `(CASE WHEN ${amt} > 0 AND ${incomeCondSql(c, cat)} THEN ${amt} ELSE 0 END)`;
}

/**
 * Net expense contribution of one row (positive number = money spent).
 * A refund (positive amount in a non-income category) yields a NEGATIVE number so it
 * reduces the expense total it belongs to.
 */
export function netExpenseSql(amt, c, cat) {
  return `(CASE
    WHEN ${c}.type = 'income' THEN 0
    WHEN ${amt} < 0 THEN -(${amt})
    WHEN ${amt} > 0 AND NOT ${incomeCondSql(c, cat)} THEN -(${amt})
    ELSE 0
  END)`;
}

/**
 * CTE fragment (no leading WITH) producing:
 *   expanded : one row per transaction per amortization month (ref_date)
 *   items    : expanded rows, split transactions replaced by their split rows
 * Pass `endParam` (e.g. '$2') to prune transactions that start after the period end and
 * `extraWhere` for additional transaction-level conditions.
 */
export function itemsCtes({ endParam = null, extraWhere = '' } = {}) {
  return `
    expanded AS (
      SELECT
        t.id,
        t.account_id,
        t.category,
        t.is_split,
        t.merchant_name,
        t.description,
        t.user_description,
        GREATEST(COALESCE(t.amortization_months, 1), 1) AS months_n,
        (t.amount / GREATEST(COALESCE(t.amortization_months, 1), 1)) AS effective_amount,
        (COALESCE(t.effective_date, t.date) + (s.month_offset || ' month')::interval)::date AS ref_date
      FROM transactions t
      CROSS JOIN LATERAL generate_series(0, GREATEST(COALESCE(t.amortization_months, 1) - 1, 0)) AS s(month_offset)
      WHERE t.is_ignored = false
        AND t.is_cc_billing IS NOT TRUE
        ${endParam ? `AND COALESCE(t.effective_date, t.date) <= ${endParam}::date` : ''}
        ${extraWhere}
    ),
    items AS (
      SELECT e.id, e.account_id, e.ref_date, e.category, e.merchant_name, e.description,
             e.user_description, e.effective_amount AS amount
      FROM expanded e
      WHERE e.is_split IS NOT TRUE
         OR NOT EXISTS (SELECT 1 FROM transaction_splits ts0 WHERE ts0.transaction_id = e.id)

      UNION ALL

      SELECT e.id, e.account_id, e.ref_date, ts.category, e.merchant_name, e.description,
             COALESCE(ts.description, e.user_description) AS user_description,
             (ts.amount / e.months_n) AS amount
      FROM expanded e
      JOIN transaction_splits ts ON ts.transaction_id = e.id
      WHERE e.is_split = true
    )`;
}

const toAccountArray = (accountIds) => {
  if (!accountIds) return null;
  const list = (Array.isArray(accountIds) ? accountIds : String(accountIds).split(','))
    .map((s) => String(s).trim())
    .filter((s) => /^[0-9a-fA-F-]{36}$/.test(s));
  return list.length > 0 ? list : null;
};

export { toAccountArray };

/** Income / expense totals for [startDate, endDate]. */
export async function fetchPeriodTotals(db, { startDate, endDate, accountIds = null }) {
  const values = [startDate, endDate];
  const accounts = toAccountArray(accountIds);
  let accountClause = '';
  if (accounts) {
    values.push(accounts);
    accountClause = `AND i.account_id = ANY($3::uuid[])`;
  }
  const res = await db.query(
    `WITH ${itemsCtes({ endParam: '$2' })}
     SELECT
       COALESCE(SUM(${incomeAmountSql('i.amount', 'c', 'i.category')}), 0) AS income,
       COALESCE(SUM(${netExpenseSql('i.amount', 'c', 'i.category')}), 0) AS expense,
       COUNT(DISTINCT i.id) AS tx_count
     FROM items i
     JOIN bank_accounts a ON i.account_id = a.id
     ${categoryJoinSql('i.category')}
     WHERE ${ACCOUNT_FILTER_SQL}
       AND ${excludedCategoryCondition('i.category')}
       AND i.ref_date >= $1::date AND i.ref_date <= $2::date
       ${accountClause}`,
    values
  );
  const row = res.rows[0] || {};
  return {
    income: parseFloat(row.income) || 0,
    // net expense; may only be negative when refunds exceed spending - callers clamp for display
    expense: parseFloat(row.expense) || 0,
    txCount: parseInt(row.tx_count, 10) || 0,
  };
}

/** Per-category totals (expense = net spend, income = income) for [startDate, endDate]. */
export async function fetchCategoryTotals(db, { startDate, endDate, type = 'expense', accountIds = null }) {
  const values = [startDate, endDate];
  const accounts = toAccountArray(accountIds);
  let accountClause = '';
  if (accounts) {
    values.push(accounts);
    accountClause = `AND i.account_id = ANY($3::uuid[])`;
  }
  const amountExpr = type === 'income'
    ? incomeAmountSql('i.amount', 'c', 'i.category')
    : netExpenseSql('i.amount', 'c', 'i.category');

  const res = await db.query(
    `WITH ${itemsCtes({ endParam: '$2' })}
     SELECT
       COALESCE(NULLIF(c.name, ''), NULLIF(i.category, ''), 'שונות') AS name,
       MAX(c.color) AS color,
       MAX(c.icon) AS icon,
       SUM(${amountExpr}) AS amount,
       COUNT(DISTINCT i.id) AS count
     FROM items i
     JOIN bank_accounts a ON i.account_id = a.id
     ${categoryJoinSql('i.category')}
     WHERE ${ACCOUNT_FILTER_SQL}
       AND ${excludedCategoryCondition('i.category')}
       AND i.ref_date >= $1::date AND i.ref_date <= $2::date
       ${accountClause}
     GROUP BY COALESCE(NULLIF(c.name, ''), NULLIF(i.category, ''), 'שונות')
     HAVING SUM(${amountExpr}) > 0
     ORDER BY amount DESC`,
    values
  );
  return res.rows.map((r) => ({
    name: r.name,
    color: r.color || null,
    icon: r.icon || null,
    amount: parseFloat(r.amount) || 0,
    count: parseInt(r.count, 10) || 0,
  }));
}

/**
 * Income / expense per financial month for the given month labels
 * (see buildFinancialMonthLabels). Returns Map(monthKey -> { income, expenses, txCount }).
 */
export async function fetchMonthlyTotals(db, { labels, startDay, accountId = null }) {
  const map = new Map();
  if (!labels || labels.length === 0) return map;

  const values = [labels[0].startDate, labels[labels.length - 1].endDate];
  let accountClause = '';
  const accounts = toAccountArray(accountId);
  if (accounts) {
    values.push(accounts);
    accountClause = `AND i.account_id = ANY($3::uuid[])`;
  }
  const monthSql = getFinancialMonthSqlExpression(startDay, 'i.ref_date');

  const res = await db.query(
    `WITH ${itemsCtes({ endParam: '$2' })}
     SELECT
       ${monthSql} AS month_key,
       COALESCE(SUM(${incomeAmountSql('i.amount', 'c', 'i.category')}), 0) AS income,
       COALESCE(SUM(${netExpenseSql('i.amount', 'c', 'i.category')}), 0) AS expenses,
       COUNT(DISTINCT i.id) AS tx_count
     FROM items i
     JOIN bank_accounts a ON i.account_id = a.id
     ${categoryJoinSql('i.category')}
     WHERE ${ACCOUNT_FILTER_SQL}
       AND ${excludedCategoryCondition('i.category')}
       AND i.ref_date >= $1::date AND i.ref_date <= $2::date
       ${accountClause}
     GROUP BY ${monthSql}`,
    values
  );
  for (const r of res.rows) {
    map.set(r.month_key, {
      income: parseFloat(r.income) || 0,
      expenses: Math.max(0, parseFloat(r.expenses) || 0),
      txCount: parseInt(r.tx_count, 10) || 0,
    });
  }
  return map;
}

/** Savings rate in whole percent; negative when spending exceeds income. */
export function computeSavingsRate(income, expense) {
  if (income > 0) return Math.round(((income - expense) / income) * 100);
  return expense > 0 ? -100 : 0;
}

/** Round to cents. */
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Whole-number percentages that always add up to exactly 100 (largest remainder method).
 */
export function allocatePercentages(amounts) {
  const total = amounts.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return amounts.map(() => 0);
  const raw = amounts.map((a) => (a / total) * 100);
  const floors = raw.map(Math.floor);
  let remaining = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, idx) => ({ idx, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; remaining > 0 && k < order.length; k++, remaining--) {
    floors[order[k].idx] += 1;
  }
  return floors;
}

export { termMatches } from './keyword-match.js';
