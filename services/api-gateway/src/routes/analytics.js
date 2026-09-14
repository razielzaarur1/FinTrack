import { z } from 'zod';
import { pool } from '../db.js';
import { cleanSpacedHebrew } from './transactions-v2.js';

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

  // GET /api/analytics/category-breakdown - Expenses or Income categorized distribution with split transaction support
  fastify.get('/category-breakdown', async (request, reply) => {
    const { year, month, startDate: queryStartDate, endDate: queryEndDate, type = 'expense', accountId, accountIds } = request.query;
    let startDate = queryStartDate;
    let endDate = queryEndDate;

    if (!startDate || !endDate) {
      const now = new Date();
      const targetYear = parseInt(year, 10) || now.getFullYear();
      const targetMonth = parseInt(month, 10) || (now.getMonth() + 1);
      startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
      const lastDay = new Date(targetYear, targetMonth, 0).getDate();
      endDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }

    const conditions = [
      't.date >= $1',
      't.date <= $2',
      't.is_ignored = false',
      type === 'income' 
        ? 't.amount > 0' 
        : '(t.amount < 0 OR (t.amount > 0 AND COALESCE(t.category, \'\') NOT IN (\'משכורת\', \'הכנסה\', \'קצבה או מלגה\', \'הכנסה מנכס\', \'הכנסה מעסק\', \'דיווידנדים ורווחים\', \'הכנסות שונות\', \'הכנסות\', \'Salary\', \'Income\')))',
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

    const whereClause = conditions.join(' AND ');

    const query = `
      WITH itemized AS (
        -- 1. Standard non-split transactions
        SELECT 
          t.id,
          t.category,
          ABS(t.amount) AS amount
        FROM transactions t
        WHERE ${whereClause} AND (t.is_split = false OR t.is_split IS NULL)

        UNION ALL

        -- 2. Split transaction itemized rows
        SELECT 
          t.id,
          ts.category,
          ABS(ts.amount) AS amount
        FROM transaction_splits ts
        JOIN transactions t ON ts.transaction_id = t.id
        WHERE ${whereClause} AND t.is_split = true
      )
      SELECT 
        COALESCE(c.name, i.category, 'שונות') AS "name",
        COALESCE(c.color, '#6366f1') AS "color",
        COALESCE(c.icon, 'tag') AS "icon",
        SUM(i.amount) AS "amount",
        COUNT(i.id) AS "count"
      FROM itemized i
      LEFT JOIN categories c ON (i.category = c.name OR i.category = c.name_en)
      WHERE ${type === 'expense' ? "COALESCE(c.type, 'expense') != 'income' AND i.category NOT IN ('משכורת', 'הכנסה', 'קצבה או מלגה', 'הכנסה מנכס', 'הכנסה מעסק', 'דיווידנדים ורווחים', 'הכנסות שונות', 'הכנסות', 'Salary', 'Income')" : "1=1"}
      GROUP BY COALESCE(c.name, i.category, 'שונות'), c.color, c.icon
      ORDER BY "amount" DESC
    `;

    try {
      const result = await pool.query(query, values);
      const categoryMap = new Map();

      for (const r of result.rows) {
        let cleanName = cleanSpacedHebrew(r.name).trim();
        if (!cleanName || cleanName === 'אחר') cleanName = 'שונות';
        if (type === 'expense' && (cleanName === 'משכורת' || cleanName === 'הכנסה' || cleanName === 'הכנסות שונות')) continue;
        if (type === 'income' && cleanName === 'הוצאות שונות') continue;

        const amt = parseFloat(r.amount) || 0;
        const cnt = parseInt(r.count, 10) || 0;
        if (categoryMap.has(cleanName)) {
          const existing = categoryMap.get(cleanName);
          existing.amount += amt;
          existing.count += cnt;
        } else {
          categoryMap.set(cleanName, {
            name: cleanName,
            color: r.color,
            icon: r.icon,
            amount: amt,
            count: cnt,
          });
        }
      }

      const total = Array.from(categoryMap.values()).reduce((acc, r) => acc + r.amount, 0);
      const data = Array.from(categoryMap.values())
        .map((r) => ({
          ...r,
          amount: Math.round(r.amount * 100) / 100,
          percentage: total > 0 ? Math.round((r.amount / total) * 100) : 0,
        }))
        .sort((a, b) => b.amount - a.amount);

      return reply.code(200).send({ total: Math.round(total * 100) / 100, data });
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch category breakdown');
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

  // GET /api/analytics/category-averages - Monthly average spending per specific relevant category (strictly 12 months)
  fastify.get('/category-averages', async (request, reply) => {
    try {
      // Build exactly 12 month keys from 11 months ago to current month
      const monthLabels = [];
      const heMonths = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const key = `${yyyy}-${mm}`;
        monthLabels.push({
          key,
          label: `${heMonths[d.getMonth()]} ${String(yyyy).slice(2)}`,
          year: yyyy,
          month: d.getMonth() + 1,
        });
      }

      // Define focused, highly relevant everyday spending categories
      const FOCUSED_CATEGORIES = [
        {
          key: 'dining',
          name: 'אוכל בחוץ',
          icon: 'Utensils',
          color: '#f59e0b',
          matchTerms: ['אוכל בחוץ', 'אוכלים בחוץ', 'מסעדות ופאבים', 'מסעדות', 'מסעדה', 'מזון מהיר ומשלוחים', 'בתי קפה', 'בית קפה', 'וולט', 'תן ביס', 'wolt', '10bis', 'קפה', 'פיצה', 'המבורגר', 'שווארמה', 'ארומה', 'מקדונלדס', 'גולדה', 'גלידה', 'מאפיה', 'מאפייה', 'דומינוס', 'baker', 'coffee', 'cafe'],
        },
        {
          key: 'groceries',
          name: 'סופר ומכולת',
          icon: 'ShoppingBag',
          color: '#ec4899',
          matchTerms: ['סופר ומכולת', 'סופר', 'מכולת', 'סופרמרקט', 'שופרסל', 'רמי לוי', 'יוחננוף', 'אושר עד', 'ויקטורי', 'מחסני השוק', 'ירקות ופירות', 'ירקות', 'פירות', 'מינימרקט', 'טיב טעם', 'קרפור', 'carrefour', 'חצי חינם', 'מעדניה', 'קצביה', 'בשר'],
        },
        {
          key: 'fuel',
          name: 'דלק ותחבורה',
          icon: 'Fuel',
          color: '#f97316',
          matchTerms: ['דלק וטעינה', 'דלק', 'תחנת דלק', 'פז', 'סונול', 'דלק ישראל', 'דור אלון', 'טן', 'טעינה', 'ev', 'טסלה', 'מנטה', 'רכב ותחבורה', 'חניה', 'פנגו', 'סלו', 'pango', 'cellopark', 'רב קו', 'רכבת', 'מוניות', 'יאנגו', 'yango', 'gett'],
        },
        {
          key: 'shopping',
          name: 'קניות וביגוד',
          icon: 'Shirt',
          color: '#a855f7',
          matchTerms: ['בגדים והנעלה', 'עושים קניות', 'אלקטרוניקה', 'זארה', 'zara', 'h&m', 'הנעלה', 'ביגוד', 'אופנה', 'שופינג', 'קסטרו', 'רנואר', 'פוקס', 'טרמינל איקס', 'terminal x', 'shein', 'asos', 'אמזון', 'amazon', 'aliexpress', 'ksp', 'איקאה', 'ikea', 'אורבניקה', 'urbanica'],
        },
        {
          key: 'bills',
          name: 'משק בית וחשבונות',
          icon: 'Home',
          color: '#6366f1',
          matchTerms: ['משק בית', 'חשמל', 'חברת החשמל', 'מים', 'מי אביבים', 'תאגיד מים', 'ארנונה', 'עיריית', 'גז', 'בזק', 'הוט', 'סלקום', 'פרטנר', 'טלפון ואינטרנט', 'hot', 'bezeq', 'partner', 'cellcom', 'ועד בית'],
        },
        {
          key: 'pharmacy',
          name: 'בריאות ופארם',
          icon: 'HeartPulse',
          color: '#ef4444',
          matchTerms: ['בתי מרקחת', 'פארם', 'סופר פארם', 'super-pharm', 'be', 'ניו פארם', 'בית מרקחת', 'תרופות', 'קופת חולים', 'מכבי', 'כללית', 'מאוחדת', 'לאומית', 'בריאות וטיפוח', 'אופטיקה'],
        },
        {
          key: 'leisure',
          name: 'פנאי ובילויים',
          icon: 'Gamepad2',
          color: '#06b6d4',
          matchTerms: ['פנאי ותרבות', 'פנאי ובילויים', 'הופעות וקולנוע', 'סינמה סיטי', 'יס פלאנט', 'הוט סינמה', 'כרטיסים', 'בילויים', 'הצגות', 'אטרקציות', 'קולנוע', 'נטפליקס', 'netflix', 'spotify', 'ספוטיפיי', 'steam', 'playstation', 'מלון', 'טיסות', 'booking'],
        },
      ];

      // Query historical transactions in the last 12-13 months (non-ignored expenses, capturing both positive & negative amount expense records)
      // Including split transactions itemized by split category & split amount
      const historicalRes = await pool.query(`
        WITH itemized AS (
          SELECT 
            t.id,
            t.date,
            TO_CHAR(t.date, 'YYYY-MM') AS "monthKey",
            t.amount,
            COALESCE(t.category, '') AS "category",
            COALESCE(t.user_description, '') AS "userDescription",
            COALESCE(t.merchant_name, '') AS "merchantName",
            COALESCE(t.description, '') AS "description",
            t.account_id AS "accountId",
            a.display_name AS "accountDisplayName",
            a.bank_company AS "bankCompany"
          FROM transactions t
          LEFT JOIN bank_accounts a ON t.account_id = a.id
          WHERE t.is_ignored = false 
            AND (t.is_split = false OR t.is_split IS NULL)
            AND (
              t.amount < 0 
              OR (
                t.amount > 0 
                AND COALESCE(t.category, '') NOT IN ('משכורת', 'הכנסה', 'קצבה או מלגה', 'הכנסה מנכס', 'הכנסה מעסק', 'דיווידנדים ורווחים', 'הכנסות שונות', 'הכנסות', 'Salary', 'Income')
              )
            )
            AND t.date >= (CURRENT_DATE - INTERVAL '13 months')

          UNION ALL

          SELECT 
            t.id,
            t.date,
            TO_CHAR(t.date, 'YYYY-MM') AS "monthKey",
            ts.amount,
            COALESCE(ts.category, '') AS "category",
            COALESCE(ts.description, t.user_description, '') AS "userDescription",
            COALESCE(t.merchant_name, '') AS "merchantName",
            COALESCE(t.description, '') AS "description",
            t.account_id AS "accountId",
            a.display_name AS "accountDisplayName",
            a.bank_company AS "bankCompany"
          FROM transaction_splits ts
          JOIN transactions t ON ts.transaction_id = t.id
          LEFT JOIN bank_accounts a ON t.account_id = a.id
          WHERE t.is_ignored = false 
            AND t.is_split = true
            AND (
              ts.amount < 0 
              OR (
                ts.amount > 0 
                AND COALESCE(ts.category, '') NOT IN ('משכורת', 'הכנסה', 'קצבה או מלגה', 'הכנסה מנכס', 'הכנסה מעסק', 'דיווידנדים ורווחים', 'הכנסות שונות', 'הכנסות', 'Salary', 'Income')
              )
            )
            AND t.date >= (CURRENT_DATE - INTERVAL '13 months')
        )
        SELECT * FROM itemized
        ORDER BY date DESC
      `);

      const currentMonthKey = monthLabels[monthLabels.length - 1].key;

      const results = FOCUSED_CATEGORIES.map((catDef) => {
        const matchesItem = (row) => {
          const cleanDesc = cleanSpacedHebrew(row.description);
          const cleanMerchant = cleanSpacedHebrew(row.merchantName);
          const cleanUserDesc = cleanSpacedHebrew(row.userDescription);
          const cleanCat = cleanSpacedHebrew(row.category);
          const text = `${row.category} ${cleanCat} ${row.merchantName} ${cleanMerchant} ${row.description} ${cleanDesc} ${row.userDescription} ${cleanUserDesc}`.toLowerCase();
          return catDef.matchTerms.some((term) => text.includes(term.toLowerCase()));
        };

        const matchingTxs = historicalRes.rows.filter(matchesItem);

        // Group spending by month key
        const monthSpendMap = {};
        const monthCountMap = {};
        let totalHistorical = 0;

        for (const tx of matchingTxs) {
          const absAmount = Math.abs(parseFloat(tx.amount) || 0);
          const mKey = tx.monthKey;
          monthSpendMap[mKey] = (monthSpendMap[mKey] || 0) + absAmount;
          monthCountMap[mKey] = (monthCountMap[mKey] || 0) + 1;
          totalHistorical += absAmount;
        }

        // Build 12-month distribution curve data
        const distribution = monthLabels.map((m) => {
          const spend = Math.round((monthSpendMap[m.key] || 0) * 100) / 100;
          return {
            month: m.key,
            label: m.label,
            amount: spend,
            txCount: monthCountMap[m.key] || 0,
          };
        });

        // 12-month average strictly divided by 12
        const monthlyAvg = Math.round((totalHistorical / 12) * 100) / 100;
        const currentMonthSpend = Math.round((monthSpendMap[currentMonthKey] || 0) * 100) / 100;
        const diffPercent = monthlyAvg > 0 ? Math.round(((currentMonthSpend - monthlyAvg) / monthlyAvg) * 100) : 0;

        return {
          key: catDef.key,
          category: catDef.name,
          name: catDef.name,
          title: catDef.name,
          label: catDef.name,
          icon: catDef.icon,
          color: catDef.color,
          monthlyAverage: monthlyAvg,
          amount: monthlyAvg,
          currentMonth: currentMonthSpend,
          diffPercent,
          status: diffPercent > 10 ? 'higher' : diffPercent < -10 ? 'lower' : 'normal',
          totalHistorical: Math.round(totalHistorical * 100) / 100,
          txCount: matchingTxs.length,
          distribution,
          transactions: matchingTxs.map((tx) => ({
            id: tx.id,
            date: tx.date,
            amount: tx.amount,
            category: cleanSpacedHebrew(tx.category),
            userDescription: cleanSpacedHebrew(tx.userDescription),
            merchantName: cleanSpacedHebrew(tx.merchantName),
            description: cleanSpacedHebrew(tx.description),
            accountDisplayName: tx.accountDisplayName,
            bankCompany: tx.bankCompany,
          })),
        };
      });

      return reply.code(200).send({
        distinctMonths: 12,
        data: results,
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
