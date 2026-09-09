/**
 * Credit Card / Scraper Hebrew Category Mapping
 */
export const CREDIT_CARD_CATEGORY_MAP = [
  { match: /(מזון|רשתות שיווק|סופרמרקט|מרכול|מכולת|פירות וירקות)/i, main: 'עושים קניות', sub: 'סופר ומכולת' },
  { match: /(מסעדות|מזון מהיר|בתי קפה|פאבים|ברים|מזנונים)/i, main: 'אוכלים בחוץ', sub: 'מסעדות ופאבים' },
  { match: /(דלק|תחנות דלק|תחבורה|הסעות|מוניות|רכבת)/i, main: 'רכב ותחבורה', sub: 'דלק וטעינה' },
  { match: /(חניה|חניונים)/i, main: 'רכב ותחבורה', sub: 'חנייה' },
  { match: /(כבישי אגרה|אגרה)/i, main: 'רכב ותחבורה', sub: 'כבישי אגרה' },
  { match: /(הלבשה|הנעלה|אופנה|ביגוד|טקסטיל)/i, main: 'עושים קניות', sub: 'בגדים והנעלה' },
  { match: /(אלקטרוניקה|חשמל|מחשבים|תקשורת וסלולר)/i, main: 'עושים קניות', sub: 'אלקטרוניקה' },
  { match: /(ריהוט|עיצוב הבית|עשה זאת בעצמך|חומרי בניין)/i, main: 'עושים קניות', sub: 'ריהוט לבית' },
  { match: /(פארם|בתי מרקחת|רפואה|רופאים|מרפאות|אופטיקה|שיניים)/i, main: 'בריאות וטיפוח', sub: 'בתי מרקחת' },
  { match: /(קוסמטיקה|יופי|מספרות|ספא)/i, main: 'בריאות וטיפוח', sub: 'טיפולי יופי' },
  { match: /(כושר|ספורט|מכוני כושר)/i, main: 'בריאות וטיפוח', sub: 'כושר' },
  { match: /(תקשורת|טלפוניה|אינטרנט|טלוויזיה|כבלים|לוויין)/i, main: 'משק בית', sub: 'טלפון ואינטרנט' },
  { match: /(חשמל|גז|מים|ארנונה|עיריות)/i, main: 'משק בית', sub: 'חשמל' },
  { match: /(ביטוח|סוכנויות ביטוח)/i, main: 'בריאות וטיפוח', sub: 'ביטוחי בריאות' },
  { match: /(פנאי|בידור|קולנוע|כרטיסים|מופעים|תיאטרון)/i, main: 'פנאי ותרבות', sub: 'הופעות וקולנוע' },
  { match: /(תיירות|מלונות|נופש|טיסות|סוכנויות נסיעות)/i, main: 'חופשות וטיולים', sub: 'טיסות' },
  { match: /(בנקים|עמלות|הלוואות|ריבית)/i, main: 'שירותים פיננסיים', sub: 'עמלות' },
  { match: /(משכורת|שכר|העברת שכר)/i, main: 'משכורת', sub: 'משכורת' },
  { match: /(קצבה|ביטוח לאומי|מלגה)/i, main: 'קצבה או מלגה', sub: 'קצבה או מלגה' },
];

/**
 * Broad Israeli Merchant Knowledge Base & Keyword Rules
 */
