import { pool } from '../db.js';
import { cleanSpacedHebrew } from './transactions.js';
import {
  getSystemMonthStartDay,
  getFinancialMonthBounds,
  getCurrentFinancialMonthBounds,
  buildFinancialMonthLabels,
  getFinancialMonthSqlExpression,
  toLocalDateStr,
  daysBetween,
} from '../services/settings-helper.js';
import {
  ACCOUNT_FILTER_SQL,
  CREDIT_CARDS_SQL,
  allocatePercentages,
  categoryJoinSql,
  computeSavingsRate,
  excludedCategoryCondition,
  fetchCategoryTotals,
  fetchMonthlyTotals,
  fetchPeriodTotals,
  incomeAmountSql,
  itemsCtes,
  netExpenseSql,
  round2,
  termMatches,
} from '../services/analytics-sql.js';
import { generateAiWidgetData } from '../services/ai-widget-service.js';

const DEFAULT_START_DAY = 10;

async function resolveStartDay(query) {
  const raw = query.startDay || query.monthStartDay;
  if (raw) return Math.min(31, Math.max(1, parseInt(raw, 10) || DEFAULT_START_DAY));
  return getSystemMonthStartDay(pool);
}

/** Resolve [startDate, endDate] from explicit dates, year+month, or the current financial month. */
function resolvePeriod(query, startDay) {
  let startDate = query.startDate;
  let endDate = query.endDate;
  let year = parseInt(query.year, 10);
  let month = parseInt(query.month, 10);
  if (!startDate || !endDate) {
    if (year && month) {
      ({ startDate, endDate } = getFinancialMonthBounds(year, month, startDay));
    } else {
      const cur = getCurrentFinancialMonthBounds(startDay);
      startDate = cur.startDate;
      endDate = cur.endDate;
      year = cur.year;
      month = cur.month;
    }
  }
  return { startDate, endDate, year: year || null, month: month || null };
}

async function readAnalyticsLookback(queryMonths) {
  let lookback = parseInt(queryMonths, 10);
  if (!lookback) {
    try {
      const settingsRes = await pool.query(
        `SELECT settings FROM system_settings WHERE user_id = '00000000-0000-0000-0000-000000000001'`
      );
      const s = settingsRes.rows[0]?.settings;
      if (s?.analyticsAveragesLookbackMonths) lookback = parseInt(s.analyticsAveragesLookbackMonths, 10);
    } catch (e) {
      // fall through to default
    }
  }
  return Math.min(Math.max(lookback || 12, 1), 60);
}

