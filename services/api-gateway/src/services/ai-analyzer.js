import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { pool } from '../db.js';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

const CANDIDATE_MODELS = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-2.0-flash',
  'gemini-2.0-flash-exp',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
  'gemini-1.5-pro-latest',
  'gemini-pro'
];

/**
 * Retrieve Gemini settings (API Key & Enabled status) from system_settings or env
 */
export async function getAiSettings() {
  let geminiApiKey = process.env.GEMINI_API_KEY || '';
  let enableAiAnalysis = true;

  try {
    const res = await pool.query(
      `SELECT settings FROM system_settings WHERE user_id = $1`,
      [DEFAULT_USER_ID]
    );
    if (res.rows.length > 0 && res.rows[0].settings) {
      const s = res.rows[0].settings;
      if (s.geminiApiKey !== undefined && s.geminiApiKey.trim() !== '') {
        geminiApiKey = s.geminiApiKey.trim();
      }
      if (s.enableAiAnalysis !== undefined) {
        enableAiAnalysis = Boolean(s.enableAiAnalysis);
      }
    }
  } catch (err) {
    console.warn('[AI-Analyzer] Could not load system_settings for AI:', err.message);
  }

  return {
    geminiApiKey,
    enableAiAnalysis: enableAiAnalysis && Boolean(geminiApiKey),
  };
}

/**
 * Fetch existing categories from the database so the AI knows available categories
 */
export async function getAvailableCategories() {
  try {
    const res = await pool.query(
      `SELECT name FROM categories WHERE user_id = $1 ORDER BY name ASC`,
      [DEFAULT_USER_ID]
    );
    if (res.rows.length > 0) {
      return res.rows.map((r) => r.name);
    }
  } catch (err) {
    console.warn('[AI-Analyzer] Could not load categories:', err.message);
  }
  return [
    'סופר ומכולת',
    'מסעדות ופאבים',
    'משק בית',
    'רכב ותחבורה',
    'בריאות וטיפוח',
    'עושים קניות',
    'אלקטרוניקה',
    'פנאי ותרבות',
    'משפחה והשכלה',
    'שירותים עיסקיים',
    'אחר'
  ];
}

/**
 * Execute generateContent with automatic model fallback
 */
async function generateWithFallback(genAI, contents, generationConfig = {}) {
  let lastError = null;

  for (const modelName of CANDIDATE_MODELS) {
    try {
      const config = {
        model: modelName,
      };
      if (generationConfig.responseMimeType) {
        config.generationConfig = generationConfig;
      }
      
      const model = genAI.getGenerativeModel(config);
      const result = await model.generateContent(contents);
      const text = result.response.text();
      return { text, modelName };
    } catch (err) {
      lastError = err;
      const errMsg = String(err.message || '');
      // If 404 or unsupported model for this API key/version, try next candidate
      if (errMsg.includes('404') || errMsg.includes('not found') || errMsg.includes('not supported') || err.status === 404) {
        console.warn(`[AI-Analyzer] Model '${modelName}' not available (${errMsg.slice(0, 120)}), trying next candidate...`);
        continue;
      }
      // If invalid API key or auth error, throw immediately
      throw err;
    }
  }

  throw lastError || new Error('כל דגמי Gemini שנבדקו לא היו זמינים עבור מפתח זה.');
}

/**
 * Test a Gemini API Key
 */