export const ISRAELI_MERCHANTS_KB = [
  { regex: /(שופרסל|רמי לוי|יוחננוף|טיב טעם|ויקטורי|יינות ביתן|מחסני השוק|קרפור|קינג סטור|פרשמרקט|am:pm|am-pm|מעדניית|מינימרקט|סופר |צרכניית|shufersal|rami levy|carrefour)/i, main: 'עושים קניות', sub: 'סופר ומכולת' },
  { regex: /(wolt|וולט|מקדונלד|מקדונלדס|mcdonald|ארומה|aroma|גולדה|golda|פיצה|pizza|בורגר|burger|bbd|ראנץ|גרג|rebar|ריבר|לנדוור|קפה|גלידה|סושי|sushi|חומוס|פלאפל|falafel|שווארמה|שיפודי|קונדיטוריה|מאפיית|טאבון|מסעדת|ברקוד|פאב|ביסטרו|דומינוס)/i, main: 'אוכלים בחוץ', sub: 'מסעדות ופאבים' },
  { regex: /(פז|yellow|יילו|סונול|sonol|דור אלון|dor alon|דור-אלון|דלק|delek|טן|ten|סדש|מיקה|תחנת דלק|סונול|פזומט|דלקן)/i, main: 'רכב ותחבורה', sub: 'דלק וטעינה' },
  { regex: /(פנגו|pango|סלופארק|cellopark|חניון|חניוני|מנאייק)/i, main: 'רכב ותחבורה', sub: 'חנייה' },
  { regex: /(כביש 6|כביש שש|דרך ארץ|fastlane|נתיב מהיר|מנהרות הכרמל|חוצה צפון)/i, main: 'רכב ותחבורה', sub: 'כבישי אגרה' },
  { regex: /(רב קו|רב-קו|rav kav|אגד|דן|רכבת ישראל|קווים|מטרופולין|סופרבוס|אלקטרה אפיקים)/i, main: 'רכב ותחבורה', sub: 'תחבורה ציבורית' },
  { regex: /(מוסך|צמיגי|טסט|רישוי|אוטו דיפו|שטיפת רכב)/i, main: 'רכב ותחבורה', sub: 'מוסך ואחזקה' },
  { regex: /(סופר פארם|סופר-פארם|סופרפארם|super pharm|super-pharm|be פארם|ניו פארם|בית מרקחת|מכבי|כללית|מאוחדת|לאומית|קופת חולים|אסותא)/i, main: 'בריאות וטיפוח', sub: 'בתי מרקחת' },
  { regex: /(אופטיקה|הלפרין|קרולינה למקה|אופטיקנה|אפולו)/i, main: 'בריאות וטיפוח', sub: 'אופטיקה' },
  { regex: /(הולמס פלייס|קאנטרי|גרייט שייפ|ספייס|חדר כושר|מכון כושר|יוגה|פילאטיס)/i, main: 'בריאות וטיפוח', sub: 'כושר' },
  { regex: /(זארה|zara|קסטרו|castro|פוקס|fox|h&m|pull&bear|pull and bear|bershka|ברשקה|mango|מנגו|רנואר|renuar|טרמינל x|terminal x|שיאין|shein|אסוס|asos|נייקי|nike|אדידס|adidas|פוט לוקר|foot locker|דלתא|delta|הודיס|hoodies|עדיקה|טוונטי פור סבן|קסטרו)/i, main: 'עושים קניות', sub: 'בגדים והנעלה' },
  { regex: /(ksp|קיי אס פי|קיי.אס.פי|איבורי|אייבורי|ivory|באג|bug|מחסני חשמל|שקם אלקטריק|איידיגיטל|idigital|אפל|apple|סמסונג|samsung|עולם הקולנוע)/i, main: 'עושים קניות', sub: 'אלקטרוניקה' },
  { regex: /(איקאה|ikea|הום סנטר|אייס|ace|כתר|טמבור|שזף)/i, main: 'עושים קניות', sub: 'ריהוט לבית' },
  { regex: /(סלקום|cellcom|פרטנר|partner|בזק|bezeq|בזק בינלאומי|הוט|hot|יס|yes|סטינג|sting|נקסט|next tv|wecom|019|012|גולן טלקום|golan)/i, main: 'משק בית', sub: 'טלפון ואינטרנט' },
  { regex: /(חברת החשמל|חשמל ישיר|חח\"י|מי אביבים|הגיחון|מי כרמל|מי תמר|מי שבע|מי שיקמה|ארנונה|עיריית|מועצה אזורית|מועצה מקומית)/i, main: 'משק בית', sub: 'חשמל' },
  { regex: /(פזגז|אמישראגז|סופרגז|דורגז)/i, main: 'משק בית', sub: 'גז והסקה' },
  { regex: /(נטפליקס|netflix|ספוטיפיי|spotify|סינמה סיטי|cinema city|יס פלאנט|yes planet|הוט סינמה|לב תל אביב|זאפה|בראבו|אירוע|כרטיסים|ticket)/i, main: 'פנאי ותרבות', sub: 'הופעות וקולנוע' },
  { regex: /(אל על|el al|ארקיע|ישראייר|ryanair|wizz|booking|בוקינג|airbnb|פתאל|ישרוטל|דן מלונות|אטלס מלונות)/i, main: 'חופשות וטיולים', sub: 'טיסות' },
  { regex: /(ביט|bit|פייבוקס|paybox|pepper|פפר)/i, main: 'שירותים פיננסיים', sub: 'עמלות' },
];

export function isCashWithdrawal(merchantName = '', description = '') {
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

export async function classifyScrapedTx(client, {
  userId = '00000000-0000-0000-0000-000000000001',
  merchantName = '',
  description = '',
  rawCategory = '',
  amount = 0,
}) {
  const cleanMerchant = (merchantName || '').trim();
  const cleanDesc = (description || '').trim();
  const searchString = `${cleanMerchant} ${cleanDesc}`.trim();

  if (isCashWithdrawal(cleanMerchant, cleanDesc)) {
    return 'משיכת מזומן';
  }

  // 1. User rules
  if (cleanMerchant && client) {
    try {
      const exactRule = await client.query(
        `SELECT sub_category, category FROM user_category_rules WHERE user_id = $1 AND LOWER(merchant_pattern) = LOWER($2) LIMIT 1`,
        [userId, cleanMerchant]
      );
      if (exactRule.rows.length > 0) {
        return exactRule.rows[0].sub_category || exactRule.rows[0].category;
      }

      const containsRule = await client.query(
        `SELECT sub_category, category, merchant_pattern FROM user_category_rules WHERE user_id = $1 AND match_type = 'contains'`,
        [userId]
      );
      for (const r of containsRule.rows) {
        if (cleanMerchant.toLowerCase().includes(r.merchant_pattern.toLowerCase())) {
          return r.sub_category || r.category;
        }
      }
    } catch {
      // Ignore rule query errors during scrape
    }
  }

  // 2. Card Category
  if (rawCategory && typeof rawCategory === 'string' && rawCategory.trim()) {
    const cleanRaw = rawCategory.trim();
    for (const mapping of CREDIT_CARD_CATEGORY_MAP) {
      if (mapping.match.test(cleanRaw)) {
        return mapping.sub || mapping.main;
      }
    }
  }

  // 3. Israeli Merchant KB
  for (const entry of ISRAELI_MERCHANTS_KB) {
    if (entry.regex.test(searchString)) {
      return entry.sub || entry.main;
    }
  }

  // 4. Default
  if (amount > 0) return 'הכנסות שונות';
  return 'ללא סיווג';
}
