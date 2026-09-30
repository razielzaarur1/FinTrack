import { GoogleGenerativeAI } from '@google/generative-ai';
import { pool } from '../db.js';
import { getAiSettings, getAvailableGeminiModels } from './ai-analyzer.js';
import { getUserCategoryHierarchy, cleanIsraeliMerchantName } from './ai-classifier.js';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Scans transactions for semantic gaps (clusters of transactions that lack a dedicated subcategory)
 * and generates intelligent, actionable category suggestions using Gemini.
 */
export async function scanAndSuggestCategories(userId = DEFAULT_USER_ID) {
  const { geminiApiKey, enableAiAnalysis } = await getAiSettings();
  if (!enableAiAnalysis || !geminiApiKey) {
    return { success: false, reason: 'ai_not_configured', suggestions: [] };
  }

  const catHierarchy = await getUserCategoryHierarchy(userId);
  if (catHierarchy.roots.length === 0) {
    return { success: false, reason: 'no_categories_defined', suggestions: [] };
  }

  // 1. Fetch unclassified transactions or transactions under generic catch-alls
  const txRes = await pool.query(
    `SELECT t.id, t.merchant_name, t.description, t.amount, t.category,
            t.raw_data->>'category' AS raw_category
     FROM transactions t
     JOIN bank_accounts a ON t.account_id = a.id
     WHERE a.user_id = $1
       AND (
         t.category IN ('ללא סיווג', 'שונות', 'כללי', 'אחר')
         OR t.category IS NULL
       )
       AND t.is_cc_billing = false
       AND t.merchant_name NOT ILIKE '%חיוב כרטיס%'
       AND t.merchant_name NOT ILIKE '%סך חיוב%'
       AND t.merchant_name NOT ILIKE '%משיכת מזומן%'
     ORDER BY t.date DESC
     LIMIT 150`,
    [userId]
  );

  const candidates = txRes.rows;
  if (candidates.length === 0) {
    return { success: true, count: 0, suggestions: [] };
  }

  // 2. Fetch existing pending and dismissed suggestions to avoid re-generating
  const existingSuggestionsRes = await pool.query(
    `SELECT name, sample_merchants FROM category_suggestions WHERE user_id = $1`,
    [userId]
  );
  const existingNames = new Set(existingSuggestionsRes.rows.map((r) => r.name.trim().toLowerCase()));

  // 3. Cluster candidates by cleaned merchant name
  const merchantClusters = new Map();
  for (const tx of candidates) {
    const clean = cleanIsraeliMerchantName(tx.merchant_name || tx.description || '');
    if (!clean || clean.length < 2) continue;
    const key = clean.toLowerCase();

    if (!merchantClusters.has(key)) {
      merchantClusters.set(key, {
        cleanName: clean,
        txIds: [],
        descriptions: [],
        amounts: [],
      });
    }
    const cluster = merchantClusters.get(key);
    cluster.txIds.push(tx.id);
    if (tx.description && !cluster.descriptions.includes(tx.description)) {
      cluster.descriptions.push(tx.description);
    }
    cluster.amounts.push(parseFloat(tx.amount || 0));
  }

  // Select clusters that either have 2+ transactions or significant amount
  const candidateClusters = Array.from(merchantClusters.values())
    .filter((c) => c.txIds.length >= 2 || Math.abs(c.amounts[0] || 0) > 100)
    .slice(0, 15);

  if (candidateClusters.length === 0) {
    return { success: true, count: 0, suggestions: [] };
  }

  // Format category tree catalog for Gemini
  const treeCatalog = catHierarchy.roots.map((r) => ({
    parentId: r.id,
    parentName: r.name,
    type: r.type,
    existingSubs: r.subs.map((s) => s.name),
  }));

  const prompt = `אתה מומחה פיננסי למערכת FinTrack.
לפניך עץ הקטגוריות הפעיל של המשתמש, לצד קבוצות של בתי עסק ותנועות פיננסיות שנותרו ללא סיווג הולם או נדחסו לקטגוריות כלליות ("ללא סיווג"/"שונות") כי חסרה להן תת-קטגוריה ייעודית.

עץ הקטגוריות הפעיל של המשתמש:
${JSON.stringify(treeCatalog, null, 2)}

קבוצות התנועות שנותרו ללא סיווג מתאים:
${JSON.stringify(
  candidateClusters.map((c) => ({
    merchant: c.cleanName,
    sampleDescriptions: c.descriptions.slice(0, 3),
    transactionCount: c.txIds.length,
    averageAmount: Math.round(c.amounts.reduce((a, b) => a + Math.abs(b), 0) / c.amounts.length),
  })),
  null,
  2
)}

משימה:
זהה אילו תת-קטגוריות חדשות כדאי לפתוח כדי לתת מענה מושלם לתנועות אלו (למשל: אם יש עסקאות חניון ואין תת-קטגוריית "חנייה" תחת "רכב ותחבורה"; או מאפייה ואין "מאפיות ומתוקים"; או וטרינר ואין "חיות מחמד").
הצע אך ורק תת-קטגוריות שבאמת חסרות בעץ (אל תציע תת-קטגוריות שכבר קיימות!).

עבור כל הצעה איכותית, החזר אובייקט במערך:
[
  {
    "name": "שם תת-הקטגוריה המומלץ בעברית",
    "nameEn": "English Name",
    "parentName": "שם קטגוריית האב המתאימה ביותר מהעץ (או חדשה אם אין מתאימה)",
    "color": "#צבע Hex מתאים (למשל #6366f1)",
    "icon": "שם אייקון תקני מ-Lucide (כגון CircleParking, CakeSlice, Film, Dog, Tv, Pill)",
    "reason": "נימוק מקצועי בעברית המסביר איזה פער נסגר ומדוע כדאי להוסיף תת-קטגוריה זו",
    "matchingMerchants": ["שמות בתי העסק מהרשימה שמתאימים לתת-קטגוריה זו"]
  }
]`;

  const dynamicModels = await getAvailableGeminiModels(geminiApiKey);
  const modelsToTry = dynamicModels.length > 0
    ? dynamicModels
    : ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];

  const genAI = new GoogleGenerativeAI(geminiApiKey);

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const suggestions = JSON.parse(text);

      if (Array.isArray(suggestions) && suggestions.length > 0) {
        const createdSuggestions = [];

        for (const sugg of suggestions) {
          if (!sugg.name || existingNames.has(sugg.name.trim().toLowerCase())) {
            continue;
          }

          // Find parent category ID
          let parentId = null;
          let parentColor = sugg.color || '#6366f1';
          if (sugg.parentName) {
            const rootMatch = catHierarchy.rootLookup.get(sugg.parentName.trim().toLowerCase());
            if (rootMatch) {
              parentId = rootMatch.rootId;
              const rootObj = catHierarchy.rootMap.get(rootMatch.rootId);
              if (rootObj && rootObj.color) parentColor = rootObj.color;
            }
          }

          // Gather matching transaction IDs
          const matchedTxIds = [];
          const matchedMerchants = Array.isArray(sugg.matchingMerchants) ? sugg.matchingMerchants : [];
          for (const mName of matchedMerchants) {
            const cluster = candidateClusters.find(
              (c) => c.cleanName.toLowerCase() === mName.toLowerCase()
            );
            if (cluster) {
              matchedTxIds.push(...cluster.txIds);
            }
          }

          const insRes = await pool.query(
            `INSERT INTO category_suggestions (
               user_id, name, name_en, parent_id, type, color, icon, 
               reason, sample_transaction_ids, sample_merchants, status
             ) VALUES ($1, $2, $3, $4, 'expense', $5, $6, $7, $8, $9, 'pending')
             RETURNING id, name, name_en AS "nameEn", parent_id AS "parentId", color, icon, reason,
                       sample_merchants AS "sampleMerchants", status, created_at AS "createdAt"`,
            [
              userId,
              sugg.name.trim(),
              sugg.nameEn || null,
              parentId,
              parentColor,
              sugg.icon || 'tag',
              sugg.reason || 'הצעה חכמה לסיווג מדויק של תנועות דומות',
              JSON.stringify(matchedTxIds),
              JSON.stringify(matchedMerchants),
            ]
          );

          createdSuggestions.push(insRes.rows[0]);
          existingNames.add(sugg.name.trim().toLowerCase());
        }

        return {
          success: true,
          count: createdSuggestions.length,
          suggestions: createdSuggestions,
        };
      }
    } catch (err) {
      console.warn(`[CategorySuggester] Attempt with ${modelName} failed:`, err.message);
    }
  }

  return { success: false, reason: 'ai_failed_or_no_suggestions', suggestions: [] };
}

