import { pool } from '../db.js';
import { cleanSpacedHebrew } from './transactions.js';
import {
  getSystemMonthStartDay,
  getCurrentFinancialMonthBounds,
  buildFinancialMonthLabels,
} from '../services/settings-helper.js';
import {
  CREDIT_CARD_COMPANIES,
  computeSavingsRate,
  fetchCategoryTotals,
  fetchMonthlyTotals,
  fetchPeriodTotals,
  round2,
} from '../services/analytics-sql.js';

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

        // Credit cards in Israel: max, cal / visaCal, isracard, amex
        if (CREDIT_CARD_COMPANIES.includes(company)) {
          totalCreditDue += Math.abs(bal);
        } else if (company.includes('inv') || company.includes('saving')) {
          investments += bal;
        } else {
          liquidCash += bal;
        }
      }

      // Net worth strictly from liquid bank accounts, cash wallet, and investments (excluding credit cards)
      const netWorth = liquidCash + investments;

      // Determine financial cycle startDay from query or system_settings
      const queryStartDay = request.query?.startDay || request.query?.monthStartDay;
      const startDay = queryStartDay
        ? Math.min(31, Math.max(1, parseInt(queryStartDay, 10) || 10))
        : await getSystemMonthStartDay(pool, DEFAULT_USER_ID);

      const cycleBounds = getCurrentFinancialMonthBounds(startDay);
      const { startDate, endDate, monthKey } = cycleBounds;

      // 2. Current financial month income & expenses (same engine as the analytics screens)
      const totals = await fetchPeriodTotals(pool, { startDate, endDate });
      const monthlyIncome = totals.income;
      const monthlyExpenses = Math.max(0, totals.expense);
      const savingsRate = computeSavingsRate(monthlyIncome, monthlyExpenses);

      // 3. Category breakdown for the current financial month (net expenses, splits & refunds aware)
      const catRows = await fetchCategoryTotals(pool, { startDate, endDate, type: 'expense' });
      const categoryMap = new Map();
      for (const row of catRows) {
        const name = cleanSpacedHebrew(row.name).trim() || 'שונות';
        const existing = categoryMap.get(name);
        if (existing) {
          existing.amount += row.amount;
        } else {
          categoryMap.set(name, {
            name,
            amount: row.amount,
            color: row.color || CATEGORY_COLORS[name] || '#06b6d4',
          });
        }
      }
      const categoryBreakdown = Array.from(categoryMap.values())
        .map((c) => ({ ...c, amount: round2(c.amount) }))
        .sort((a, b) => b.amount - a.amount);

      // 4. Monthly Trend (past 6 financial months)
      const labels = buildFinancialMonthLabels(startDay, 6);
      const trendTotals = await fetchMonthlyTotals(pool, { labels, startDay });
      let firstIdx = labels.findIndex((l) => trendTotals.has(l.key));
      if (firstIdx < 0) firstIdx = labels.length - 1;
      const monthlyTrend = labels.slice(firstIdx).map((l) => {
        const t = trendTotals.get(l.key) || { income: 0, expenses: 0 };
        return {
          month: HEBREW_MONTHS[l.month - 1] || l.key,
          monthKey: l.key,
          income: round2(t.income),
          expenses: round2(t.expenses),
          savings: round2(t.income - t.expenses),
        };
      });

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
        financialCycle: {
          startDay,
          startDate,
          endDate,
          monthKey,
        },
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch dashboard KPIs');
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });
}
