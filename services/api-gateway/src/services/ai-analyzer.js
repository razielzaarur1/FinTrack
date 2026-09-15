import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { pool } from '../db.js';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

// Static fallback candidates if ListModels cannot be queried
const DEFAULT_CANDIDATE_MODELS = [
  'gemini-1.5-flash-002',
  'gemini-1.5-flash-001',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash',
  'gemini-2.0-flash-exp',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro-002',
  'gemini-1.5-pro-001',
  'gemini-1.5-pro',
  'gemini-1.5-pro-latest'
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
 * Query Google's ListModels API dynamically to get the exact authorized models for this key
 */
export async function getAvailableGeminiModels(apiKey) {
  if (!apiKey) return [];
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const msg = errData.error?.message || `HTTP ${res.status}`;
      console.warn('[AI-Analyzer] ListModels returned error:', msg);
      return [];
    }
    const data = await res.json();
    const list = (data.models || [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''));

    if (list.length > 0) {
      // Sort models: prioritize flash models, then 2.0 / 1.5, then pro
      list.sort((a, b) => {
        const aFlash = a.includes('flash') ? 0 : 1;
        const bFlash = b.includes('flash') ? 0 : 1;
        if (aFlash !== bFlash) return aFlash - bFlash;
        return a.localeCompare(b);
      });
      return list;
    }
  } catch (err) {
    console.warn('[AI-Analyzer] Failed to query ListModels:', err.message);
  }
  return [];
}

/**
 * Execute generateContent with dynamic model discovery and automatic fallback
 */
async function generateWithFallback(apiKey, contents, generationConfig = {}) {
  const genAI = new GoogleGenerativeAI(apiKey);

  // 1. Discover actual models available for this specific API key
  const dynamicModels = await getAvailableGeminiModels(apiKey);
  const modelsToTry = dynamicModels.length > 0 
    ? dynamicModels 
    : DEFAULT_CANDIDATE_MODELS;

  let lastError = null;

  for (const modelName of modelsToTry) {
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
      // If 404 or model not supported, try next model
      if (errMsg.includes('404') || errMsg.includes('not found') || errMsg.includes('not supported') || err.status === 404) {
        console.warn(`[AI-Analyzer] Model '${modelName}' not available, trying next...`);
        continue;
      }
      // If authentication failure / invalid key, throw immediately
      if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('PERMISSION_DENIED') || errMsg.includes('API key not valid')) {
        throw new Error('מפתח ה-API של Gemini אינו תקין או שאינו מורשה.');
      }
      throw err;
    }
  }

  throw lastError || new Error('לא נמצא מודל Gemini זמין עבור מפתח זה.');
}

/**
 * Test a Gemini API Key
 */
export async function testGeminiApiKey(keyToTest) {
  const apiKey = keyToTest || (await getAiSettings()).geminiApiKey;
  if (!apiKey) {
    throw new Error('לא הוזן מפתח API של Gemini');
  }

  const { text, modelName } = await generateWithFallback(apiKey, 'שלום, ענה במילה אחת בלבד: פועל.');
  return { 
    success: true, 
    response: text.trim(), 
    model: modelName,
    message: `החיבור ל-Gemini הצליח במודל ${modelName}! ה-AI מוכן לפעולה.`
  };
}

/**
 * Analyze an image or PDF buffer using Gemini with automatic model discovery
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

    const { text, modelName } = await generateWithFallback(geminiApiKey, [prompt, part], {
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
    const { text, modelName } = await generateWithFallback(geminiApiKey, prompt, {
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