export default async function analyticsRoutes(fastify, options) {
  // GET /api/analytics/overview - Overall KPI summaries for current month or selected date range
  fastify.get('/overview', async (request, reply) => {
    const startDay = await resolveStartDay(request.query);
    const { startDate, endDate, year, month } = resolvePeriod(request.query, startDay);

    try {
      const totals = await fetchPeriodTotals(pool, { startDate, endDate });
      const income = totals.income;
      const expense = Math.max(0, totals.expense);
      const netSavings = income - expense;
      const savingsRate = computeSavingsRate(income, expense);

      // Net worth strictly from active bank accounts, wallet, and investments (excluding credit cards)
      const accountsRes = await pool.query(`
        SELECT COALESCE(SUM(balance), 0) AS "netWorth"
        FROM bank_accounts
        WHERE is_active = true
          AND LOWER(bank_company) NOT IN (${CREDIT_CARDS_SQL})
      `);
      const netWorth = parseFloat(accountsRes.rows[0].netWorth);

      return reply.code(200).send({
        period: { year, month, startDate, endDate, startDay },
        netWorth,
        totalIncome: round2(income),
        totalExpense: round2(expense),
        netSavings: round2(netSavings),
        savingsRate,
        transactionCount: totals.txCount,
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch analytics overview');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // GET /api/analytics/monthly-trend - Income, expense and savings trend across N months (up to 60)
  fastify.get('/monthly-trend', async (request, reply) => {
    const monthsCount = Math.min(Math.max(parseInt(request.query.months, 10) || 12, 1), 60);
    const startDay = await resolveStartDay(request.query);

    try {
      const labels = buildFinancialMonthLabels(startDay, monthsCount);
      const totals = await fetchMonthlyTotals(pool, { labels, startDay, accountId: request.query.accountId });

      // Keep gaps as zero months, but drop leading months that precede the first recorded activity
      let firstIdx = labels.findIndex((l) => totals.has(l.key));
      if (firstIdx < 0) firstIdx = labels.length - 1;

      const trend = labels.slice(firstIdx).map((l) => {
        const t = totals.get(l.key) || { income: 0, expenses: 0 };
        return {
          month: l.key,
          monthKey: l.key,
          label: l.label,
          income: round2(t.income),
          expenses: round2(t.expenses),
          savings: round2(t.income - t.expenses),
        };
      });
      return reply.code(200).send({ data: trend });
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch monthly trend');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // GET /api/analytics/category-breakdown - Expenses or Income categorized distribution with split transaction support
  fastify.get('/category-breakdown', async (request, reply) => {
    const type = request.query.type === 'income' ? 'income' : 'expense';
    const startDay = await resolveStartDay(request.query);
    const { startDate, endDate } = resolvePeriod(request.query, startDay);

    try {
      const rows = await fetchCategoryTotals(pool, {
        startDate,
        endDate,
        type,
        accountIds: request.query.accountIds || request.query.accountId || null,
      });

      const categoryMap = new Map();
      for (const r of rows) {
        let cleanName = cleanSpacedHebrew(r.name).trim();
        if (!cleanName || cleanName === 'אחר') cleanName = 'שונות';
        const existing = categoryMap.get(cleanName);
        if (existing) {
          existing.amount += r.amount;
          existing.count += r.count;
        } else {
          categoryMap.set(cleanName, {
            name: cleanName,
            color: r.color || '#6366f1',
            icon: r.icon || 'tag',
            amount: r.amount,
            count: r.count,
          });
        }
      }

      const sorted = Array.from(categoryMap.values()).sort((a, b) => b.amount - a.amount);
      const total = sorted.reduce((acc, r) => acc + r.amount, 0);
      const percentages = allocatePercentages(sorted.map((r) => r.amount));
      const data = sorted.map((r, idx) => ({
        ...r,
        amount: round2(r.amount),
        percentage: percentages[idx],
      }));

      return reply.code(200).send({ total: round2(total), data });
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch category breakdown');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // GET /api/analytics/top-merchants - Top merchant spending
  fastify.get('/top-merchants', async (request, reply) => {
    const limit = Math.min(Math.max(parseInt(request.query.limit, 10) || 10, 1), 50);
    const startDay = await resolveStartDay(request.query);
    const { startDate, endDate } = resolvePeriod(request.query, startDay);

    const query = `
      WITH ${itemsCtes({ endParam: '$2' })}
      SELECT
        COALESCE(NULLIF(i.merchant_name, ''), NULLIF(i.description, ''), 'לא ידוע') AS "merchant",
        SUM(${netExpenseSql('i.amount', 'c', 'i.category')}) AS "totalAmount",
        COUNT(DISTINCT i.id) AS "txCount",
        MODE() WITHIN GROUP (ORDER BY i.category) AS "category"
      FROM items i
      JOIN bank_accounts a ON i.account_id = a.id
      ${categoryJoinSql('i.category')}
      WHERE ${ACCOUNT_FILTER_SQL}
        AND ${excludedCategoryCondition('i.category')}
        AND i.ref_date >= $1::date AND i.ref_date <= $2::date
        AND LOWER(COALESCE(i.merchant_name, '')) NOT LIKE '%משיכת מזומן%'
        AND LOWER(COALESCE(i.description, '')) NOT LIKE '%משיכת מזומן%'
        AND LOWER(COALESCE(i.merchant_name, '')) NOT LIKE '%כספומט%'
        AND LOWER(COALESCE(i.description, '')) NOT LIKE '%כספומט%'
        AND LOWER(COALESCE(i.merchant_name, '')) NOT LIKE '%atm%'
      GROUP BY COALESCE(NULLIF(i.merchant_name, ''), NULLIF(i.description, ''), 'לא ידוע')
      HAVING SUM(${netExpenseSql('i.amount', 'c', 'i.category')}) > 0
      ORDER BY "totalAmount" DESC
      LIMIT $3
    `;

    try {
      const result = await pool.query(query, [startDate, endDate, limit]);
      const data = result.rows.map((r) => ({
        merchant: r.merchant,
        amount: round2(parseFloat(r.totalAmount)),
        count: parseInt(r.txCount, 10),
        category: r.category,
      }));
      return reply.code(200).send({ data });
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch top merchants');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // GET /api/analytics/daily-spending - Daily calendar heatmap array
  fastify.get('/daily-spending', async (request, reply) => {
    const startDay = await resolveStartDay(request.query);
    const { startDate, endDate, year, month } = resolvePeriod(request.query, startDay);

    const query = `
      WITH ${itemsCtes({ endParam: '$2' })}
      SELECT
        TO_CHAR(i.ref_date, 'YYYY-MM-DD') AS "date",
        COALESCE(SUM(${netExpenseSql('i.amount', 'c', 'i.category')}), 0) AS "expense",
        COALESCE(SUM(${incomeAmountSql('i.amount', 'c', 'i.category')}), 0) AS "income",
        COUNT(DISTINCT i.id) AS "count"
      FROM items i
      JOIN bank_accounts a ON i.account_id = a.id
      ${categoryJoinSql('i.category')}
      WHERE ${ACCOUNT_FILTER_SQL}
        AND ${excludedCategoryCondition('i.category')}
        AND i.ref_date >= $1::date AND i.ref_date <= $2::date
      GROUP BY i.ref_date
      ORDER BY i.ref_date ASC
    `;

    try {
      const result = await pool.query(query, [startDate, endDate]);
      return reply.code(200).send({
        year,
        month,
        startDate,
        endDate,
        daysInMonth: daysBetween(startDate, endDate) + 1,
        data: result.rows.map((r) => ({
          date: r.date,
          expense: Math.max(0, round2(parseFloat(r.expense))),
          income: round2(parseFloat(r.income)),
          count: parseInt(r.count, 10),
        })),
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch daily spending');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // GET /api/analytics/category-averages - Monthly average spending per category with configurable lookback & custom categories
  fastify.get('/category-averages', async (request, reply) => {
    try {
      const { months: queryMonths, categories: queryCategories } = request.query;
      const startDay = await resolveStartDay(request.query);

      // Load user settings if any custom averages are saved
      let customAverages = null;
      try {
        const settingsRes = await pool.query(
          `SELECT settings FROM system_settings WHERE user_id = '00000000-0000-0000-0000-000000000001'`
        );
        const s = settingsRes.rows[0]?.settings;
        if (Array.isArray(s?.analyticsCustomAverages) && s.analyticsCustomAverages.length > 0) {
          customAverages = s.analyticsCustomAverages;
        }
      } catch (err) {
        fastify.log.warn({ err: err.message }, 'Could not read user settings for averages');
      }

      // Check query param override for categories
      if (queryCategories) {
        const fromCsv = () => queryCategories.split(',').map((c) => ({ name: c.trim(), key: c.trim() })).filter((c) => c.name);
        try {
          customAverages = queryCategories.startsWith('[') ? JSON.parse(queryCategories) : fromCsv();
        } catch (e) {
          customAverages = fromCsv();
        }
      }

      const lookbackMonths = await readAnalyticsLookback(queryMonths);
      const monthLabels = buildFinancialMonthLabels(startDay, lookbackMonths);

      // Default categories if user hasn't customized
      const DEFAULT_FOCUSED_CATEGORIES = [
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

      // Prepare target categories list
      const targetCategoryDefs = (customAverages && customAverages.length > 0)
        ? customAverages.map((c, i) => {
            const name = c.name || c.category || c.title || 'קטגוריה';
            // Find if matching predefined exists for rich match terms
            const existingPredefined = DEFAULT_FOCUSED_CATEGORIES.find(
              (p) => p.name === name || p.key === c.key
            );
            return {
              key: c.key || `custom_${i}`,
              name,
              title: name,
              icon: c.icon || existingPredefined?.icon || 'Tag',
              color: c.color || existingPredefined?.color || '#6366f1',
              matchTerms: c.matchTerms || existingPredefined?.matchTerms || [name, ...(c.keywords || [])],
            };
          })
        : DEFAULT_FOCUSED_CATEGORIES;

      const monthSql = getFinancialMonthSqlExpression(startDay, 'i.ref_date');
      const net = netExpenseSql('i.amount', 'c', 'i.category');

      // Every spending line (amortization-aware, split-aware, refunds netted) inside the lookback window
      const historicalRes = await pool.query(`
        WITH ${itemsCtes({ endParam: '$2' })}
        SELECT
          i.id,
          TO_CHAR(i.ref_date, 'YYYY-MM-DD') AS "date",
          ${monthSql} AS "monthKey",
          i.amount AS "amount",
          ${net} AS "netExpense",
          COALESCE(i.category, '') AS "category",
          COALESCE(i.user_description, '') AS "userDescription",
          COALESCE(i.merchant_name, '') AS "merchantName",
          COALESCE(i.description, '') AS "description",
          i.account_id AS "accountId",
          a.display_name AS "accountDisplayName",
          a.bank_company AS "bankCompany"
        FROM items i
        JOIN bank_accounts a ON i.account_id = a.id
        ${categoryJoinSql('i.category')}
        WHERE ${ACCOUNT_FILTER_SQL}
          AND ${excludedCategoryCondition('i.category')}
          AND i.ref_date >= $1::date AND i.ref_date <= $2::date
          AND ${net} <> 0
        ORDER BY i.ref_date DESC
      `, [monthLabels[0].startDate, monthLabels[monthLabels.length - 1].endDate]);

      const currentMonthKey = monthLabels[monthLabels.length - 1].key;

      // Which months count towards the average: completed months from the first month that has any
      // data at all (months before the user started tracking, and the unfinished current month,
      // must not dilute the average). Falls back to the current month when nothing else exists.
      const firstDataKey = historicalRes.rows.reduce((min, r) => (min === null || r.monthKey < min ? r.monthKey : min), null);
      let averagedKeys = monthLabels
        .slice(0, -1)
        .filter((m) => firstDataKey !== null && m.key >= firstDataKey)
        .map((m) => m.key);
      if (averagedKeys.length === 0) averagedKeys = [currentMonthKey];
      const averagedSet = new Set(averagedKeys);

      // Assign each spending line to exactly ONE focused category (no double counting):
      // 1) the line's own category equals the focused category name / one of its terms, else
      // 2) the first focused category whose keywords match the line text.
      const defs = targetCategoryDefs.map((def) => ({
        def,
        exact: new Set([def.name, ...def.matchTerms].map((t) => String(t).toLowerCase().trim())),
      }));
      const buckets = new Map(targetCategoryDefs.map((d) => [d.key, []]));

      for (const row of historicalRes.rows) {
        const cleanCat = cleanSpacedHebrew(row.category).toLowerCase().trim();
        let owner = defs.find((d) => d.exact.has(cleanCat) || d.exact.has(String(row.category).toLowerCase().trim()));
        if (!owner) {
          const text = [
            row.category, cleanCat, row.merchantName, cleanSpacedHebrew(row.merchantName),
            row.description, cleanSpacedHebrew(row.description),
            row.userDescription, cleanSpacedHebrew(row.userDescription),
          ].join(' ').toLowerCase();
          owner = defs.find((d) => d.def.matchTerms.some((term) => termMatches(text, term)));
        }
        if (owner) buckets.get(owner.def.key).push(row);
      }

      const results = targetCategoryDefs.map((catDef) => {
        const matchingTxs = buckets.get(catDef.key) || [];

        const monthSpendMap = {};
        const monthCountMap = {};
        for (const tx of matchingTxs) {
          const amt = parseFloat(tx.netExpense) || 0;
          monthSpendMap[tx.monthKey] = (monthSpendMap[tx.monthKey] || 0) + amt;
          monthCountMap[tx.monthKey] = (monthCountMap[tx.monthKey] || 0) + 1;
        }

        const distribution = monthLabels.map((m) => ({
          month: m.key,
          label: m.label,
          amount: Math.max(0, round2(monthSpendMap[m.key] || 0)),
          txCount: monthCountMap[m.key] || 0,
        }));

        const totalHistorical = averagedKeys.reduce((acc, k) => acc + (monthSpendMap[k] || 0), 0);
        const monthlyAvg = Math.max(0, round2(totalHistorical / averagedKeys.length));
        const currentMonthSpend = Math.max(0, round2(monthSpendMap[currentMonthKey] || 0));
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
          totalHistorical: Math.max(0, round2(totalHistorical)),
          averagedMonths: averagedKeys.length,
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
        distinctMonths: lookbackMonths,
        averagedMonths: averagedKeys.length,
        data: results,
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to compute category averages');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // GET /api/analytics/top-expenses - Largest single expenses
  fastify.get('/top-expenses', async (request, reply) => {
    const startDay = await resolveStartDay(request.query);
    const { startDate, endDate, year, month } = resolvePeriod(request.query, startDay);
    const limit = Math.min(Math.max(parseInt(request.query.limit, 10) || 5, 1), 20);

    const query = `
      SELECT
        t.id,
        t.date,
        ABS(t.amount) AS "amount",
        t.currency,
        COALESCE(NULLIF(t.merchant_name, ''), t.description, 'עסקה') AS "merchantName",
        t.description,
        t.category,
        a.display_name AS "accountDisplayName",
        a.bank_company AS "bankCompany"
      FROM transactions t
      JOIN bank_accounts a ON t.account_id = a.id
      ${categoryJoinSql('t.category')}
      WHERE t.is_ignored = false
        AND t.is_cc_billing IS NOT TRUE
        AND ${excludedCategoryCondition('t.category')}
        AND ${ACCOUNT_FILTER_SQL}
        AND t.amount < 0
        AND COALESCE(c.type, 'expense') <> 'income'
        AND t.date >= $1::date AND t.date <= $2::date
        AND LOWER(COALESCE(t.merchant_name, '')) NOT LIKE '%משיכת מזומן%'
        AND LOWER(COALESCE(t.description, '')) NOT LIKE '%משיכת מזומן%'
      ORDER BY ABS(t.amount) DESC
      LIMIT $3
    `;

    try {
      const res = await pool.query(query, [startDate, endDate, limit]);
      return reply.code(200).send({
        period: { year, month, startDate, endDate, startDay },
        data: res.rows.map((r) => ({ ...r, amount: parseFloat(r.amount) })),
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch top expenses');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // GET /api/analytics/historical-balance-summary - Monthly averages & Income/Expense balance over customizable period with drilldown
  fastify.get('/historical-balance-summary', async (request, reply) => {
    try {
      const startDay = await resolveStartDay(request.query);
      const lookbackMonths = await readAnalyticsLookback(request.query.months);
      const monthLabels = buildFinancialMonthLabels(startDay, lookbackMonths);
      const rowMap = await fetchMonthlyTotals(pool, { labels: monthLabels, startDay });

      let totalIncome = 0;
      let totalExpenses = 0;

      const monthlyData = monthLabels.map((m) => {
        const item = rowMap.get(m.key) || { income: 0, expenses: 0, txCount: 0 };
        const inc = round2(item.income);
        const exp = round2(item.expenses);
        const balance = round2(inc - exp);
        totalIncome += inc;
        totalExpenses += exp;
        return {
          monthKey: m.key,
          label: m.label,
          year: m.year,
          month: m.month,
          startDate: m.startDate,
          endDate: m.endDate,
          income: inc,
          expenses: exp,
          balance,
          savingsRate: computeSavingsRate(inc, exp),
          txCount: item.txCount,
          status: balance > 0 ? 'surplus' : balance < 0 ? 'deficit' : 'balanced',
        };
      });

      // Averages: completed months starting from the first month with data (see category-averages)
      const firstDataIdx = monthlyData.findIndex((m) => m.txCount > 0);
      let averagedMonths = firstDataIdx < 0 ? [] : monthlyData.slice(firstDataIdx, -1);
      if (averagedMonths.length === 0) averagedMonths = monthlyData.slice(-1);
      const avgBase = averagedMonths.length;
      const avgIncome = round2(averagedMonths.reduce((a, m) => a + m.income, 0) / avgBase);
      const avgExpenses = round2(averagedMonths.reduce((a, m) => a + m.expenses, 0) / avgBase);
      const avgBalance = round2(avgIncome - avgExpenses);

      const totalBalance = round2(totalIncome - totalExpenses);
      const overallSavingsRate = computeSavingsRate(totalIncome, totalExpenses);

      const monthsWithData = monthlyData.filter((m) => m.income > 0 || m.expenses > 0);
      const pick = (cmp) => (monthsWithData.length > 0 ? [...monthsWithData].sort(cmp)[0] : null);

      return reply.code(200).send({
        lookbackMonths,
        averagedMonths: avgBase,
        startDay,
        summary: {
          totalIncome: round2(totalIncome),
          totalExpenses: round2(totalExpenses),
          totalBalance,
          monthlyAverageIncome: avgIncome,
          monthlyAverageExpenses: avgExpenses,
          monthlyAverageBalance: avgBalance,
          overallSavingsRate,
          bestMonth: pick((a, b) => b.balance - a.balance),
          worstMonth: pick((a, b) => a.balance - b.balance),
          highestExpenseMonth: pick((a, b) => b.expenses - a.expenses),
          highestIncomeMonth: pick((a, b) => b.income - a.income),
        },
        months: monthlyData,
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch historical balance summary');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // GET /api/analytics/deep-stats - Rich financial stats: Fixed vs Variable, Day-of-Week, Burn Rate, Spikes & Account mix
  fastify.get('/deep-stats', async (request, reply) => {
    try {
      const startDay = await resolveStartDay(request.query);
      const currentBounds = getCurrentFinancialMonthBounds(startDay);
      const startDate = request.query.startDate || currentBounds.startDate;
      const endDate = request.query.endDate || currentBounds.endDate;

      const FIXED_CATEGORY_KEYWORDS = [
        'משק בית', 'חשבונות', 'חשמל', 'מים', 'ארנונה', 'אינטרנט', 'תקשורת', 'טלפון',
        'שכר דירה', 'משכנתא', 'ביטוח', 'ביטוחים', 'הוראת קבע', 'מינוי', 'מנוי', 'ועד בית',
        'שכר לימוד', 'חינוך', 'גן ילדים', 'מעון', 'הלוואה', 'הלוואות'
      ];

      const net = netExpenseSql('i.amount', 'c', 'i.category');
      const txResult = await pool.query(`
        WITH ${itemsCtes({ endParam: '$2' })}
        SELECT
          i.id,
          TO_CHAR(i.ref_date, 'YYYY-MM-DD') AS date,
          ${net} AS amount,
          COALESCE(NULLIF(c.name, ''), NULLIF(i.category, ''), 'שונות') AS category,
          COALESCE(NULLIF(i.merchant_name, ''), i.description, 'עסקה') AS merchant,
          a.display_name AS account_name,
          a.bank_company
        FROM items i
        JOIN bank_accounts a ON i.account_id = a.id
        ${categoryJoinSql('i.category')}
        WHERE i.ref_date >= $1::date AND i.ref_date <= $2::date
          AND ${excludedCategoryCondition('i.category')}
          AND ${ACCOUNT_FILTER_SQL}
          AND ${net} <> 0
      `, [startDate, endDate]);
      const txRows = txResult.rows;

      // 1. Fixed vs. Variable (refunds carry a negative amount and reduce their group)
      let fixedTotal = 0;
      let variableTotal = 0;
      let fixedCount = 0;
      let variableCount = 0;
      for (const row of txRows) {
        const amt = parseFloat(row.amount) || 0;
        const text = `${row.category} ${row.merchant}`.toLowerCase();
        if (FIXED_CATEGORY_KEYWORDS.some((kw) => termMatches(text, kw))) {
          fixedTotal += amt;
          if (amt > 0) fixedCount += 1;
        } else {
          variableTotal += amt;
          if (amt > 0) variableCount += 1;
        }
      }
      fixedTotal = Math.max(0, fixedTotal);
      variableTotal = Math.max(0, variableTotal);

      const totalExpenses = fixedTotal + variableTotal;
      const fixedPercent = totalExpenses > 0 ? Math.round((fixedTotal / totalExpenses) * 100) : 0;
      const variablePercent = totalExpenses > 0 ? 100 - fixedPercent : 0;

      // 2. Day of Week Spending Breakdown (DOW 0=Sunday to 6=Saturday) - computed from the date string, no timezone drift
      const dayOfWeekMap = {
        0: { dayNum: 0, name: 'יום ראשון', short: 'א׳', amount: 0, count: 0 },
        1: { dayNum: 1, name: 'יום שני', short: 'ב׳', amount: 0, count: 0 },
        2: { dayNum: 2, name: 'יום שלישי', short: 'ג׳', amount: 0, count: 0 },
        3: { dayNum: 3, name: 'יום רביעי', short: 'ד׳', amount: 0, count: 0 },
        4: { dayNum: 4, name: 'יום חמישי', short: 'ה׳', amount: 0, count: 0 },
        5: { dayNum: 5, name: 'יום שישי', short: 'ו׳', amount: 0, count: 0 },
        6: { dayNum: 6, name: 'שבת', short: 'שבת', amount: 0, count: 0 },
      };
      for (const row of txRows) {
        const amt = parseFloat(row.amount) || 0;
        const [y, m, d] = row.date.split('-').map(Number);
        const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
        dayOfWeekMap[dow].amount += amt;
        if (amt > 0) dayOfWeekMap[dow].count += 1;
      }

      const daysList = Object.values(dayOfWeekMap).map((d) => {
        const amount = Math.max(0, d.amount);
        return {
          ...d,
          amount: round2(amount),
          averagePerTx: d.count > 0 ? round2(amount / d.count) : 0,
        };
      });
      const weekdayTotal = round2([0, 1, 2, 3, 4].reduce((acc, i) => acc + daysList[i].amount, 0));
      const weekendTotal = round2([5, 6].reduce((acc, i) => acc + daysList[i].amount, 0));
      const daysSum = weekdayTotal + weekendTotal;

      // 3. Burn Rate & Cycle Projection (pure date-string arithmetic)
      const totalCycleDays = Math.max(1, daysBetween(startDate, endDate) + 1);
      const daysElapsed = Math.min(totalCycleDays, Math.max(1, daysBetween(startDate, toLocalDateStr()) + 1));
      const daysRemaining = Math.max(0, totalCycleDays - daysElapsed);
      const dailyBurnRate = round2(totalExpenses / daysElapsed);
      const projectedMonthEndSpend = round2(dailyBurnRate * totalCycleDays);

      // 4. Account Distribution
      const accountMap = {};
      for (const row of txRows) {
        const name = row.account_name || row.bank_company || 'כללי';
        accountMap[name] = (accountMap[name] || 0) + (parseFloat(row.amount) || 0);
      }
      const accountEntries = Object.entries(accountMap)
        .map(([name, amount]) => ({ name, amount: Math.max(0, amount) }))
        .filter((e) => e.amount > 0)
        .sort((a, b) => b.amount - a.amount);
      const accountPct = allocatePercentages(accountEntries.map((e) => e.amount));
      const accountBreakdown = accountEntries.map((e, idx) => ({
        name: e.name,
        amount: round2(e.amount),
        percentage: accountPct[idx],
      }));

      return reply.code(200).send({
        period: { startDate, endDate, startDay },
        fixedVsVariable: {
          fixedTotal: round2(fixedTotal),
          variableTotal: round2(variableTotal),
          fixedPercent,
          variablePercent,
          totalExpenses: round2(totalExpenses),
          fixedCount,
          variableCount,
        },
        dayOfWeekSpending: {
          days: daysList,
          weekdayTotal,
          weekendTotal,
          weekendPercent: daysSum > 0 ? Math.round((weekendTotal / daysSum) * 100) : 0,
        },
        burnRate: {
          daysElapsed,
          daysRemaining,
          totalCycleDays,
          currentCycleSpend: round2(totalExpenses),
          dailyBurnRate,
          projectedMonthEndSpend,
          cycleProgressPercent: Math.round((daysElapsed / totalCycleDays) * 100),
        },
        accountBreakdown,
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch deep stats');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // POST /api/analytics/ai-widget - Live prompt-to-widget dynamic generation
  fastify.post('/ai-widget', async (request, reply) => {
    const { prompt, context, existingWidget } = request.body || {};
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return reply.code(400).send({ error: 'Prompt is required' });
    }

    try {
      const widget = await generateAiWidgetData({
        prompt: prompt.trim(),
        context,
        existingWidget,
      });
      return reply.code(200).send({ success: true, widget });
    } catch (err) {
      fastify.log.error(err, 'Failed to generate AI widget');
      return reply.code(500).send({ error: err.message || 'Failed to generate AI widget' });
    }
  });
}
