import { pool } from '../db.js';

/**
 * 2. Credit Card / Scraper Hebrew Category Mapping
 */
export const CREDIT_CARD_CATEGORY_MAP = [
  // Supermarkets & Groceries
  { match: /(מזון|רשתות שיווק|סופרמרקט|מרכול|מכולת|פירות וירקות)/i, main: 'עושים קניות', sub: 'סופר ומכולת' },
  // Dining & Restaurants
  { match: /(מסעדות|מזון מהיר|בתי קפה|פאבים|ברים|מזנונים)/i, main: 'אוכלים בחוץ', sub: 'מסעדות ופאבים' },
  // Fuel & Transport
  { match: /(דלק|תחנות דלק|תחבורה|הסעות|מוניות|רכבת)/i, main: 'רכב ותחבורה', sub: 'דלק וטעינה' },
  { match: /(חניה|חניונים)/i, main: 'רכב ותחבורה', sub: 'חנייה' },
  { match: /(כבישי אגרה|אגרה)/i, main: 'רכב ותחבורה', sub: 'כבישי אגרה' },
  // Clothing & Shopping
  { match: /(הלבשה|הנעלה|אופנה|ביגוד|טקסטיל)/i, main: 'עושים קניות', sub: 'בגדים והנעלה' },
  { match: /(אלקטרוניקה|חשמל|מחשבים|תקשורת וסלולר)/i, main: 'עושים קניות', sub: 'אלקטרוניקה' },
  { match: /(ריהוט|עיצוב הבית|עשה זאת בעצמך|חומרי בניין)/i, main: 'עושים קניות', sub: 'ריהוט לבית' },
  // Health & Pharma
  { match: /(פארם|בתי מרקחת|רפואה|רופאים|מרפאות|אופטיקה|שיניים)/i, main: 'בריאות וטיפוח', sub: 'בתי מרקחת' },
  { match: /(קוסמטיקה|יופי|מספרות|ספא)/i, main: 'בריאות וטיפוח', sub: 'טיפולי יופי' },
  { match: /(כושר|ספורט|מכוני כושר)/i, main: 'בריאות וטיפוח', sub: 'כושר' },
  // Utilities & Housing
  { match: /(תקשורת|טלפוניה|אינטרנט|טלוויזיה|כבלים|לוויין)/i, main: 'משק בית', sub: 'טלפון ואינטרנט' },
  { match: /(חשמל|גז|מים|ארנונה|עיריות)/i, main: 'משק בית', sub: 'חשמל' },
  { match: /(ביטוח|סוכנויות ביטוח)/i, main: 'בריאות וטיפוח', sub: 'ביטוחי בריאות' },
  // Leisure & Travel
  { match: /(פנאי|בידור|קולנוע|כרטיסים|מופעים|תיאטרון)/i, main: 'פנאי ותרבות', sub: 'הופעות וקולנוע' },
  { match: /(תיירות|מלונות|נופש|טיסות|סוכנויות נסיעות)/i, main: 'חופשות וטיולים', sub: 'טיסות' },
  // Financial
  { match: /(בנקים|עמלות|הלוואות|ריבית)/i, main: 'שירותים פיננסיים', sub: 'עמלות' },
  // Income
  { match: /(משכורת|שכר|העברת שכר)/i, main: 'משכורת', sub: 'משכורת' },
  { match: /(קצבה|ביטוח לאומי|מלגה)/i, main: 'קצבה או מלגה', sub: 'קצבה או מלגה' },
];

/**
 * 3. Broad Israeli Merchant Knowledge Base & Keyword Rules
 */
