import { pool } from '../db.js';
import { getAiSettings, getAvailableCategories } from './ai-analyzer.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { 
  getSystemMonthStartDay, 
  getFinancialMonthBounds, 
  getCurrentFinancialMonthBounds, 
  getFinancialMonthSqlExpression 
} from './settings-helper.js';
import { cleanSpacedHebrew } from '../routes/transactions.js';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Intelligent Fallback NLP Query Compiler:
 * Parses Hebrew/English user query into a structured widget specification
 * when Gemini API key is unavailable or fails.
 */
function heuristicParseQuery(prompt, availableCategories = []) {
  const p = (prompt || '').toLowerCase();
  
  // 1. Detect Lookback Months
  let months = 12;
  if (p.includes('דו שנתי') || p.includes('דו-שנתי') || p.includes('שנתיים') || p.includes('2 שנים') || p.includes('24 חודש')) {
    months = 24;
  } else if (p.includes('3 שנים') || p.includes('שלוש שנים') || p.includes('36 חודש')) {
    months = 36;
  } else if (p.includes('6 חודש') || p.includes('חצי שנה')) {
    months = 6;
  } else if (p.includes('3 חודש') || p.includes('רבעון')) {
    months = 3;
  } else if (p.includes('כל הזמן') || p.includes('הכל') || p.includes('היסטוריה מלאה')) {
    months = 48;
  } else if (p.includes('שנה') || p.includes('12 חודש')) {
    months = 12;
  }

  // 2. Detect Categories and Keywords
  const matchedCategories = [];
  const searchKeywords = [];

  // Common keywords map
  const keywordMap = {
    'דלק': { cat: 'דלק ותחבורה', keywords: ['דלק', 'סונול', 'פז', 'טן', 'דלק ישראל', 'דור אלון', 'תחנת דלק'] },
    'רכב': { cat: 'רכב ותחבורה', keywords: ['רכב', 'מוסך', 'טסט', 'טיפול', 'פנגו', 'סלו', 'חניה'] },
    'סופר': { cat: 'סופר ומכולת', keywords: ['סופר', 'מכולת', 'שופרסל', 'רמי לוי', 'יוחננוף', 'אושר עד', 'ויקטורי', 'טיב טעם', 'קרפור'] },
    'מכולת': { cat: 'סופר ומכולת', keywords: ['מכולת', 'ירקות', 'פירות'] },
    'מסעדות': { cat: 'אוכל בחוץ', keywords: ['מסעדה', 'מסעדות', 'אוכל בחוץ', 'וולט', 'wolt', '10bis', 'תן ביס', 'פיצה', 'המבורגר'] },
    'וולט': { cat: 'אוכל בחוץ', keywords: ['וולט', 'wolt', 'משלוחים'] },
    'קפה': { cat: 'אוכל בחוץ', keywords: ['קפה', 'ארומה', 'בית קפה'] },
    'קניות': { cat: 'קניות וביגוד', keywords: ['קניות', 'זארה', 'zara', 'h&m', 'ביגוד', 'אמזון', 'amazon', 'שופינג'] },
    'בגדים': { cat: 'קניות וביגוד', keywords: ['בגדים', 'זארה', 'ביגוד', 'הנעלה', 'נעליים'] },
    'חשמל': { cat: 'משק בית וחשבונות', keywords: ['חשמל', 'חברת החשמל'] },
    'חשבונות': { cat: 'משק בית וחשבונות', keywords: ['חשבונות', 'ארנונה', 'מים', 'גז', 'ועד בית'] },
    'פארם': { cat: 'בריאות ופארם', keywords: ['פארם', 'סופר פארם', 'בית מרקחת', 'תרופות', 'קופת חולים'] },
    'בריאות': { cat: 'בריאות ופארם', keywords: ['בריאות', 'רופא', 'קופת חולים', 'מרפאה'] },
    'בילויים': { cat: 'פנאי ובילויים', keywords: ['בילויים', 'קולנוע', 'הופעות', 'כרטיסים', 'נטפליקס'] },
    'טיסות': { cat: 'חופשות וטיסות', keywords: ['טיסות', 'חופשה', 'מלון', 'booking', 'אל על'] },
  };

  for (const [key, val] of Object.entries(keywordMap)) {
    if (p.includes(key)) {
      if (!matchedCategories.includes(val.cat)) matchedCategories.push(val.cat);
      searchKeywords.push(...val.keywords);
    }
  }

  // Also check if any known database categories are explicitly mentioned
  for (const c of availableCategories) {
    if (p.includes(c.toLowerCase())) {
      if (!matchedCategories.includes(c)) matchedCategories.push(c);
    }
  }

  // 3. Detect Widget Type
  let widgetType = 'trend_bar';
  if (p.includes('השוואה') || p.includes('מול') || p.includes('לעומת')) {
    widgetType = 'comparison_dual_bar';
  } else if (p.includes('חודשים הכי עמוסים') || p.includes('הכי גבוה') || p.includes('שיא') || p.includes('דירוג')) {
    widgetType = 'peak_months_ranking';
  } else if (p.includes('התפלגות') || p.includes('עוגה') || p.includes('אחוזים')) {
    widgetType = 'category_pie';
  } else if (p.includes('ממוצע בלבד') || p.includes('מדדים') || p.includes('כרטיסים')) {
    widgetType = 'stat_metric_grid';
  }

  // 4. Day of week filter
  let dayOfWeek = 'all';
  if (p.includes('סופי שבוע') || p.includes('סופ״ש') || p.includes('שישי שבת')) {
    dayOfWeek = 'weekend';
  } else if (p.includes('אמצע שבוע') || p.includes('ימי חול')) {
    dayOfWeek = 'weekday';
  }

  // 5. Title & Subtitle
  const catLabel = matchedCategories.length > 0 ? matchedCategories.join(' ו') : 'הוצאות כלליות';
  const rangeLabel = months === 24 ? 'דו-שנתי (24 חודשים)' : months === 36 ? 'תלת-שנתי (36 חודשים)' : months === 6 ? 'חצי-שנתי (6 חודשים)' : `${months} חודשים`;

  return {
    title: `ניתוח ${catLabel} - ${rangeLabel}`,
    subtitle: `מבוסס על שאלתך: "${prompt}"`,
    widgetType,
    timeRangeMonths: months,
    categories: matchedCategories,
    searchKeywords: Array.from(new Set(searchKeywords)),
    dayOfWeek,
    transactionType: p.includes('הכנסות') && !p.includes('הוצאות') ? 'income' : 'expense',
    showAverageLine: true,
    showPeakMonths: true,
  };
}