export async function testGeminiApiKey(keyToTest) {
  const apiKey = keyToTest || (await getAiSettings()).geminiApiKey;
  if (!apiKey) {
    throw new Error('לא הוזן מפתח API של Gemini');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const { text, modelName } = await generateWithFallback(genAI, 'שלום, ענה במילה אחת בלבד: פועל.');
  return { success: true, response: text.trim(), model: modelName };
}

/**
 * Analyze an image or PDF buffer using Gemini with automatic model fallback
 */
export async function analyzeReceiptFile(fileBuffer, mimeType, originalName = '') {
  const { geminiApiKey, enableAiAnalysis } = await getAiSettings();

  if (!enableAiAnalysis || !geminiApiKey) {
    return {
      ai_analyzed: false,
      message: 'ניתוח AI מושבת או שחסר מפתח API של Gemini בהגדרות.',
      extracted_data: { vendor: null, total: null, items: [] }
    };
  }

  const categories = await getAvailableCategories();
  const genAI = new GoogleGenerativeAI(geminiApiKey);

  const prompt = `
אתה מנתח חשבוניות וקבלות מומחה עבור אפליקציית ניהול פיננסי אישי (FinTrack).
נתח את תמונת החשבונית/הקבלה המצורפת וחלץ את כל המידע האפשרי במבנה JSON מדויק.

הנה רשימת הקטגוריות הקיימות במערכת של המשתמש:
${JSON.stringify(categories)}

הוראות:
1. vendor: שם בית העסק בעברית/אנגלית כפי שמופיע בחשבונית.
2. total: הסכום הכולל לתשלום כמספר (float/number).
3. date: תאריך העסקה/החשבונית בפורמט YYYY-MM-DD. אם לא ידוע, החזר null.
4. invoice_number: מספר החשבונית/הקבלה (string).
5. tax_amount: סכום המע"מ כמספר (אם מופיע), אחרת null.
6. currency: מטבע, לרוב 'ILS'.
7. items: מערך של כל הפריטים/השורות בחשבונית. לכל פריט:
   - name: שם המוצר/הפריט
   - qty: כמות (מספר, ברירת מחדל 1)
   - price: סכום כולל לפריט זה (כמות * מחיר יחידה, כמספר)
   - category: הקטגוריה המתאימה ביותר לפריט מתוך רשימת הקטגוריות שסופקה למעלה. אם לא ברור, בחר 'סופר ומכולת' לקניות מזון או 'עושים קניות'.
8. confidence: מספר בין 0.0 ל-1.0 המעיד על רמת הביטחון בקריאת החשבונית.

החזר אך ורק JSON תקין במבנה הבא:
{
  "vendor": "שם העסק",
  "total": 123.45,
  "date": "2026-05-20",
  "invoice_number": "123456",
  "tax_amount": 17.50,
  "currency": "ILS",
  "confidence": 0.95,
  "items": [
    {
      "name": "חלב 3%",
      "qty": 2,
      "price": 14.20,
      "category": "סופר ומכולת"
    }
  ]
}
`;

  try {
    const part = {
      inlineData: {
        data: fileBuffer.toString('base64'),
        mimeType: mimeType === 'application/pdf' ? 'application/pdf' : mimeType,
      },
    };

    const { text, modelName } = await generateWithFallback(genAI, [prompt, part], {
      responseMimeType: 'application/json'
    });

    let cleanJson = text.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    const parsed = JSON.parse(cleanJson);

    return {
      ai_analyzed: true,
      ai_provider: `gemini (${modelName})`,
      extracted_data: parsed,
      raw_text: text,
    };
  } catch (err) {
    console.error('[AI-Analyzer] Error analyzing receipt file:', err);
    return {
      ai_analyzed: false,
      error: err.message,
      extracted_data: {
        vendor: null,
        total: null,
        items: []
      }
    };
  }
}

/**
 * Analyze a digital receipt URL (e.g. Rami Levy digital receipts, Shufersal, etc.)
 */
export async function analyzeReceiptUrl(url) {
  const { geminiApiKey, enableAiAnalysis } = await getAiSettings();

  if (!enableAiAnalysis || !geminiApiKey) {
    return {
      ai_analyzed: false,
      message: 'ניתוח AI מושבת או שחסר מפתח API של Gemini בהגדרות.',
      extracted_data: { vendor: null, total: null, items: [] }
    };
  }

  // 1. Fetch content of URL
  let htmlContent = '';
  let contentType = '';
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'he,en-US;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      throw new Error(`שגיאה בגישה לקישור: HTTP ${resp.status}`);
    }

    contentType = resp.headers.get('content-type') || '';

    // If it's directly an image or PDF
    if (contentType.includes('image/') || contentType.includes('pdf')) {
      const buffer = Buffer.from(await resp.arrayBuffer());
      const mime = contentType.split(';')[0].trim();
      return analyzeReceiptFile(buffer, mime, url);
    }

    htmlContent = await resp.text();
  } catch (err) {
    throw new Error(`נכשל בהורדת תוכן החשבונית מהקישור: ${err.message}`);
  }

  // 2. Clean HTML content to remove scripts, styles to save tokens
  const cleanHtml = htmlContent
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 50000); // keep first 50k chars which is plenty for receipt tables

  const categories = await getAvailableCategories();
  const genAI = new GoogleGenerativeAI(geminiApiKey);

  const prompt = `
אתה מנתח חשבוניות וקבלות דיגיטליות מומחה עבור אפליקציית FinTrack.
לפניך קוד/תוכן של דף חשבונית דיגיטלית מהאינטרנט (למשל רמי לוי, שופרסל וכד'):
URL מקור: ${url}

תוכן הדף:
"""
${cleanHtml}
"""

הנה רשימת הקטגוריות הקיימות במערכת של המשתמש:
${JSON.stringify(categories)}

הוראות:
1. זהה את בית העסק (vendor), סכום כולל (total כמספר), תאריך (YYYY-MM-DD), מספר חשבונית (invoice_number), מע"מ (tax_amount).
2. חלץ את כל שורות הפריטים שנרכשו (items). לכל פריט:
   - name: שם המוצר בעברית
   - qty: כמות (מספר)
   - price: סכום השורה (כמספר)
   - category: הקטגוריה המתאימה ביותר מרשימת הקטגוריות (למשל 'סופר ומכולת' לפירות, ירקות ומזון, 'אלקטרוניקה' למוצרי חשמל, 'משק בית' לחומרי ניקוי וכו').
3. confidence: מספר בין 0 ל-1.

החזר אך ורק JSON תקין במבנה:
{
  "vendor": "שם בית העסק",
  "total": 123.45,
  "date": "YYYY-MM-DD",
  "invoice_number": "...",
  "tax_amount": 12.34,
  "currency": "ILS",
  "confidence": 0.95,
  "items": [
    {
      "name": "שם פריט",
      "qty": 1,
      "price": 25.00,
      "category": "סופר ומכולת"
    }
  ]
}
`;

  try {
    const { text, modelName } = await generateWithFallback(genAI, prompt, {
      responseMimeType: 'application/json'
    });

    let cleanJson = text.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    const parsed = JSON.parse(cleanJson);

    return {
      ai_analyzed: true,
      ai_provider: `gemini (${modelName})`,
      extracted_data: parsed,
      raw_text: text,
      html_snippet: cleanHtml.slice(0, 1000),
    };
  } catch (err) {
    console.error('[AI-Analyzer] Error analyzing receipt URL:', err);
    return {
      ai_analyzed: false,
      error: err.message,
      extracted_data: {
        vendor: null,
        total: null,
        items: []
      }
    };
  }
}
