import { z } from 'zod';
import { pool } from '../db.js';

export default async function analyticsRoutes(fastify, options) {
  // GET /api/analytics/overview - Overall KPI summaries for current month or selected date range
  fastify.get('/overview', async (request, reply) => {
    const { year, month } = request.query;
    const now = new Date();
    const targetYear = parseInt(year, 10) || now.getFullYear();
    const targetMonth = parseInt(month, 10) || (now.getMonth() + 1);

    const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const endDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    try {
      // Monthly income & expense from non-ignored transactions
      const txQuery = `
        SELECT 
          COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS "totalIncome",
          COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS "totalExpense",
          COUNT(*) AS "transactionCount"
        FROM transactions
        WHERE date >= $1 AND date <= $2 AND is_ignored = false
      `;
      const txRes = await pool.query(txQuery, [startDate, endDate]);
      const income = parseFloat(txRes.rows[0].totalIncome);
      const expense = parseFloat(txRes.rows[0].totalExpense);
      const netSavings = income - expense;
      const savingsRate = income > 0 ? Math.max(0, Math.round((netSavings / income) * 100)) : 0;

      // Net worth strictly from active bank accounts, wallet, and investments (excluding credit cards)
      const accountsRes = await pool.query(`
        SELECT COALESCE(SUM(balance), 0) AS "netWorth"
        FROM bank_accounts
        WHERE is_active = true 
          AND bank_company NOT IN ('max', 'cal', 'isracard', 'amex')
      `);
      const netWorth = parseFloat(accountsRes.rows[0].netWorth);

      return reply.code(200).send({
        period: { year: targetYear, month: targetMonth, startDate, endDate },
        netWorth,
        totalIncome: income,
        totalExpense: expense,
        netSavings,
        savingsRate,
        transactionCount: parseInt(txRes.rows[0].transactionCount, 10),
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch analytics overview');
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });

  // GET /api/analytics/monthly-trend - Income, expense and savings trend across N months
  fastify.get('/monthly-trend', async (request, reply) => {
    const monthsCount = Math.min(parseInt(request.query.months, 10) || 12, 24);
    const { accountId } = request.query;

    const conditions = ['is_ignored = false', `date >= (CURRENT_DATE - INTERVAL '${monthsCount} months')`];
    const values = [];

    if (accountId) {
      values.push(accountId);
      conditions.push(`account_id = $${values.length}`);
    }

    const query = `
      SELECT 
        TO_CHAR(date, 'YYYY-MM') AS "monthKey",
        COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS "income",
        COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS "expenses"
      FROM transactions
      WHERE ${conditions.join(' AND ')}
      GROUP BY TO_CHAR(date, 'YYYY-MM')
      ORDER BY "monthKey" ASC
    `;

    try {
      const result = await pool.query(query, values);
      const trend = result.rows.map((r) => {
        const inc = parseFloat(r.income);
        const exp = parseFloat(r.expenses);
        return {
          month: r.monthKey,
          income: inc,
          expenses: exp,
          savings: inc - exp,
        };
      });
      return reply.code(200).send({ data: trend });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });

  // GET /api/analytics/category-breakdown - Expenses or Income categorized distribution
  fastify.get('/category-breakdown', async (request, reply) => {
    const { year, month, type = 'expense', accountId, accountIds } = request.query;
    const now = new Date();
    const targetYear = parseInt(year, 10) || now.getFullYear();
    const targetMonth = parseInt(month, 10) || (now.getMonth() + 1);

    const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const endDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const conditions = [
      't.date >= $1',
      't.date <= $2',
      't.is_ignored = false',
      type === 'income' ? 't.amount > 0' : 't.amount < 0',
    ];
    const values = [startDate, endDate];

    if (accountIds) {
      const ids = String(accountIds).split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length > 0) {
        values.push(ids);
        conditions.push(`t.account_id = ANY($${values.length}::uuid[])`);
      }
    } else if (accountId) {
      values.push(accountId);
      conditions.push(`t.account_id = $${values.length}`);
    }

    const query = `
      SELECT 
        COALESCE(c.name, t.category, 'אחר') AS "name",
        COALESCE(c.color, '#6366f1') AS "color",
        COALESCE(c.icon, 'tag') AS "icon",
        SUM(ABS(t.amount)) AS "amount",
        COUNT(t.id) AS "count"
      FROM transactions t
      LEFT JOIN categories c ON (t.category = c.name OR t.category = c.name_en)
      WHERE ${conditions.join(' AND ')}
      GROUP BY COALESCE(c.name, t.category, 'אחר'), c.color, c.icon
      ORDER BY "amount" DESC
    `;

    try {
      const result = await pool.query(query, values);
      const total = result.rows.reduce((acc, r) => acc + parseFloat(r.amount), 0);
      const data = result.rows.map((r) => ({
        name: r.name,
        color: r.color,
        icon: r.icon,
        amount: parseFloat(r.amount),
        count: parseInt(r.count, 10),
        percentage: total > 0 ? Math.round((parseFloat(r.amount) / total) * 100) : 0,
      }));
      return reply.code(200).send({ total, data });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });

  // GET /api/analytics/top-merchants - Top merchant spending
  fastify.get('/top-merchants', async (request, reply) => {
    const limit = Math.min(parseInt(request.query.limit, 10) || 10, 50);
    const { year, month } = request.query;

    const conditions = [
      'is_ignored = false',
      'amount < 0',
      "LOWER(COALESCE(merchant_name, '')) NOT LIKE '%משיכת מזומן%'",
      "LOWER(COALESCE(description, '')) NOT LIKE '%משיכת מזומן%'",
      "LOWER(COALESCE(merchant_name, '')) NOT LIKE '%כספומט%'",
      "LOWER(COALESCE(description, '')) NOT LIKE '%כספומט%'",
      "LOWER(COALESCE(merchant_name, '')) NOT LIKE '%atm%'",
    ];
    const values = [];

    if (year && month) {
      const y = parseInt(year, 10);
      const m = parseInt(month, 10);
      const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      values.push(startDate, endDate);
      conditions.push(`date >= $1 AND date <= $2`);
    }

    values.push(limit);
    const limitIdx = values.length;

    const query = `
      SELECT 
        COALESCE(NULLIF(merchant_name, ''), description, 'לא ידוע') AS "merchant",
        SUM(ABS(amount)) AS "totalAmount",
        COUNT(*) AS "txCount",
        MAX(category) AS "category"
      FROM transactions
      WHERE ${conditions.join(' AND ')}
      GROUP BY COALESCE(NULLIF(merchant_name, ''), description, 'לא ידוע')
      ORDER BY "totalAmount" DESC
      LIMIT $${limitIdx}
    `;

    try {
      const result = await pool.query(query, values);
      const data = result.rows.map((r) => ({
        merchant: r.merchant,
        amount: parseFloat(r.totalAmount),
        count: parseInt(r.txCount, 10),
        category: r.category,
      }));
      return reply.code(200).send({ data });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });

  // GET /api/analytics/daily-spending - Daily calendar heatmap array
  fastify.get('/daily-spending', async (request, reply) => {
    const now = new Date();
    const targetYear = parseInt(request.query.year, 10) || now.getFullYear();
    const targetMonth = parseInt(request.query.month, 10) || (now.getMonth() + 1);

    const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const endDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const query = `
      SELECT 
        TO_CHAR(date, 'YYYY-MM-DD') AS "date",
        COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS "expense",
        COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS "income",
        COUNT(*) AS "count"
      FROM transactions
      WHERE date >= $1 AND date <= $2 AND is_ignored = false
      GROUP BY date
      ORDER BY date ASC
    `;

    try {
      const result = await pool.query(query, [startDate, endDate]);
      return reply.code(200).send({
        year: targetYear,
        month: targetMonth,
        daysInMonth: lastDay,
        data: result.rows.map((r) => ({
          date: r.date,
          expense: parseFloat(r.expense),
          income: parseFloat(r.income),
          count: parseInt(r.count, 10),
        })),
      });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });

  // GET /api/analytics/category-averages - Monthly average spending per key category
  fastify.get('/category-averages', async (request, reply) => {
    try {
      // Find distinct months of transaction history
      const monthsRes = await pool.query(`
        SELECT COUNT(DISTINCT TO_CHAR(date, 'YYYY-MM')) AS "monthsCount"
        FROM transactions
        WHERE is_ignored = false AND amount < 0
      `);
      const distinctMonths = Math.max(parseInt(monthsRes.rows[0]?.monthsCount, 10) || 1, 1);

      // Key categories of interest
      const keyCategories = [
        { name: 'סופר ומכולת', mainCat: 'עושים קניות', label: 'סופר ומכולת', icon: 'ShoppingBag', color: '#ec4899' },
        { name: 'דלק וטעינה', mainCat: 'רכב ותחבורה', label: 'דלק ותחבורה', icon: 'Fuel', color: '#f97316' },
        { name: 'מסעדות ופאבים', mainCat: 'אוכלים בחוץ', label: 'אוכל בחוץ', icon: 'Utensils', color: '#f59e0b' },
        { name: 'בגדים והנעלה', mainCat: 'עושים קניות', label: 'בגדים והנעלה', icon: 'Shirt', color: '#ec4899' },
        { name: 'חשמל', mainCat: 'משק בית', label: 'חשמל ומשק בית', icon: 'Home', color: '#6366f1' },
      ];

      // Calculate total spent historically for each
      const query = `
        SELECT 
          category,
          SUM(ABS(amount)) AS "totalAmount",
          COUNT(*) AS "txCount"
        FROM transactions
        WHERE is_ignored = false AND amount < 0
        GROUP BY category
      `;
      const allTxRes = await pool.query(query);
      const catMap = new Map();
      for (const r of allTxRes.rows) {
        catMap.set(r.category, parseFloat(r.totalAmount));
      }

      // Calculate current calendar month spending for comparison
      const curMonthRes = await pool.query(`
        SELECT 
          category,
          SUM(ABS(amount)) AS "curMonthAmount"
        FROM transactions
        WHERE is_ignored = false AND amount < 0 AND date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY category
      `);
      const curMap = new Map();
      for (const r of curMonthRes.rows) {
        curMap.set(r.category, parseFloat(r.curMonthAmount));
      }

      const results = keyCategories.map((kc) => {
        const totalHistorical = (catMap.get(kc.name) || 0) + (catMap.get(kc.mainCat) ? (catMap.get(kc.mainCat) * 0.4) : 0);
        const monthlyAvg = Math.round(totalHistorical / distinctMonths);
        const currentMonth = curMap.get(kc.name) || curMap.get(kc.mainCat) || 0;
        const diffPercent = monthlyAvg > 0 ? Math.round(((currentMonth - monthlyAvg) / monthlyAvg) * 100) : 0;

        return {
          ...kc,
          monthlyAverage: monthlyAvg,
          currentMonth: Math.round(currentMonth),
          diffPercent,
          status: diffPercent > 10 ? 'higher' : diffPercent < -10 ? 'lower' : 'normal',
        };
      });

      return reply.code(200).send({ distinctMonths, data: results });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });

  // GET /api/analytics/top-expenses - Largest single expenses
  fastify.get('/top-expenses', async (request, reply) => {
    const { year, month, limit = 5 } = request.query;
    const now = new Date();
    const targetYear = parseInt(year, 10) || now.getFullYear();
    const targetMonth = parseInt(month, 10) || (now.getMonth() + 1);

    const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const endDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const query = `
      SELECT 
        t.id,
        t.date,
        ABS(t.amount) AS "amount",
        t.currency,
        COALESCE(NULLIF(t.merchant_name, ''), t.description, 'עסקה') AS "merchantName",
        t.description,
        t.category,
        b.display_name AS "accountDisplayName",
        b.bank_company AS "bankCompany"
      FROM transactions t
      JOIN bank_accounts b ON t.account_id = b.id
      WHERE t.is_ignored = false 
        AND t.amount < 0
        AND t.date >= $1 AND t.date <= $2
        AND LOWER(COALESCE(t.merchant_name, '')) NOT LIKE '%משיכת מזומן%'
        AND LOWER(COALESCE(t.description, '')) NOT LIKE '%משיכת מזומן%'
      ORDER BY ABS(t.amount) DESC
      LIMIT $3
    `;

    try {
      const res = await pool.query(query, [startDate, endDate, Math.min(parseInt(limit, 10) || 5, 20)]);
      return reply.code(200).send({
        period: { year: targetYear, month: targetMonth },
        data: res.rows.map(r => ({
          ...r,
          amount: parseFloat(r.amount),
        })),
      });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });
}
