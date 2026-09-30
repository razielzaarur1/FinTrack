import { GoogleGenerativeAI } from '@google/generative-ai';
import { pool } from '../db.js';
import { getAiSettings, getAvailableGeminiModels } from './ai-analyzer.js';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Loads the active category tree for a user directly from the database.
 * Returns hierarchical structure: parents with their active subcategories,
 * plus fast lookup maps for instant normalization and validation.
 */
export async function getUserCategoryHierarchy(userId = DEFAULT_USER_ID) {
  const catRes = await pool.query(
    `SELECT id, parent_id AS "parentId", name, name_en AS "nameEn", type, icon, color
     FROM categories 
     WHERE user_id = $1 AND (is_active = true OR is_active IS NULL)
     ORDER BY sort_order ASC, name ASC`,
    [userId]
  );

  const rootMap = new Map();
  const roots = [];
  const subLookup = new Map(); // lowercase subName -> { parentName, parentId, subId, subName }
  const rootLookup = new Map(); // lowercase rootName -> { rootName, rootId }

  for (const r of catRes.rows) {
    if (!r.parentId) {
      const obj = {
        id: r.id,
        name: r.name,
        nameEn: r.nameEn,
        type: r.type,
        icon: r.icon,
        color: r.color,
        subs: [],
      };
      rootMap.set(r.id, obj);
      roots.push(obj);
      rootLookup.set(r.name.trim().toLowerCase(), { rootName: r.name, rootId: r.id });
    }
  }

  for (const r of catRes.rows) {
    if (r.parentId && rootMap.has(r.parentId)) {
      const parent = rootMap.get(r.parentId);
      parent.subs.push({
        id: r.id,
        name: r.name,
        nameEn: r.nameEn,
        icon: r.icon,
        color: r.color,
      });
      subLookup.set(r.name.trim().toLowerCase(), {
        parentName: parent.name,
        parentId: parent.id,
        subName: r.name,
        subId: r.id,
      });
    }
  }

  return {
    roots,
    rootMap,
    rootLookup,
    subLookup,
  };
}

/**
 * Fetches user-specific learning context: active rules and non-polluted manual history.
 */
async function getUserLearningContext(userId = DEFAULT_USER_ID) {
  // 1. Explicit active user category rules & habits
  const rulesRes = await pool.query(
    `SELECT merchant_pattern AS pattern, category, sub_category AS "subCategory", match_type AS "matchType", 
            context_conditions AS "context", description_he AS "descriptionHe"
     FROM user_category_rules
     WHERE user_id = $1 AND is_active = true
     ORDER BY updated_at DESC
     LIMIT 50`,
    [userId]
  );

  // 2. Recent manual transaction classifications by the user (excluding CC billing and settlements)
  const historyRes = await pool.query(
    `SELECT DISTINCT ON (LOWER(TRIM(t.merchant_name)))
       TRIM(t.merchant_name) AS merchant,
       TRIM(t.description) AS description,
       t.category,
       t.amount,
       EXTRACT(DOW FROM t.date)::int AS "dow"
     FROM transactions t
     JOIN bank_accounts b ON t.account_id = b.id
     WHERE b.user_id = $1
       AND t.is_manual_category = true
       AND t.category IS NOT NULL
       AND t.merchant_name IS NOT NULL
       AND TRIM(t.merchant_name) NOT IN ('', 'בית עסק')
       AND t.is_cc_billing = false
       AND t.merchant_name NOT ILIKE '%חיוב כרטיס%'
       AND t.merchant_name NOT ILIKE '%סך חיוב%'
       AND t.merchant_name NOT ILIKE '%ישראכרט%'
       AND t.merchant_name NOT ILIKE '%ויזה%'
       AND t.merchant_name NOT ILIKE '%מקס%'
     ORDER BY LOWER(TRIM(t.merchant_name)), t.date DESC
     LIMIT 40`,
    [userId]
  );

  return {
    activeRules: rulesRes.rows,
    manualHistory: historyRes.rows,
  };
}