/**
 * Use Gemini with fallback to compile prompt into query specification
 */
async function compilePromptWithAi(prompt, availableCategories, existingWidget) {
  const { geminiApiKey, enableAiAnalysis } = await getAiSettings();

  if (!enableAiAnalysis || !geminiApiKey) {
    return heuristicParseQuery(prompt, availableCategories);
  }

  const systemInstructions = `
אתה מתכנן מומחה לרכיבי סטטיסטיקה ודשבורדים פיננסיים אישיים (FinTrack AI Widget Compiler).
המשתמש מקליד בקשה בשפה חופשית בעברית עבור וידג'ט או ניתוח סטטיסטי שהוא רוצה לראות.
עליך לנתח את הבקשה ולהחזיר אך ורק JSON במבנה מדויק שמגדיר את אופן סינון הנתונים, הקיבוץ, וסוג הגרף.

רשימת הקטגוריות הקיימות במערכת:
${JSON.stringify(availableCategories)}

${existingWidget ? `המשתמש מבצע שינוי / תיקון על וידג'ט קיים: ${JSON.stringify(existingWidget.spec)}` : ''}

מבנה התשובה הנדרש (JSON בלבד ללא שום טקסט נוסף):
{
  "title": "כותרת קולעת בעברית לרכיב",
  "subtitle": "הסבר קצר על הטווח והסינון",
  "widgetType": "trend_bar" | "peak_months_ranking" | "comparison_dual_bar" | "category_pie" | "stat_metric_grid",
  "timeRangeMonths": 12 (מספר חודשים, למשל 6, 12, 24, 36),
  "categories": ["קטגוריה 1", "קטגוריה 2"],
  "searchKeywords": ["מילת חיפוש לתיאור בית עסק", "סונול", "וולט"],
  "dayOfWeek": "all" | "weekend" | "weekday",
  "transactionType": "expense" | "income" | "all",
  "showAverageLine": true,
  "showPeakMonths": true,
  "aiNotes": "הסבר מה הרכיב עושה"
}
`;

  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent([
      systemInstructions,
      `בקשת המשתמש:\n"${prompt}"`
    ]);

    let text = result.response.text().trim();
    if (text.startsWith('```json')) {
      text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (text.startsWith('```')) {
      text = text.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(text);
    return {
      title: parsed.title || `ניתוח נתונים מותאם אישית`,
      subtitle: parsed.subtitle || `טווח של ${parsed.timeRangeMonths || 12} חודשים`,
      widgetType: parsed.widgetType || 'trend_bar',
      timeRangeMonths: Math.min(Math.max(parseInt(parsed.timeRangeMonths, 10) || 12, 1), 60),
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      searchKeywords: Array.isArray(parsed.searchKeywords) ? parsed.searchKeywords : [],
      dayOfWeek: parsed.dayOfWeek || 'all',
      transactionType: parsed.transactionType || 'expense',
      showAverageLine: parsed.showAverageLine !== false,
      showPeakMonths: parsed.showPeakMonths !== false,
      aiNotes: parsed.aiNotes || '',
    };
  } catch (err) {
    console.warn('[AI-Widget-Service] Gemini query compile failed, falling back to heuristics:', err.message);
    return heuristicParseQuery(prompt, availableCategories);
  }
}

