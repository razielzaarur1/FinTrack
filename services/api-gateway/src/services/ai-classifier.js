import { GoogleGenerativeAI } from '@google/generative-ai';
import { pool } from '../db.js';
import { getAiSettings, getAvailableGeminiModels } from './ai-analyzer.js';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Smart AI Transaction Classifier
 *
 * 1. Fetches user's available category tree from the database
 * 2. Fetches past manual classifications by the user (few-shot context)
 * 3. Prompts Gemini to:
 *    - Extract and clean the true merchant / business name
 *    - Classify into the user's categories, respecting the user's personal classification habits
 */
export async function classifyWithAi({
  merchantName = '',
  description = '',
  rawCategory = '',
  amount = 0,
  currency = 'ILS',
  receiptVendor = '',
  receiptItems = [],
  userId = DEFAULT_USER_ID,
}) {
  const { geminiApiKey, enableAiAnalysis } = await getAiSettings();
  if (!enableAiAnalysis || !geminiApiKey) {
    return { success: false, reason: 'ai_not_configured' };
  }

  try {
    // 1. Fetch user's active categories
    const catRes = await pool.query(
      `SELECT name, name_en, type 
       FROM categories 
       WHERE user_id = $1 AND (is_active = true OR is_active IS NULL)
       ORDER BY sort_order ASC, name ASC`,
      [userId]
    );
    const availableCategories = catRes.rows.map((r) => r.name);
    if (availableCategories.length === 0) {
      return { success: false, reason: 'no_categories_defined' };
    }

    // 2. Fetch recent manual classifications by this user (few-shot learning context)
    const historyRes = await pool.query(
      `SELECT DISTINCT ON (LOWER(TRIM(t.merchant_name)))
         TRIM(t.merchant_name) AS merchant,
         TRIM(t.description) AS description,
         t.category,
         t.amount
       FROM transactions t
       JOIN bank_accounts b ON t.account_id = b.id
       WHERE b.user_id = $1
         AND t.is_manual_category = true
         AND t.category IS NOT NULL
         AND t.merchant_name IS NOT NULL
         AND TRIM(t.merchant_name) != ''
         AND TRIM(t.merchant_name) != 'בית עסק'
       ORDER BY LOWER(TRIM(t.merchant_name)), t.date DESC
       LIMIT 35`,
      [userId]
    );

    const userExamples = historyRes.rows.map(
      (r) => `"${r.merchant}" -> ${r.category} (${parseFloat(r.amount) < 0 ? 'הוצאה' : 'הכנסה'})`
    );

    const isExpense = amount < 0;
    const directionStr = isExpense ? 'הוצאה' : 'הכנסה';

    const itemsText = Array.isArray(receiptItems) && receiptItems.length > 0
      ? `\nפירוט פריטים שנרכשו מתוך הקבלה/חשבונית (התחשב בפריטים אלו כדי להבין בדיוק מה נרכש ולסווג לקטגוריה הנכונה ביותר!):\n` +
        receiptItems.slice(0, 25).map((it) => `- ${typeof it === 'string' ? it : ((it.name || it.description || 'פריט') + (it.price ? ` (₪${it.price})` : ''))}`).join('\n')
      : '';

    // 3. Build structured prompt
    const prompt = `אתה מנוע AI מומחה לזיהוי עסקים וסיווג תנועות פיננסיות בישראל עבור אפליקציית FinTrack.
עליך לנתח את התנועה הפיננסית הבאה, לזקק את שם בית העסק האמיתי, ולסווג אותה לקטגוריה המתאימה ביותר.

פרטי התנועה לסיווג:
- שם עסק גולמי: "${merchantName || 'לא צוין'}"
- תיאור / הערה: "${description || 'לא צוין'}"
${receiptVendor ? `- בית עסק שזוהה בקבלה: "${receiptVendor}"\n` : ''}- סכום וכיוון: ₪${Math.abs(amount).toFixed(2)} (${directionStr})
- קטגוריית מקור מבנק/אשראי: "${rawCategory || 'ללא'}"${itemsText}

רשימת הקטגוריות המותרות לבחירה (בחר אך ורק מתוכן!):
${JSON.stringify(availableCategories, null, 2)}

${userExamples.length > 0 ? `דוגמאות לסיווגים ידניים שהמשתמש ביצע בעבר (התחשב בהעדפותיו האישיות!):
${userExamples.join('\n')}` : ''}

הנחיות:
1. "cleanMerchant": זקק את שם בית העסק המדויק, הנקי והמוכר ללא מספרי סניפים, קודי מערכת, "הוראת קבע", "עסקה ב..", "ביט -" וכדומה (לדוגמה: "שופרסל דיל סניף 120" -> "שופרסל", "הוראת קבע הוט נט בעמ" -> "הוט").
2. "category": בחר קטגוריה מדויקת אך ורק מתוך "רשימת הקטגוריות המותרות לבחירה".
3. "confidence": מספר בין 0.0 ל-1.0 המבטא את רמת הביטחון בסיווג.
4. "rationale": הסבר קצר בעברית של משפט אחד למה נבחרה הקטגוריה.

החזר תשובה אך ורק במבנה JSON תקני:
{
  "cleanMerchant": "שם העסק הנקי",
  "category": "שם הקטגוריה שנבחרה",
  "confidence": 0.95,
  "rationale": "הסבר קצר"
}`;

    // 4. Call Gemini with dynamic models fallback
    const dynamicModels = await getAvailableGeminiModels(geminiApiKey);
    const modelsToTry = dynamicModels.length > 0
      ? dynamicModels
      : ['gemini-1.5-flash-002', 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        });

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const parsed = JSON.parse(text);

        if (parsed && parsed.category) {
          // Verify category exists in allowed categories (or find best match)
          let matchedCategory = availableCategories.find(
            (c) => c.trim().toLowerCase() === parsed.category.trim().toLowerCase()
          );

          if (!matchedCategory) {
            matchedCategory = availableCategories.find(
              (c) => parsed.category.includes(c) || c.includes(parsed.category)
            );
          }

          if (matchedCategory) {
            return {
              success: true,
              cleanMerchant: parsed.cleanMerchant || merchantName,
              category: matchedCategory,
              confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
              rationale: parsed.rationale || '',
              modelUsed: modelName,
            };
          }
        }
      } catch (genErr) {
        lastError = genErr;
      }
    }

    return { success: false, reason: lastError?.message || 'generation_failed' };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}
