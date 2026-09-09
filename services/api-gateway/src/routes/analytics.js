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
      // Monthly income & expense from non-ignored transactions (accurately differentiating refunds from income)
      const txQuery = `
        SELECT 
          COALESCE(SUM(CASE 
            WHEN (c.type = 'income' OR (c.type IS NULL AND t.category IN ('משכורת', 'הכנסה', 'קצבה או מלגה', 'הכנסה מנכס', 'הכנסה מעסק', 'דיווידנדים ורווחים', 'הכנסות שונות', 'הכנסות'))) AND t.amount > 0 
            THEN t.amount 
            ELSE 0 
          END), 0) AS "totalIncome",
          COALESCE(SUM(CASE 
            WHEN c.type = 'income' THEN 0
            WHEN t.amount < 0 THEN ABS(t.amount)
            WHEN t.amount > 0 AND (c.type = 'expense' OR t.category NOT IN ('משכורת', 'הכנסה', 'קצבה או מלגה', 'הכנסה מנכס', 'הכנסה מעסק', 'דיווידנדים ורווחים', 'הכנסות שונות', 'הכנסות'))
            THEN -t.amount
            ELSE 0 
          END), 0) AS "totalExpense",
          COUNT(*) AS "transactionCount"
        FROM transactions t
        LEFT JOIN categories c ON (t.category = c.name OR t.category = c.name_en)
        WHERE t.date >= $1 AND t.date <= $2 AND t.is_ignored = false
      `;
      const txRes = await pool.query(txQuery, [startDate, endDate]);
      const income = parseFloat(txRes.rows[0].totalIncome);
      const expense = Math.max(0, parseFloat(txRes.rows[0].totalExpense));
      const netSavings = income - expense;
      const savingsRate = income > 0 ? Math.max(0, Math.round((netSavings / income) * 100)) : 0;

      // Net worth strictly from active bank accounts, wallet, and investments (excluding credit cards)
      const accountsRes = await pool.query(`
        SELECT COALESCE(SUM(balance), 0) AS "netWorth"
        FROM bank_accounts
        WHERE is_active = true 
          AND bank_company NOT IN ('max', 'cal', 'visaCal', 'isracard', 'amex')
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

    const conditions = ['t.is_ignored = false', `t.date >= (CURRENT_DATE - INTERVAL '${monthsCount} months')`];
    const values = [];

    if (accountId) {
      values.push(accountId);
      conditions.push(`t.account_id = $${values.length}`);
    }

    const query = `
      SELECT 
        TO_CHAR(t.date, 'YYYY-MM') AS "monthKey",
        COALESCE(SUM(CASE 
          WHEN (c.type = 'income' OR (c.type IS NULL AND t.category IN ('משכורת', 'הכנסה', 'קצבה או מלגה', 'הכנסה מנכס', 'הכנסה מעסק', 'דיווידנדים ורווחים', 'הכנסות שונות', 'הכנסות'))) AND t.amount > 0 
          THEN t.amount 
          ELSE 0 
        END), 0) AS "income",
        COALESCE(SUM(CASE 
          WHEN c.type = 'income' THEN 0
          WHEN t.amount < 0 THEN ABS(t.amount)
          WHEN t.amount > 0 AND (c.type = 'expense' OR t.category NOT IN ('משכורת', 'הכנסה', 'קצבה או מלגה', 'הכנסה מנכס', 'הכנסה מעסק', 'דיווידנדים ורווחים', 'הכנסות שונות', 'הכנסות'))
          THEN -t.amount
          ELSE 0 
        END), 0) AS "expenses"
      FROM transactions t
      LEFT JOIN categories c ON (t.category = c.name OR t.category = c.name_en)
      WHERE ${conditions.join(' AND ')}
      GROUP BY TO_CHAR(t.date, 'YYYY-MM')
      ORDER BY "monthKey" ASC
    `;

    try {
      const result = await pool.query(query, values);
      const trend = result.rows.map((r) => {
        const inc = parseFloat(r.income);
        const exp = Math.max(0, parseFloat(r.expenses));
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

  // GET /api/analytics/category-averages - Monthly average spending per specific relevant category
  fastify.get('/category-averages', async (request, reply) => {
    try {
      // Find distinct months of transaction history (up to last 12 months)
      const monthsRes = await pool.query(`
        SELECT COUNT(DISTINCT TO_CHAR(date, 'YYYY-MM')) AS "monthsCount"
        FROM transactions
        WHERE is_ignored = false AND amount < 0 AND date >= (CURRENT_DATE - INTERVAL '12 months')
      `);
      const distinctMonths = Math.max(parseInt(monthsRes.rows[0]?.monthsCount, 10) || 1, 1);

      // Define focused, highly relevant everyday spending categories
      const FOCUSED_CATEGORIES = [
        {
          key: 'groceries',
          name: 'סופר ומכולת',
          icon: 'ShoppingBag',
          color: '#ec4899',
          matchTerms: ['סופר ומכולת', 'סופר', 'מכולת', 'סופרמרקט', 'שופרסל', 'רמי לוי', 'יוחננוף', 'אושר עד', 'ויקטורי', 'מחסני השוק', 'ירקות ופירות', 'ירקות', 'פירות', 'מינימרקט', 'טיב טעם'],
        },
        {
          key: 'fuel',
          name: 'דלק וטעינה',
          icon: 'Fuel',
          color: '#f97316',
          matchTerms: ['דלק וטעינה', 'דלק', 'תחנת דלק', 'פז', 'סונול', 'דלק ישראל', 'דור אלון', 'טן', 'טעינה', 'ev', 'טסלה', 'מנטה', 'סונול'],
        },
        {
          key: 'dining',
          name: 'אוכלים בחוץ ומסעדות',
          icon: 'Utensils',
          color: '#f59e0b',
          matchTerms: ['אוכלים בחוץ', 'מסעדות ופאבים', 'מסעדות', 'מזון מהיר ומשלוחים', 'בתי קפה', 'וולט', 'תן ביס', 'wolt', '10bis', 'קפה', 'פיצה', 'המבורגר', 'שווארמה', 'ארומה'],
        },
        {
          key: 'shopping',
          name: 'בגדים והנעלה',
          icon: 'Shirt',
          color: '#a855f7',
          matchTerms: ['בגדים והנעלה', 'עושים קניות', 'אלקטרוניקה', 'זארה', 'zara', 'h&m', 'הנעלה', 'ביגוד', 'אופנה', 'שופינג', 'קסטרו', 'רנואר', 'פוקס', 'טרמינל איקס', 'terminal x', 'shein', 'asos'],
        },
        {
          key: 'pharmacy',
          name: 'בתי מרקחת ופארם',
          icon: 'HeartPulse',
          color: '#ef4444',
          matchTerms: ['בתי מרקחת', 'פארם', 'סופר פארם', 'super-pharm', 'be', 'ניו פארם', 'בית מרקחת', 'תרופות'],
        },
        {
          key: 'bills',
          name: 'משק בית וחשבונות',
          icon: 'Home',
          color: '#6366f1',
          matchTerms: ['משק בית', 'חשמל', 'חברת החשמל', 'מים', 'מי אביבים', 'תאגיד מים', 'ארנונה', 'עיריית', 'גז', 'בזק', 'הוט', 'סלקום', 'פרטנר', 'טלפון ואינטרנט', 'hot', 'bezeq', 'partner', 'cellcom'],
        },
        {
          key: 'leisure',
          name: 'פנאי ותרבות',
          icon: 'Gamepad2',
          color: '#06b6d4',
          matchTerms: ['פנאי ותרבות', 'הופעות וקולנוע', 'סינמה סיטי', 'יס פלאנט', 'הוט סינמה', 'כרטיסים', 'בילויים', 'הצגות', 'אטרקציות', 'פנאי ובילויים', 'קולנוע'],
        },
      ];

      // Query historical transactions in the last 12 months (non-ignored expenses)
      const historicalRes = await pool.query(`
        SELECT 
          t.amount,
          COALESCE(t.category, '') AS "category",
          COALESCE(t.merchant_name, '') AS "merchantName",
          COALESCE(t.description, '') AS "description"
        FROM transactions t
        WHERE t.is_ignored = false 
          AND t.amount < 0 
          AND t.date >= (CURRENT_DATE - INTERVAL '12 months')
      `);

      // Query current month transactions (non-ignored expenses)
      const currentMonthRes = await pool.query(`
        SELECT 
          t.amount,
          COALESCE(t.category, '') AS "category",
          COALESCE(t.merchant_name, '') AS "merchantName",
          COALESCE(t.description, '') AS "description"
        FROM transactions t
        WHERE t.is_ignored = false 
          AND t.amount < 0 
          AND t.date >= DATE_TRUNC('month', CURRENT_DATE)
      `);

      const results = FOCUSED_CATEGORIES.map((catDef) => {
        const matchesItem = (row) => {
          const text = `${row.category} ${row.merchantName} ${row.description}`.toLowerCase();
          return catDef.matchTerms.some((term) => text.includes(term.toLowerCase()));
        };

        // Calculate historical total
        let totalHistorical = 0;
        let txCount = 0;
        for (const row of historicalRes.rows) {
          if (matchesItem(row)) {
            totalHistorical += Math.abs(parseFloat(row.amount) || 0);
            txCount++;
          }
        }

        // Calculate current month total
        let currentMonth = 0;
        for (const row of currentMonthRes.rows) {
          if (matchesItem(row)) {
            currentMonth += Math.abs(parseFloat(row.amount) || 0);
          }
        }

        const monthlyAvg = Math.round((totalHistorical / distinctMonths) * 100) / 100;
        const currentRounded = Math.round(currentMonth * 100) / 100;
        const diffPercent = monthlyAvg > 0 ? Math.round(((currentRounded - monthlyAvg) / monthlyAvg) * 100) : 0;

        return {
          category: catDef.name,
          name: catDef.name,
          title: catDef.name,
          label: catDef.name,
          icon: catDef.icon,
          color: catDef.color,
          monthlyAverage: monthlyAvg,
          amount: monthlyAvg,
          currentMonth: currentRounded,
          diffPercent,
          status: diffPercent > 10 ? 'higher' : diffPercent < -10 ? 'lower' : 'normal',
          totalHistorical: Math.round(totalHistorical * 100) / 100,
          txCount,
        };
      });

      // Filter to categories that either have historical spending or current month spending,
      // and sort by monthly average descending
      const activeAverages = results
        .filter((r) => r.monthlyAverage > 0 || r.currentMonth > 0)
        .sort((a, b) => b.monthlyAverage - a.monthlyAverage);

      return reply.code(200).send({
        distinctMonths,
        data: activeAverages.length > 0 ? activeAverages : results.slice(0, 5),
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to compute category averages');
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
