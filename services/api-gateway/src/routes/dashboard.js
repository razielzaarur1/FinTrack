import { pool } from '../db.js';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

const HEBREW_MONTHS = [
  'ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני',
  'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'
];

const CATEGORY_COLORS = {
  'סופרמרקט ומזון': '#10b981',
  'מסעדות ובתי קפה': '#f59e0b',
  'דיור וחשבונות': '#3b82f6',
  'תחבורה ודלק': '#6366f1',
  'בריאות ופארם': '#ec4899',
  'קניות וביגוד': '#8b5cf6',
  'פנאי ותרבות': '#14b8a6',
  'חינוך וחוגים': '#06b6d4',
  'ביטוח ופיננסים': '#64748b',
  'הכנסות ומשכורת': '#22c55e',
  'שונות': '#94a3b8',
};

export default async function dashboardRoutes(fastify, options) {
  // GET /api/dashboard/kpis - Aggregated real metrics from PostgreSQL
  fastify.get('/kpis', async (request, reply) => {
    try {
      // 1. Fetch active accounts balances & last_scraped_at
      const accountsRes = await pool.query(
        `SELECT id, bank_company, display_name, account_number, balance, last_scraped_at, last_scrape_error
         FROM bank_accounts
         WHERE user_id = $1 AND is_active = true`,
        [DEFAULT_USER_ID]
      );

      const accounts = accountsRes.rows;
      let liquidCash = 0;
      let totalCreditDue = 0;
      let investments = 0;
      let latestScrape = null;

      for (const acc of accounts) {
        const bal = parseFloat(acc.balance) || 0;
        const company = (acc.bank_company || '').toLowerCase();

        if (acc.last_scraped_at) {
          const scrapeDate = new Date(acc.last_scraped_at);
          if (!latestScrape || scrapeDate > new Date(latestScrape)) {
            latestScrape = acc.last_scraped_at;
          }
        }

        // Credit cards in Israel: max, cal, isracard, amex
        if (['max', 'cal', 'isracard', 'amex'].includes(company)) {
          totalCreditDue += Math.abs(bal);
        } else if (company.includes('inv') || company.includes('saving')) {
          investments += bal;
        } else {
          liquidCash += bal;
        }
      }

      // Net worth strictly from liquid bank accounts, cash wallet, and investments (excluding credit cards)
      const netWorth = liquidCash + investments;

      // 2. Fetch current month income & expenses
      const monthlyRes = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS monthly_income,
           COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS monthly_expenses
         FROM transactions t
         JOIN bank_accounts a ON t.account_id = a.id
         WHERE a.user_id = $1
           AND a.is_active = true
           AND t.date >= DATE_TRUNC('month', CURRENT_DATE)`
        , [DEFAULT_USER_ID]
      );

      const monthlyIncome = parseFloat(monthlyRes.rows[0].monthly_income) || 0;
      const monthlyExpenses = parseFloat(monthlyRes.rows[0].monthly_expenses) || 0;
      const savingsRate = monthlyIncome > 0
        ? Math.max(0, Math.round(((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100))
        : 0;

      // 3. Category Breakdown for current month (expenses only)
      const catRes = await pool.query(
        `SELECT
           COALESCE(category, 'שונות') AS name,
           SUM(ABS(amount)) AS amount
         FROM transactions t
         JOIN bank_accounts a ON t.account_id = a.id
         WHERE a.user_id = $1
           AND a.is_active = true
           AND t.amount < 0
           AND t.date >= DATE_TRUNC('month', CURRENT_DATE)
         GROUP BY COALESCE(category, 'שונות')
         ORDER BY amount DESC`,
        [DEFAULT_USER_ID]
      );

      const categoryBreakdown = catRes.rows.map((row) => ({
        name: row.name,
        amount: parseFloat(row.amount) || 0,
        color: CATEGORY_COLORS[row.name] || '#06b6d4',
      }));

      // 4. Monthly Trend (Past 6 Months)
      const trendRes = await pool.query(
        `SELECT
           TO_CHAR(DATE_TRUNC('month', t.date), 'YYYY-MM') AS month_key,
           EXTRACT(MONTH FROM t.date)::INT AS month_num,
           COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0) AS income,
           COALESCE(SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END), 0) AS expenses
         FROM transactions t
         JOIN bank_accounts a ON t.account_id = a.id
         WHERE a.user_id = $1
           AND a.is_active = true
           AND t.date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '5 months')
         GROUP BY DATE_TRUNC('month', t.date), EXTRACT(MONTH FROM t.date)
         ORDER BY DATE_TRUNC('month', t.date) ASC`,
        [DEFAULT_USER_ID]
      );

      let monthlyTrend = trendRes.rows.map((row) => {
        const inc = parseFloat(row.income) || 0;
        const exp = parseFloat(row.expenses) || 0;
        const mIndex = (row.month_num - 1) % 12;
        return {
          month: HEBREW_MONTHS[mIndex] || row.month_key,
          income: inc,
          expenses: exp,
          savings: Math.max(0, inc - exp),
        };
      });

      // If no past transactions yet, supply current month entry with 0s
      if (monthlyTrend.length === 0) {
        const currentMonthIdx = new Date().getMonth();
        monthlyTrend = [{
          month: HEBREW_MONTHS[currentMonthIdx],
          income: monthlyIncome,
          expenses: monthlyExpenses,
          savings: Math.max(0, monthlyIncome - monthlyExpenses),
        }];
      }

      // 5. Recent 5 Transactions
      const recentTxRes = await pool.query(
        `SELECT
           t.id,
           t.account_id AS "accountId",
           t.date,
           t.amount,
           t.currency,
           t.description,
           t.merchant_name AS "merchantName",
           COALESCE(t.category, 'שונות') AS category,
           t.status,
           t.is_notified AS "isNotified"
         FROM transactions t
         JOIN bank_accounts a ON t.account_id = a.id
         WHERE a.user_id = $1 AND a.is_active = true
         ORDER BY t.date DESC, t.id DESC
         LIMIT 5`,
        [DEFAULT_USER_ID]
      );

      return reply.code(200).send({
        netWorth,
        liquidCash,
        investments,
        totalCreditDue,
        monthlyIncome,
        monthlyExpenses,
        savingsRate,
        lastScrapedAt: latestScrape,
        monthlyTrend,
        categoryBreakdown,
        recentTransactions: recentTxRes.rows,
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch dashboard KPIs');
      return reply.code(500).send({ error: 'Internal Server Error', message: err.message });
    }
  });
}