/**
 * Execute the compiled query against PostgreSQL transactions
 */
export async function generateAiWidgetData({ prompt, context, existingWidget }) {
  const availableCategories = await getAvailableCategories();
  const spec = await compilePromptWithAi(prompt, availableCategories, existingWidget);

  const startDay = await getSystemMonthStartDay(pool);
  const monthSql = getFinancialMonthSqlExpression(startDay, 't.date');

  // Build SQL filters
  const conditions = [
    't.is_ignored = false',
    '(t.is_cc_billing = false OR t.is_cc_billing IS NULL)',
    '(a.include_in_expenses IS NOT FALSE)',
    '(a.is_prepaid = false OR a.prepaid_mode != \'ignore_all\' OR a.prepaid_mode IS NULL)',
    `t.date >= (CURRENT_DATE - INTERVAL '${spec.timeRangeMonths + 2} months')`
  ];
  const values = [];

  // Transaction type filter
  if (spec.transactionType === 'income') {
    conditions.push(`(
      (c.type = 'income' OR (c.type IS NULL AND t.category IN ('משכורת', 'הכנסה', 'קצבה או מלגה', 'הכנסה מנכס', 'הכנסה מעסק', 'דיווידנדים ורווחים', 'הכנסות שונות', 'הכנסות'))) 
      AND t.amount > 0
    )`);
  } else if (spec.transactionType === 'expense') {
    conditions.push(`(
      t.amount < 0 
      OR (t.amount > 0 AND (c.type = 'expense' OR (c.type IS NULL AND t.category NOT IN ('משכורת', 'הכנסה', 'קצבה או מלגה', 'הכנסה מנכס', 'הכנסה מעסק', 'דיווידנדים ורווחים', 'הכנסות שונות', 'הכנסות', 'Salary', 'Income'))))
    )`);
  }

  // Day of week filter
  if (spec.dayOfWeek === 'weekend') {
    // In PostgreSQL EXTRACT(DOW FROM date): 5 is Friday, 6 is Saturday
    conditions.push(`EXTRACT(DOW FROM t.date) IN (5, 6)`);
  } else if (spec.dayOfWeek === 'weekday') {
    conditions.push(`EXTRACT(DOW FROM t.date) IN (0, 1, 2, 3, 4)`);
  }

  // Category or keyword match filter
  const filterOrParts = [];
  if (spec.categories && spec.categories.length > 0) {
    for (const cat of spec.categories) {
      values.push(`%${cat}%`);
      filterOrParts.push(`t.category ILIKE $${values.length}`);
    }
  }

  if (spec.searchKeywords && spec.searchKeywords.length > 0) {
    for (const kw of spec.searchKeywords) {
      values.push(`%${kw}%`);
      const idx = values.length;
      filterOrParts.push(`(t.merchant_name ILIKE $${idx} OR t.description ILIKE $${idx} OR t.user_description ILIKE $${idx})`);
    }
  }

  if (filterOrParts.length > 0) {
    conditions.push(`(${filterOrParts.join(' OR ')})`);
  }

  // Build exact financial month keys
  const monthLabels = [];
  const heMonths = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
  const currentBounds = getCurrentFinancialMonthBounds(startDay);
  let curYear = currentBounds.year;
  let curMonth = currentBounds.month;

  for (let i = 0; i < spec.timeRangeMonths; i++) {
    const bounds = getFinancialMonthBounds(curYear, curMonth, startDay);
    monthLabels.unshift({
      key: bounds.monthKey,
      label: `${heMonths[bounds.month - 1]} ${String(bounds.year).slice(2)}`,
      year: bounds.year,
      month: bounds.month,
      startDate: bounds.startDate,
      endDate: bounds.endDate,
    });
    curMonth -= 1;
    if (curMonth < 1) {
      curMonth = 12;
      curYear -= 1;
    }
  }

  // Query raw matching transactions to calculate aggregate & list
  const txQuery = `
    SELECT 
      t.id,
      t.date,
      ${monthSql} AS "monthKey",
      ABS(t.amount) AS "amount",
      t.amount AS "rawAmount",
      COALESCE(t.category, '') AS "category",
      COALESCE(NULLIF(t.merchant_name, ''), t.description, 'עסקה') AS "merchantName",
      COALESCE(t.user_description, '') AS "userDescription",
      COALESCE(t.description, '') AS "description",
      a.display_name AS "accountDisplayName",
      a.bank_company AS "bankCompany"
    FROM transactions t
    JOIN bank_accounts a ON t.account_id = a.id
    LEFT JOIN categories c ON (t.category = c.name OR t.category = c.name_en)
    WHERE ${conditions.join(' AND ')}
    ORDER BY t.date DESC
  `;

  const txRes = await pool.query(txQuery, values);
  const rows = txRes.rows;

  // Aggregate monthly amounts
  const monthSpendMap = {};
  const monthCountMap = {};
  let totalAmount = 0;

  for (const row of rows) {
    const amt = parseFloat(row.amount) || 0;
    const mKey = row.monthKey;
    monthSpendMap[mKey] = (monthSpendMap[mKey] || 0) + amt;
    monthCountMap[mKey] = (monthCountMap[mKey] || 0) + 1;
    totalAmount += amt;
  }

  // Distribution array corresponding to exact timeRangeMonths
  const distribution = monthLabels.map((m) => {
    const spend = Math.round((monthSpendMap[m.key] || 0) * 100) / 100;
    return {
      month: m.key,
      monthKey: m.key,
      label: m.label,
      amount: spend,
      txCount: monthCountMap[m.key] || 0,
    };
  });

  const monthlyAverage = Math.round((totalAmount / Math.max(spec.timeRangeMonths, 1)) * 100) / 100;

  // Rank busiest / peak months
  const peakMonthsRanking = [...distribution]
    .filter((d) => d.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((item, idx) => ({
      ...item,
      rank: idx + 1,
      diffFromAvgPercent: monthlyAverage > 0 ? Math.round(((item.amount - monthlyAverage) / monthlyAverage) * 100) : 0,
    }));

  const highestMonth = peakMonthsRanking[0] || null;
  const lowestMonth = [...distribution]
    .filter((d) => d.amount > 0)
    .sort((a, b) => a.amount - b.amount)[0] || null;

  // Clean top transactions
  const topTransactions = rows.slice(0, 10).map((r) => ({
    id: r.id,
    date: r.date,
    amount: parseFloat(r.amount),
    rawAmount: parseFloat(r.rawAmount),
    category: cleanSpacedHebrew(r.category),
    merchantName: cleanSpacedHebrew(r.merchantName),
    userDescription: cleanSpacedHebrew(r.userDescription),
    description: cleanSpacedHebrew(r.description),
    accountDisplayName: r.accountDisplayName,
    bankCompany: r.bankCompany,
  }));

  // Generate Hebrew commentary / insight
  let insightText = '';
  if (totalAmount > 0) {
    insightText = `במהלך ${spec.timeRangeMonths} החודשים שנבדקו, סך הכל הצטברו ₪${Math.round(totalAmount).toLocaleString('he-IL')} (${rows.length} עסקאות). הממוצע החודשי עומד על ₪${Math.round(monthlyAverage).toLocaleString('he-IL')}.`;
    if (highestMonth) {
      insightText += ` החודש העמוס ביותר היה ${highestMonth.label} עם סך של ₪${Math.round(highestMonth.amount).toLocaleString('he-IL')}`;
      if (highestMonth.diffFromAvgPercent > 0) {
        insightText += ` (${highestMonth.diffFromAvgPercent}% מעל הממוצע).`;
      } else {
        insightText += '.';
      }
    }
  } else {
    insightText = `לא נמצאו עסקאות תואמות בטווח של ${spec.timeRangeMonths} חודשים.`;
  }

  return {
    id: existingWidget?.id || `widget_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    prompt,
    createdAt: new Date().toISOString(),
    spec,
    data: {
      totalAmount: Math.round(totalAmount * 100) / 100,
      monthlyAverage,
      transactionCount: rows.length,
      timeRangeMonths: spec.timeRangeMonths,
      distribution,
      peakMonthsRanking,
      highestMonth,
      lowestMonth,
      topTransactions,
      insightText,
    },
  };
}