/**
 * Gets all category suggestions for user (pending and history).
 */
export async function getCategorySuggestions(userId = DEFAULT_USER_ID) {
  const res = await pool.query(
    `SELECT s.id, s.name, s.name_en AS "nameEn", s.parent_id AS "parentId",
            p.name AS "parentName", s.type, s.color, s.icon, s.reason,
            s.sample_transaction_ids AS "sampleTransactionIds",
            s.sample_merchants AS "sampleMerchants",
            s.status, s.created_at AS "createdAt", s.updated_at AS "updatedAt"
     FROM category_suggestions s
     LEFT JOIN categories p ON s.parent_id = p.id
     WHERE s.user_id = $1
     ORDER BY s.created_at DESC`,
    [userId]
  );

  const pending = [];
  const history = [];

  for (const row of res.rows) {
    if (row.status === 'pending') {
      pending.push(row);
    } else {
      history.push(row);
    }
  }

  return { pending, history };
}

/**
 * Approves a category suggestion, creates the category/subcategory in DB,
 * and updates matching transactions immediately.
 */
export async function approveCategorySuggestion(userId = DEFAULT_USER_ID, suggestionId, overrides = {}) {
  const suggRes = await pool.query(
    `SELECT * FROM category_suggestions WHERE id = $1 AND user_id = $2`,
    [suggestionId, userId]
  );

  if (suggRes.rows.length === 0) {
    throw new Error('Suggestion not found');
  }

  const suggestion = suggRes.rows[0];
  const name = overrides.name || suggestion.name;
  const nameEn = overrides.nameEn !== undefined ? overrides.nameEn : suggestion.name_en;
  const parentId = overrides.parentId !== undefined ? overrides.parentId : suggestion.parent_id;
  const color = overrides.color || suggestion.color;
  const icon = overrides.icon || suggestion.icon;
  const type = overrides.type || suggestion.type || 'expense';

  // 1. Create category in categories table
  const newCatRes = await pool.query(
    `INSERT INTO categories (user_id, name, name_en, parent_id, type, color, icon, is_active, is_system)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true, false)
     ON CONFLICT (user_id, name) 
     DO UPDATE SET parent_id = EXCLUDED.parent_id, color = EXCLUDED.color, icon = EXCLUDED.icon, is_active = true
     RETURNING id, name, parent_id`,
    [userId, name, nameEn, parentId, type, color, icon]
  );

  const createdCategory = newCatRes.rows[0];

  // 2. Determine parent category name if parentId exists
  let parentName = null;
  if (createdCategory.parent_id) {
    const parentRes = await pool.query(
      `SELECT name FROM categories WHERE id = $1`,
      [createdCategory.parent_id]
    );
    if (parentRes.rows.length > 0) {
      parentName = parentRes.rows[0].name;
    }
  }

  // 3. Update transactions associated with this suggestion
  const sampleTxIds = suggestion.sample_transaction_ids || [];
  let updatedTxCount = 0;

  if (Array.isArray(sampleTxIds) && sampleTxIds.length > 0) {
    const chosenCat = createdCategory.name;

    const updateRes = await pool.query(
      `UPDATE transactions 
       SET category = $1
       WHERE id = ANY($2::uuid[])`,
      [chosenCat, sampleTxIds]
    );
    updatedTxCount = updateRes.rowCount;
  }

  // 4. Also create a user category rule for the matching merchants so future transactions use this!
  const sampleMerchants = suggestion.sample_merchants || [];
  if (Array.isArray(sampleMerchants)) {
    for (const m of sampleMerchants) {
      if (m && typeof m === 'string') {
        await pool.query(
          `INSERT INTO user_category_rules (user_id, merchant_pattern, category, sub_category, match_type, is_active, description_he)
           VALUES ($1, $2, $3, $4, 'contains', true, $5)
           ON CONFLICT (user_id, merchant_pattern) DO UPDATE 
           SET category = EXCLUDED.category, sub_category = EXCLUDED.sub_category, is_active = true`,
          [
            userId,
            m.trim(),
            parentName || createdCategory.name,
            parentName ? createdCategory.name : null,
            `המלצת AI שאושרה: ${createdCategory.name}`,
          ]
        );
      }
    }
  }

  // 5. Mark suggestion as approved
  await pool.query(
    `UPDATE category_suggestions SET status = 'approved', updated_at = NOW() WHERE id = $1`,
    [suggestionId]
  );

  return {
    success: true,
    categoryId: createdCategory.id,
    updatedTransactionsCount: updatedTxCount,
  };
}

/**
 * Dismisses a category suggestion.
 */
export async function dismissCategorySuggestion(userId = DEFAULT_USER_ID, suggestionId) {
  const res = await pool.query(
    `UPDATE category_suggestions 
     SET status = 'dismissed', updated_at = NOW() 
     WHERE id = $1 AND user_id = $2
     RETURNING id, status`,
    [suggestionId, userId]
  );

  if (res.rows.length === 0) {
    throw new Error('Suggestion not found');
  }

  return { success: true, id: suggestionId, status: 'dismissed' };
}