export const ISRAELI_MERCHANTS_KB = [
  // Supermarkets & Groceries
  { regex: /(שופרסל|רמי לוי|יוחננוף|טיב טעם|ויקטורי|יינות ביתן|מחסני השוק|קרפור|קינג סטור|פרשמרקט|am:pm|am-pm|מעדניית|מינימרקט|סופר |צרכניית|shufersal|rami levy|carrefour)/i, main: 'עושים קניות', sub: 'סופר ומכולת' },
  // Food & Dining / Delivery
  { regex: /(wolt|וולט|מקדונלד|מקדונלדס|mcdonald|ארומה|aroma|גולדה|golda|פיצה|pizza|בורגר|burger|bbd|ראנץ|גרג|rebar|ריבר|לנדוור|קפה|גלידה|סושי|sushi|חומוס|פלאפל|falafel|שווארמה|שיפודי|קונדיטוריה|מאפיית|טאבון|מסעדת|ברקוד|פאב|ביסטרו|דומינוס)/i, main: 'אוכלים בחוץ', sub: 'מסעדות ופאבים' },
  // Fuel, Parking & Transport
  { regex: /(פז|yellow|יילו|סונול|sonol|דור אלון|dor alon|דור-אלון|דלק|delek|טן|ten|סדש|מיקה|תחנת דלק|סונול|פזומט|דלקן)/i, main: 'רכב ותחבורה', sub: 'דלק וטעינה' },
  { regex: /(פנגו|pango|סלופארק|cellopark|חניון|חניוני|מנאייק)/i, main: 'רכב ותחבורה', sub: 'חנייה' },
  { regex: /(כביש 6|כביש שש|דרך ארץ|fastlane|נתיב מהיר|מנהרות הכרמל|חוצה צפון)/i, main: 'רכב ותחבורה', sub: 'כבישי אגרה' },
  { regex: /(רב קו|רב-קו|rav kav|אגד|דן|רכבת ישראל|קווים|מטרופולין|סופרבוס|אלקטרה אפיקים)/i, main: 'רכב ותחבורה', sub: 'תחבורה ציבורית' },
  { regex: /(מוסך|צמיגי|טסט|רישוי|אוטו דיפו|שטיפת רכב)/i, main: 'רכב ותחבורה', sub: 'מוסך ואחזקה' },
  // Health & Pharma
  { regex: /(סופר פארם|סופר-פארם|סופרפארם|super pharm|super-pharm|be פארם|ניו פארם|בית מרקחת|מכבי|כללית|מאוחדת|לאומית|קופת חולים|אסותא)/i, main: 'בריאות וטיפוח', sub: 'בתי מרקחת' },
  { regex: /(אופטיקה|הלפרין|קרולינה למקה|אופטיקנה|אפולו)/i, main: 'בריאות וטיפוח', sub: 'אופטיקה' },
  { regex: /(הולמס פלייס|קאנטרי|גרייט שייפ|ספייס|חדר כושר|מכון כושר|יוגה|פילאטיס)/i, main: 'בריאות וטיפוח', sub: 'כושר' },
  // Clothing & Footwear
  { regex: /(זארה|zara|קסטרו|castro|פוקס|fox|h&m|pull&bear|pull and bear|bershka|ברשקה|mango|מנגו|רנואר|renuar|טרמינל x|terminal x|שיאין|shein|אסוס|asos|נייקי|nike|אדידס|adidas|פוט לוקר|foot locker|דלתא|delta|הודיס|hoodies|עדיקה|טוונטי פור סבן|קסטרו)/i, main: 'עושים קניות', sub: 'בגדים והנעלה' },
  // Electronics & Gadgets
  { regex: /(ksp|קיי אס פי|קיי.אס.פי|איבורי|אייבורי|ivory|באג|bug|מחסני חשמל|שקם אלקטריק|איידיגיטל|idigital|אפל|apple|סמסונג|samsung|עולם הקולנוע)/i, main: 'עושים קניות', sub: 'אלקטרוניקה' },
  // Household, Telecom & Utilities
  { regex: /(איקאה|ikea|הום סנטר|אייס|ace|כתר|טמבור|שזף)/i, main: 'עושים קניות', sub: 'ריהוט לבית' },
  { regex: /(סלקום|cellcom|פרטנר|partner|בזק|bezeq|בזק בינלאומי|הוט|hot|יס|yes|סטינג|sting|נקסט|next tv|wecom|019|012|גולן טלקום|golan)/i, main: 'משק בית', sub: 'טלפון ואינטרנט' },
  { regex: /(חברת החשמל|חשמל ישיר|חח\"י|מי אביבים|הגיחון|מי כרמל|מי תמר|מי שבע|מי שיקמה|ארנונה|עיריית|מועצה אזורית|מועצה מקומית)/i, main: 'משק בית', sub: 'חשמל' },
  { regex: /(פזגז|אמישראגז|סופרגז|דורגז)/i, main: 'משק בית', sub: 'גז והסקה' },
  // Entertainment & Streaming
  { regex: /(נטפליקס|netflix|ספוטיפיי|spotify|סינמה סיטי|cinema city|יס פלאנט|yes planet|הוט סינמה|לב תל אביב|זאפה|בראבו|אירוע|כרטיסים|ticket)/i, main: 'פנאי ותרבות', sub: 'הופעות וקולנוע' },
  // Travel & Hotels
  { regex: /(אל על|el al|ארקיע|ישראייר|ryanair|wizz|booking|בוקינג|airbnb|פתאל|ישרוטל|דן מלונות|אטלס מלונות)/i, main: 'חופשות וטיולים', sub: 'טיסות' },
  // Finance & Transfers
  { regex: /(ביט|bit|פייבוקס|paybox|pepper|פפר)/i, main: 'שירותים פיננסיים', sub: 'עמלות' },
];

/**
 * Checks if a transaction represents an ATM / Cash withdrawal
 */
export function isCashWithdrawalTransaction(merchantName = '', description = '') {
  const text = `${merchantName} ${description}`.toLowerCase();
  return (
    text.includes('משיכת מזומן') ||
    text.includes('משיכת מזומנים') ||
    text.includes('משיכה מכספומט') ||
    text.includes('כספומט') ||
    text.includes('atm withdrawal') ||
    text.includes('cash withdrawal')
  );
}

/**
 * Hierarchical Classifier Engine:
 * 1. User learned rules (highest priority)
 * 2. Credit Card / Bank scraped category
 * 3. Israeli Merchant Knowledge Base & Keyword matching
 * 4. Fallback default
 */
export async function classifyTransaction({
  userId = '00000000-0000-0000-0000-000000000001',
  merchantName = '',
  description = '',
  rawCategory = '',
  amount = 0,
}) {
  const cleanMerchant = (merchantName || '').trim();
  const cleanDesc = (description || '').trim();
  const searchString = `${cleanMerchant} ${cleanDesc}`.trim();

  // Special check: Cash Withdrawal
  if (isCashWithdrawalTransaction(cleanMerchant, cleanDesc)) {
    return {
      category: 'משיכת מזומן',
      subCategory: 'משיכת מזומן',
      source: 'cash_withdrawal_detector',
      isCashWithdrawal: true,
      needsAction: true,
    };
  }

  // --- 1. USER RULES (Highest Priority) ---
  if (cleanMerchant) {
    try {
      // Check exact match first
      const exactRuleRes = await pool.query(
        `SELECT category, sub_category AS "subCategory"
         FROM user_category_rules
         WHERE user_id = $1 AND LOWER(merchant_pattern) = LOWER($2)
         ORDER BY updated_at DESC
         LIMIT 1`,
        [userId, cleanMerchant]
      );

      if (exactRuleRes.rows.length > 0) {
        return {
          category: exactRuleRes.rows[0].category,
          subCategory: exactRuleRes.rows[0].subCategory || exactRuleRes.rows[0].category,
          source: 'user_rule_exact',
          isCashWithdrawal: false,
        };
      }

      // Check substring / contains match
      const containsRuleRes = await pool.query(
        `SELECT category, sub_category AS "subCategory", merchant_pattern
         FROM user_category_rules
         WHERE user_id = $1 AND match_type = 'contains'
         ORDER BY LENGTH(merchant_pattern) DESC, updated_at DESC`,
        [userId]
      );

      for (const rule of containsRuleRes.rows) {
        if (cleanMerchant.toLowerCase().includes(rule.merchant_pattern.toLowerCase())) {
          return {
            category: rule.category,
            subCategory: rule.subCategory || rule.category,
            source: 'user_rule_contains',
            isCashWithdrawal: false,
          };
        }
      }
    } catch (err) {
      console.warn('[Classifier] Error querying user_category_rules:', err.message);
    }
  }

  // --- 2. CREDIT CARD / SCRAPER CATEGORY ---
  if (rawCategory && typeof rawCategory === 'string' && rawCategory.trim()) {
    const cleanRaw = rawCategory.trim();
    for (const mapping of CREDIT_CARD_CATEGORY_MAP) {
      if (mapping.match.test(cleanRaw)) {
        return {
          category: mapping.main,
          subCategory: mapping.sub,
          source: 'card_category_mapping',
          isCashWithdrawal: false,
        };
      }
    }
  }

  // --- 3. ISRAELI MERCHANT KNOWLEDGE BASE & KEYWORDS ---
  for (const entry of ISRAELI_MERCHANTS_KB) {
    if (entry.regex.test(searchString)) {
      return {
        category: entry.main,
        subCategory: entry.sub,
        source: 'merchant_kb',
        isCashWithdrawal: false,
      };
    }
  }

  // --- 4. FALLBACK DEFAULT ---
  if (amount > 0) {
    return {
      category: 'משכורת',
      subCategory: 'הכנסות שונות',
      source: 'default_income',
      isCashWithdrawal: false,
    };
  }

  return {
    category: 'שונות',
    subCategory: 'ללא סיווג',
    source: 'default_expense',
    isCashWithdrawal: false,
  };
}

/**
 * Saves or updates a user learning classification rule.
 */
export async function saveUserRule({
  userId = '00000000-0000-0000-0000-000000000001',
  merchantPattern,
  category,
  subCategory = null,
  matchType = 'exact',
}) {
  if (!merchantPattern || !category) return null;
  const cleanPattern = merchantPattern.trim();

  const query = `
    INSERT INTO user_category_rules (user_id, merchant_pattern, category, sub_category, match_type, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (user_id, merchant_pattern)
    DO UPDATE SET 
      category = EXCLUDED.category,
      sub_category = EXCLUDED.sub_category,
      match_type = EXCLUDED.match_type,
      updated_at = NOW()
    RETURNING id, user_id, merchant_pattern AS "merchantPattern", category, sub_category AS "subCategory", match_type AS "matchType";
  `;

  const res = await pool.query(query, [userId, cleanPattern, category, subCategory || category, matchType]);
  return res.rows[0];
}

/**
 * Reclassifies all past transactions according to current rules and knowledge base.
 */
export async function reclassifyAllTransactions(userId = '00000000-0000-0000-0000-000000000001') {
  const txQuery = `
    SELECT t.id, t.merchant_name, t.description, t.amount, t.raw_data->>'category' AS raw_category
    FROM transactions t
    JOIN bank_accounts a ON t.account_id = a.id
    WHERE a.user_id = $1 AND t.is_manual_category = false
  `;
  const result = await pool.query(txQuery, [userId]);
  let updatedCount = 0;

  for (const tx of result.rows) {
    const classification = await classifyTransaction({
      userId,
      merchantName: tx.merchant_name,
      description: tx.description,
      rawCategory: tx.raw_category,
      amount: parseFloat(tx.amount),
    });

    if (classification.category) {
      const chosenCat = classification.subCategory || classification.category;
      await pool.query(
        `UPDATE transactions SET category = $1 WHERE id = $2`,
        [chosenCat, tx.id]
      );
      updatedCount++;
    }
  }

  return { total: result.rows.length, updated: updatedCount };
}