/**
 * Cleans Israeli merchant noise (branch codes, terminal IDs, payment gateway wrappers)
 */
export function cleanIsraeliMerchantName(raw = '') {
  if (!raw || typeof raw !== 'string') return '';
  let str = raw.trim();

  // Remove common payment gateway prefixes
  str = str.replace(/^(עסקה ב|עסקת שב"א|חיוב מ|משולם באמצעות|הוראת קבע\s*-?|ביט\s*-?|פייבוקס\s*-?)\s*/i, '');
  // Remove trailing branch identifiers like "סניף 123", "ס. תל אביב", "#456"
  str = str.replace(/\s+(סניף|ס\.|סנ')\s*[\d\w\u0590-\u05FF]+/gi, '');
  str = str.replace(/\s+#\d+/g, '');
  // Remove trailing POS terminal numbers like "מ-9999", "טרמינל 01"
  str = str.replace(/\s+(טרמינל|מסוף|מ-)\s*\d+/gi, '');
  // Remove "בע\"מ" or "בעמ"
  str = str.replace(/\s+בע"?מ$/i, '');

  return str.trim() || raw.trim();
}

/**
 * Classifies an array of transactions in a single compact batch prompt to Gemini,
 * avoiding per-transaction roundtrips and strictly preventing rate-limit blocks.
 *
 * @param {Array} items - Up to 25 transaction dossiers
 * @param {Object} options - { userId, hierarchy }
 */
export async function classifyBatchWithAi(items = [], { userId = DEFAULT_USER_ID, hierarchy = null } = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return { success: true, results: [] };
  }

  const { geminiApiKey, enableAiAnalysis } = await getAiSettings();
  if (!enableAiAnalysis || !geminiApiKey) {
    return { success: false, reason: 'ai_not_configured' };
  }

  try {
    const catHierarchy = hierarchy || (await getUserCategoryHierarchy(userId));
    if (catHierarchy.roots.length === 0) {
      return { success: false, reason: 'no_categories_defined' };
    }

    const { activeRules, manualHistory } = await getUserLearningContext(userId);

    // Format category tree for prompt
    const categoryTreeCatalog = catHierarchy.roots.map((root) => ({
      category: root.name,
      type: root.type,
      subCategories: root.subs.map((s) => s.name),
    }));

    // Format few-shot user manual habits
    const userHabitsExamples = manualHistory.slice(0, 25).map((h) => {
      const dir = parseFloat(h.amount) < 0 ? 'הוצאה' : 'הכנסה';
      const sub = h.sub_category ? ` / ${h.sub_category}` : '';
      return `• "${h.merchant}" -> ${h.category}${sub} (₪${Math.abs(h.amount).toFixed(0)}, ${dir})`;
    });

    const activeRulesExamples = activeRules.slice(0, 15).map((r) => {
      const sub = r.subCategory ? ` / ${r.subCategory}` : '';
      const desc = r.descriptionHe ? ` (${r.descriptionHe})` : '';
      return `• חוק משתמש פעיל: תבנית "${r.pattern}" -> ${r.category}${sub}${desc}`;
    });

    // Prepare items payload with guaranteed IDs
    const preparedItems = items.map((it, idx) => ({
      ...it,
      id: it.id || `item_${idx}_${Date.now()}`,
    }));

    const itemsPayload = preparedItems.map((it) => ({
      id: it.id,
      merchantName: it.merchantName || '',
      description: it.description || '',
      amount: it.amount || 0,
      direction: (it.amount || 0) < 0 ? 'הוצאה' : 'הכנסה',
      rawCategoryHint: it.rawCategory || 'ללא',
      transactionType: it.transactionType || 'רגיל',
      receiptVendor: it.receiptVendor || undefined,
      receiptItems: Array.isArray(it.receiptItems) && it.receiptItems.length > 0 ? it.receiptItems.slice(0, 10) : undefined,
    }));

    const prompt = `אתה מנוע נוירוני מוביל (FinTrack Neural Classifier) לזיהוי עסקים וסיווג פיננסי מעמיק בישראל.
עליך לנתח רשימת תנועות פיננסיות, לחקור את מהות כל עסק ותנועה, ולסווג אותה באופן מושלם ומדויק אל עץ הקטגוריות ותתי-הקטגוריות הפעילות של המשתמש.

עץ הקטגוריות הפעיל של המשתמש (חובה לבחור אך ורק מתוכו!):
${JSON.stringify(categoryTreeCatalog, null, 2)}

${activeRulesExamples.length > 0 ? `חוקי למידה שהמשתמש הגדיר (יש לתת להם עדיפות מירבית!):\n${activeRulesExamples.join('\n')}\n` : ''}
${userHabitsExamples.length > 0 ? `דוגמאות לסיווגים ידניים שהמשתמש ביצע (כבד הרגלים אישיים אלו):\n${userHabitsExamples.join('\n')}\n` : ''}

עקרונות חקירה סמנטית ודיוק עסקי בישראל:
1. עולם הרכב והתחבורה: הבחנה חדה בין דלק/טעינה, חניונים ואפליקציות חנייה (פנגו/סלופארק/חניון -> חנייה), כבישי אגרה (כביש 6/מנהרות הכרמל), מוסכים ושטיפת רכב, ותחבורה ציבורית (רב קו/רכבת).
2. מזון והסעדה: הבחנה חדה בין סופרמרקטים/מכולות, מאפיות וקונדיטוריות, בתי קפה, מסעדות, ומשלוחי אוכל (וולט/תן ביס).
3. בריאות ופארם: הבחנה בין בתי מרקחת/פארם (סופר-פארם, Be, מדי-פארם), קופות חולים/מרפאות, רפואת שיניים, אופטיקה, ומכוני כושר.
4. קניות ודיור: חשמל, מים, גז, ארנונה/עירייה, תקשורת (אינטרנט/סלולר), ביגוד והנעלה, אלקטרוניקה, ריהוט, וציוד לחיות מחמד.
5. רמז הסיווג המקורי (rawCategoryHint) מהבנק הוא רמז הקשרי משני בלבד! לעולם אל תסווג חניון כדלק רק כי הבנק רשם "תחבורה".
6. אם אין תת-קטגוריה ייעודית מתאימה לתנועה, בחר בקטגוריית האב הטובה ביותר ובתת-קטגוריה הקרובה ביותר או "ללא סיווג", וסמן fitLevel כ-"semantic_gap" עם suggestedSubcategory מתאימה.

התנועות לסיווג:
${JSON.stringify(itemsPayload, null, 2)}

החזר תשובה אך ורק במבנה JSON תקני כמערך של אובייקטים:
[
  {
    "id": "מזהה התנועה בדיוק כפי שנמסר",
    "cleanMerchant": "שם בית העסק המזוקק והמוכר",
    "category": "שם קטגוריית האב המדויקת מהעץ",
    "subCategory": "שם תת-הקטגוריה המדויקת מהעץ",
    "confidence": 0.95,
    "fitLevel": "exact_match", // "exact_match" | "good_fit" | "semantic_gap"
    "suggestedSubcategory": null, // שם תת-קטגוריה מומלץ אם חסר בעץ, אחרת null
    "rationale": "הסבר מנומק בעברית"
  }
]`;

    const dynamicModels = await getAvailableGeminiModels(geminiApiKey);
    const modelsToTry = dynamicModels.length > 0
      ? dynamicModels
      : ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'];

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

        if (Array.isArray(parsed) && parsed.length > 0) {
          const normalizedResults = parsed.map((res, resIdx) => {
            const originalItem = preparedItems.find((it) => String(it.id) === String(res.id)) || preparedItems[resIdx] || {};
            const cleanMerchant = res.cleanMerchant || cleanIsraeliMerchantName(originalItem.merchantName);

            // Normalize category and subcategory against live tree
            let matchedCategory = res.category;
            let matchedSubCategory = res.subCategory;
            let categoryId = null;
            let subCategoryId = null;

            // 1. Try matching subcategory directly in subLookup
            const subNormKey = (res.subCategory || '').trim().toLowerCase();
            if (subNormKey && catHierarchy.subLookup.has(subNormKey)) {
              const match = catHierarchy.subLookup.get(subNormKey);
              matchedCategory = match.parentName;
              matchedSubCategory = match.subName;
              categoryId = match.parentId;
              subCategoryId = match.subId;
            } else {
              // 2. Try matching root category
              const rootNormKey = (res.category || '').trim().toLowerCase();
              if (rootNormKey && catHierarchy.rootLookup.has(rootNormKey)) {
                const match = catHierarchy.rootLookup.get(rootNormKey);
                matchedCategory = match.rootName;
                categoryId = match.rootId;
                // If subcategory is invalid or missing, check if 'ללא סיווג' exists under this root or set to root name
                const rootObj = catHierarchy.rootMap.get(match.rootId);
                const defaultSub = rootObj?.subs?.find((s) => s.name === 'ללא סיווג') || rootObj?.subs?.[0];
                if (defaultSub) {
                  matchedSubCategory = defaultSub.name;
                  subCategoryId = defaultSub.id;
                } else {
                  matchedSubCategory = match.rootName;
                }
              } else {
                // Fallback to 'שונות' -> 'ללא סיווג' if exists
                const miscMatch = catHierarchy.rootLookup.get('שונות');
                if (miscMatch) {
                  matchedCategory = miscMatch.rootName;
                  categoryId = miscMatch.rootId;
                  const miscObj = catHierarchy.rootMap.get(miscMatch.rootId);
                  const uncatSub = miscObj?.subs?.find((s) => s.name === 'ללא סיווג');
                  matchedSubCategory = uncatSub ? uncatSub.name : 'ללא סיווג';
                  subCategoryId = uncatSub ? uncatSub.id : null;
                } else {
                  matchedCategory = 'ללא סיווג';
                  matchedSubCategory = 'ללא סיווג';
                }
              }
            }

            return {
              id: res.id,
              cleanMerchant,
              category: matchedCategory,
              subCategory: matchedSubCategory,
              categoryId,
              subCategoryId,
              confidence: typeof res.confidence === 'number' ? res.confidence : 0.9,
              fitLevel: res.fitLevel || 'exact_match',
              suggestedSubcategory: res.suggestedSubcategory || null,
              rationale: res.rationale || '',
              modelUsed: modelName,
            };
          });

          return {
            success: true,
            results: normalizedResults,
            modelUsed: modelName,
          };
        }
      } catch (err) {
        lastError = err;
        // If rate limited (429), wait 1.5s before fallback attempt
        if (err.message && err.message.includes('429')) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }

    return { success: false, reason: lastError?.message || 'generation_failed' };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

/**
 * Classifies a single transaction dossier using the AI engine.
 */
export async function classifyWithAi(dossier = {}) {
  const batchRes = await classifyBatchWithAi([dossier], {
    userId: dossier.userId || DEFAULT_USER_ID,
    hierarchy: dossier.hierarchy || null,
  });

  if (batchRes && batchRes.success && batchRes.results && batchRes.results.length > 0) {
    const single = batchRes.results[0];
    return {
      success: true,
      cleanMerchant: single.cleanMerchant,
      category: single.category,
      subCategory: single.subCategory,
      categoryId: single.categoryId,
      subCategoryId: single.subCategoryId,
      confidence: single.confidence,
      fitLevel: single.fitLevel,
      suggestedSubcategory: single.suggestedSubcategory,
      rationale: single.rationale,
      modelUsed: batchRes.modelUsed,
    };
  }

  return { success: false, reason: batchRes?.reason || 'classification_failed' };
}
