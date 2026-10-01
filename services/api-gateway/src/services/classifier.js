import { pool } from '../db.js';
import {
  getUserCategoryHierarchy,
  cleanIsraeliMerchantName,
  classifyWithAi,
  classifyBatchWithAi,
} from './ai-classifier.js';

/**
 * Checks if text matches a credit card billing / settlement pattern in bank statements.
 */
export function isCcBillingPattern(text = '') {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return (
    lower.includes('חיוב כרטיס') ||
    lower.includes('כרטיסי אשראי') ||
    lower.includes('חיוב כרטיסי') ||
    lower.includes('סך חיוב') ||
    lower.includes('העב. לכרטיס') ||
    lower.includes('העברה לכרטיס') ||
    lower.includes('ישראכרט') ||
    lower.includes('ויזה כאל') ||
    lower.includes('כרטיס מקס') ||
    lower.includes('דיינרס')
  );
}

/**
 * Checks if a transaction represents an ATM / Cash withdrawal
 */
export function isCashWithdrawalTransaction(merchantName = '', description = '') {
  const text = `${merchantName} ${description}`.toLowerCase();
  // Protect credit card charges, wire transfers, bank debits and fees from cash withdrawal detection
  if (
    isCcBillingPattern(text) ||
    text.includes('העברה') ||
    text.includes('העב.') ||
    text.includes('הוראת קבע') ||
    text.includes('עמלת') ||
    text.includes('מט״ח') ||
    text.includes('מטח')
  ) {
    return false;
  }
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
 * Hierarchical Smart Neural Classifier Engine:
 * 1. Hard Structural Guards:
 *    - Bank CC billing settlements -> strictly 'שונות' -> 'חיוב אשראי' (no rule pollution)
 *    - ATM cash withdrawals -> strictly 'משיכת מזומן'
 * 2. Active User Category Rules & Habits (with context support: DOW, amount)
 * 3. User Manual Classification History (excluding CC settlements and generic transfers)
 * 4. Neural LLM Classifier (Gemini) with full dossier and live user category tree
 * 5. Deterministic fallback to user's real database categories
 */
/**
 * Helper to find category & subcategory IDs in user's tree
 */
export function resolveCategoryInHierarchy(catHierarchy, catName, subName) {
  let category = catName;
  let subCategory = subName || catName;
  let categoryId = null;
  let subCategoryId = null;

  if (subName) {
    const subMatch = catHierarchy?.subLookup?.get(subName.trim().toLowerCase());
    if (subMatch) {
      category = subMatch.parentName;
      subCategory = subMatch.subName;
      categoryId = subMatch.parentId;
      subCategoryId = subMatch.subId;
      return { category, subCategory, categoryId, subCategoryId };
    }
  }

  if (catName) {
    const rootMatch = catHierarchy?.rootLookup?.get(catName.trim().toLowerCase());
    if (rootMatch) {
      category = rootMatch.rootName;
      categoryId = rootMatch.rootId;
      const rootObj = catHierarchy?.rootMap?.get(rootMatch.rootId);
      const subObj = rootObj?.subs?.find(
        (s) => s.name.trim().toLowerCase() === (subName || '').trim().toLowerCase()
      ) || rootObj?.subs?.[0];
      if (subObj) {
        subCategory = subObj.name;
        subCategoryId = subObj.id;
      }
      return { category, subCategory, categoryId, subCategoryId };
    }
  }

  // Fallback to 'שונות' -> 'ללא סיווג'
  const misc = catHierarchy?.rootLookup?.get('שונות');
  if (misc) {
    category = misc.rootName;
    categoryId = misc.rootId;
    const miscObj = catHierarchy?.rootMap?.get(misc.rootId);
    const uncat = miscObj?.subs?.find((s) => s.name === 'ללא סיווג');
    subCategory = uncat ? uncat.name : 'ללא סיווג';
    subCategoryId = uncat ? uncat.id : null;
  } else {
    category = 'ללא סיווג';
    subCategory = 'ללא סיווג';
  }

  return { category, subCategory, categoryId, subCategoryId };
}

export async function classifyTransaction({
  userId = '00000000-0000-0000-0000-000000000001',
  merchantName = '',
  description = '',
  rawCategory = '',
  amount = 0,
  isCcBilling = false,
  transactionType = '',
  receiptVendor = '',
  receiptItems = [],
  hierarchy = null,
}) {
  const cleanMerchant = (merchantName || '').trim();
  const cleanDesc = (description || '').trim();
  const searchString = `${cleanMerchant} ${cleanDesc}`.trim();

  // Load user's live category hierarchy if not provided
  const catHierarchy = hierarchy || (await getUserCategoryHierarchy(userId));

  // Helper to find category & subcategory IDs in user's tree
  const resolveInHierarchy = (catName, subName) => resolveCategoryInHierarchy(catHierarchy, catName, subName);

  // =========================================================================
  // --- TIER 0: HARD GUARDS
  // =========================================================================

  // 0A. Credit Card Billing & Bank Settlements (Strict immunity against rule poisoning)
  if (isCcBilling || isCcBillingPattern(cleanMerchant) || isCcBillingPattern(cleanDesc)) {
    const resolved = resolveInHierarchy('שונות', 'חיוב אשראי');
    return {
      category: resolved.category,
      subCategory: resolved.subCategory,
      categoryId: resolved.categoryId,
      subCategoryId: resolved.subCategoryId,
      source: 'cc_billing_guard',
      isCashWithdrawal: false,
    };
  }

  // 0B. ATM Cash Withdrawal
  if (isCashWithdrawalTransaction(cleanMerchant, cleanDesc)) {
    const resolved = resolveInHierarchy('משק בית', 'משיכת מזומן');
    return {
      category: resolved.category || 'משיכת מזומן',
      subCategory: resolved.subCategory || 'משיכת מזומן',
      categoryId: resolved.categoryId,
      subCategoryId: resolved.subCategoryId,
      source: 'cash_withdrawal_detector',
      isCashWithdrawal: true,
      needsAction: true,
    };
  }

  // =========================================================================
  // --- TIER 1: ACTIVE USER RULES & HABITS (ONLY IF ACTIVE)
  // =========================================================================
  if (cleanMerchant) {
    try {
      // 1A. Exact pattern match
      const exactRuleRes = await pool.query(
        `SELECT category, sub_category AS "subCategory", context_conditions AS "context"
         FROM user_category_rules
         WHERE user_id = $1 AND LOWER(merchant_pattern) = LOWER($2) AND is_active = true
         ORDER BY updated_at DESC
         LIMIT 1`,
        [userId, cleanMerchant]
      );

      if (exactRuleRes.rows.length > 0) {
        const r = exactRuleRes.rows[0];
        const resolved = resolveInHierarchy(r.category, r.subCategory);
        return {
          category: resolved.category,
          subCategory: resolved.subCategory,
          categoryId: resolved.categoryId,
          subCategoryId: resolved.subCategoryId,
          source: 'user_rule_exact',
          isCashWithdrawal: false,
        };
      }

      // 1B. Contains pattern match
      const containsRuleRes = await pool.query(
        `SELECT category, sub_category AS "subCategory", merchant_pattern, context_conditions AS "context"
         FROM user_category_rules
         WHERE user_id = $1 AND match_type = 'contains' AND is_active = true
         ORDER BY LENGTH(merchant_pattern) DESC, updated_at DESC`,
        [userId]
      );

      for (const rule of containsRuleRes.rows) {
        if (cleanMerchant.toLowerCase().includes(rule.merchant_pattern.toLowerCase())) {
          const resolved = resolveInHierarchy(rule.category, rule.subCategory);
          return {
            category: resolved.category,
            subCategory: resolved.subCategory,
            categoryId: resolved.categoryId,
            subCategoryId: resolved.subCategoryId,
            source: 'user_rule_contains',
            isCashWithdrawal: false,
          };
        }
      }
    } catch (err) {
      console.warn('[Classifier] Error querying user_category_rules:', err.message);
    }
  }

  // 1C. User's past manual classifications (strictly excluding settlements)
  if (cleanMerchant || cleanDesc) {
    try {
      const manualHistoryRes = await pool.query(
        `SELECT t.category, t.merchant_name
         FROM transactions t
         JOIN bank_accounts b ON t.account_id = b.id
         WHERE b.user_id = $1
           AND t.is_manual_category = true
           AND t.category IS NOT NULL
           AND t.category NOT IN ('ללא סיווג', 'שונות')
           AND t.is_cc_billing = false
           AND t.merchant_name NOT ILIKE '%חיוב כרטיס%'
           AND t.merchant_name NOT ILIKE '%סך חיוב%'
           AND (
             (NULLIF($2, '') IS NOT NULL AND (
               LOWER(TRIM(t.merchant_name)) = LOWER(TRIM($2))
               OR LOWER(TRIM(t.description)) = LOWER(TRIM($2))
             ))
             OR (NULLIF($3, '') IS NOT NULL AND (
               LOWER(TRIM(t.merchant_name)) = LOWER(TRIM($3))
               OR LOWER(TRIM(t.description)) = LOWER(TRIM($3))
             ))
           )
         ORDER BY t.date DESC
         LIMIT 1`,
        [userId, cleanMerchant, cleanDesc]
      );

      if (manualHistoryRes.rows.length > 0) {
        const row = manualHistoryRes.rows[0];
        const resolved = resolveInHierarchy(row.category);
        return {
          category: resolved.category,
          subCategory: resolved.subCategory,
          categoryId: resolved.categoryId,
          subCategoryId: resolved.subCategoryId,
          source: 'user_manual_history',
          isCashWithdrawal: false,
        };
      }
    } catch (err) {
      console.warn('[Classifier] Error querying manual transaction history:', err.message);
    }
  }

  // =========================================================================
  // --- TIER 2: SMART NEURAL LLM CLASSIFIER (Gemini with dynamic tree)
  // =========================================================================
  try {
    const aiResult = await classifyWithAi({
      merchantName: cleanMerchant,
      description: cleanDesc,
      rawCategory,
      amount,
      receiptVendor,
      receiptItems,
      userId,
      hierarchy: catHierarchy,
    });

    if (aiResult && aiResult.success && aiResult.category) {
      const resolved = resolveInHierarchy(aiResult.category, aiResult.subCategory);
      return {
        category: resolved.category,
        subCategory: resolved.subCategory,
        categoryId: resolved.categoryId,
        subCategoryId: resolved.subCategoryId,
        cleanMerchant: aiResult.cleanMerchant || cleanIsraeliMerchantName(cleanMerchant),
        source: 'ai_gemini',
        rationale: aiResult.rationale,
        confidence: aiResult.confidence,
        fitLevel: aiResult.fitLevel,
        suggestedSubcategory: aiResult.suggestedSubcategory,
        isCashWithdrawal: false,
      };
    }
  } catch (aiErr) {
    console.warn('[Classifier] AI classification attempt error:', aiErr.message);
  }

  // =========================================================================
  // --- TIER 3: DETERMINISTIC DB FALLBACK
  // =========================================================================
  if (amount > 0) {
    const salaryMatch = resolveInHierarchy('משכורת', 'משכורת');
    if (salaryMatch.categoryId) {
      return {
        category: salaryMatch.category,
        subCategory: salaryMatch.subCategory,
        categoryId: salaryMatch.categoryId,
        subCategoryId: salaryMatch.subCategoryId,
        source: 'default_income',
        isCashWithdrawal: false,
      };
    }
  }

  const uncatMatch = resolveInHierarchy('שונות', 'ללא סיווג');
  return {
    category: uncatMatch.category,
    subCategory: uncatMatch.subCategory,
    categoryId: uncatMatch.categoryId,
    subCategoryId: uncatMatch.subCategoryId,
    source: 'default_uncategorized',
    isCashWithdrawal: false,
  };
}

/**
 * Saves or updates a user learning classification rule.
 * Strongly protected against credit card billing / bank settlement poisoning.
 */
export async function saveUserRule({
  userId = '00000000-0000-0000-0000-000000000001',
  merchantPattern,
  category,
  subCategory = null,
  matchType = 'exact',
  contextConditions = {},
  descriptionHe = null,
  isActive = true,
}) {
  if (!merchantPattern || !category) return null;
  const cleanPattern = merchantPattern.trim();
  const lowerPattern = cleanPattern.toLowerCase();

  // Guard: CC settlements, card debits, wire transfers must NEVER create category rules
  if (
    isCcBillingPattern(lowerPattern) ||
    lowerPattern.includes('חיוב כרטיס') ||
    lowerPattern.includes('כרטיס אשראי') ||
    lowerPattern.includes('העברה בנקאית') ||
    lowerPattern.includes('סך חיוב')
  ) {
    return null;
  }

  // Guard: generic bank debit/transfer patterns must NEVER be saved as cash withdrawal
  if (
    category === 'משיכת מזומן' &&
    (lowerPattern.includes('כרטיס') ||
      lowerPattern.includes('חיוב') ||
      lowerPattern.includes('העברה') ||
      lowerPattern.includes('מט״ח') ||
      lowerPattern.includes('הוראת קבע'))
  ) {
    return null;
  }

  const query = `
    INSERT INTO user_category_rules (
      user_id, merchant_pattern, category, sub_category, match_type, 
      context_conditions, description_he, is_active, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (user_id, merchant_pattern)
    DO UPDATE SET 
      category = EXCLUDED.category,
      sub_category = EXCLUDED.sub_category,
      match_type = EXCLUDED.match_type,
      context_conditions = EXCLUDED.context_conditions,
      description_he = COALESCE(EXCLUDED.description_he, user_category_rules.description_he),
      is_active = EXCLUDED.is_active,
      updated_at = NOW()
    RETURNING 
      id, user_id, merchant_pattern AS "merchantPattern", 
      category, sub_category AS "subCategory", match_type AS "matchType",
      context_conditions AS "contextConditions", description_he AS "descriptionHe",
      is_active AS "isActive", updated_at AS "updatedAt";
  `;

  const res = await pool.query(query, [
    userId,
    cleanPattern,
    category,
    subCategory || category,
    matchType,
    JSON.stringify(contextConditions || {}),
    descriptionHe,
    isActive,
  ]);
  return res.rows[0];
}

/**
 * Reclassifies all unreviewed transactions using signature clustering & batch AI.
 * Strictly preserves all transactions where is_manual_category = true.
 */
export async function reclassifyUnreviewedTransactions(userId = '00000000-0000-0000-0000-000000000001') {
  const catHierarchy = await getUserCategoryHierarchy(userId);
  const resolveInHierarchy = (catName, subName) => resolveCategoryInHierarchy(catHierarchy, catName, subName);

  // 1. Fetch user active rules
  let activeRules = [];
  try {
    const rulesRes = await pool.query(
      `SELECT merchant_pattern AS pattern, category, sub_category AS "subCategory", match_type AS "matchType"
       FROM user_category_rules
       WHERE user_id = $1 AND is_active = true
       ORDER BY LENGTH(merchant_pattern) DESC, updated_at DESC`,
      [userId]
    );
    activeRules = rulesRes.rows;
  } catch (err) {
    console.warn('[Classifier] Failed to fetch activeRules in reclassify:', err.message);
  }

  // 2. Fetch past manual classifications cache
  const manualMap = new Map();
  try {
    const manualHistoryRes = await pool.query(
      `SELECT DISTINCT ON (LOWER(TRIM(t.merchant_name)))
         LOWER(TRIM(t.merchant_name)) AS merchant_key,
         t.category
       FROM transactions t
       JOIN bank_accounts b ON t.account_id = b.id
       WHERE b.user_id = $1
         AND t.is_manual_category = true
         AND t.category IS NOT NULL
         AND t.category NOT IN ('ללא סיווג', 'שונות')
         AND t.is_cc_billing = false
       ORDER BY LOWER(TRIM(t.merchant_name)), t.date DESC
       LIMIT 100`,
      [userId]
    );
    for (const r of manualHistoryRes.rows) {
      if (r.merchant_key) manualMap.set(r.merchant_key, r.category);
    }
  } catch (err) {
    console.warn('[Classifier] Failed to fetch manualMap in reclassify:', err.message);
  }

  // 3. Fetch transactions where is_manual_category = false
  const txRes = await pool.query(
    `SELECT t.id, t.merchant_name, t.description, t.amount, t.category,
            t.is_cc_billing, t.raw_data->>'category' AS raw_category
     FROM transactions t
     JOIN bank_accounts a ON t.account_id = a.id
     WHERE a.user_id = $1 AND (t.is_manual_category = false OR t.is_manual_category IS NULL)
     ORDER BY t.date DESC
     LIMIT 500`,
    [userId]
  );

  const transactions = txRes.rows;
  if (transactions.length === 0) {
    return { total: 0, scanned: 0, updated: 0, unchanged: 0, sampleChanges: [] };
  }

  // 4. Separate into immediately resolvable (rules, manual habits, CC, cash) vs AI candidates
  const signatureMap = new Map(); // sigKey -> { dossier, txIds: [] }
  const immediateUpdates = []; // { txId, category, subCategory, cleanMerchant, oldCat }
  const sampleChanges = [];

  for (const tx of transactions) {
    const cleanMerchant = (tx.merchant_name || '').trim();
    const cleanDesc = (tx.description || '').trim();
    const amount = parseFloat(tx.amount || 0);

    // 4A. Hard check: CC billing
    if (tx.is_cc_billing || isCcBillingPattern(cleanMerchant) || isCcBillingPattern(cleanDesc)) {
      immediateUpdates.push({
        txId: tx.id,
        category: 'שונות',
        subCategory: 'חיוב אשראי',
        cleanMerchant: cleanMerchant || 'חיוב כרטיס אשראי',
        oldCat: tx.category,
      });
      continue;
    }

    // 4B. Hard check: Cash withdrawal
    if (isCashWithdrawalTransaction(cleanMerchant, cleanDesc)) {
      immediateUpdates.push({
        txId: tx.id,
        category: 'משק בית',
        subCategory: 'משיכת מזומן',
        cleanMerchant: cleanMerchant || 'משיכת מזומן',
        oldCat: tx.category,
      });
      continue;
    }

    // 4C. Check user rules
    const lowerMerchant = cleanMerchant.toLowerCase();
    let matchedRule = null;
    if (lowerMerchant) {
      for (const r of activeRules) {
        if (r.matchType === 'exact' && lowerMerchant === r.pattern.toLowerCase()) {
          matchedRule = r;
          break;
        } else if (r.matchType === 'contains' && lowerMerchant.includes(r.pattern.toLowerCase())) {
          matchedRule = r;
          break;
        }
      }
    }
    if (matchedRule) {
      const resolved = resolveInHierarchy(matchedRule.category, matchedRule.subCategory);
      immediateUpdates.push({
        txId: tx.id,
        category: resolved.category,
        subCategory: resolved.subCategory,
        cleanMerchant,
        oldCat: tx.category,
      });
      continue;
    }

    // 4D. Check past manual classification habit
    if (lowerMerchant && manualMap.has(lowerMerchant)) {
      const pastCat = manualMap.get(lowerMerchant);
      const resolved = resolveInHierarchy(pastCat);
      immediateUpdates.push({
        txId: tx.id,
        category: resolved.category,
        subCategory: resolved.subCategory,
        cleanMerchant,
        oldCat: tx.category,
      });
      continue;
    }

    // 4E. Cluster remaining into unique merchant signature keys
    const direction = amount < 0 ? 'expense' : 'income';
    const cleanM = cleanIsraeliMerchantName(cleanMerchant);
    const sigKey = cleanM && cleanM !== 'בית עסק'
      ? `${cleanM.toLowerCase()}:::${direction}:::${tx.raw_category || ''}`
      : `${cleanDesc.replace(/\d+/g, '').trim().toLowerCase().slice(0, 25)}:::${direction}:::${tx.raw_category || ''}`;

    if (!signatureMap.has(sigKey)) {
      signatureMap.set(sigKey, {
        id: `sig_${signatureMap.size}`,
        merchantName: cleanMerchant,
        description: cleanDesc,
        amount,
        rawCategory: tx.raw_category,
        transactionType: direction,
        txIds: [],
        oldCategory: tx.category,
      });
    }
    signatureMap.get(sigKey).txIds.push(tx.id);
  }

  // 5. Process remaining unrecognized signatures with Gemini in compact batches
  const uniqueDossiers = Array.from(signatureMap.values()).slice(0, 60);
  const batchSize = 20;
  const resolvedSignatures = new Map();

  for (let i = 0; i < uniqueDossiers.length; i += batchSize) {
    const chunk = uniqueDossiers.slice(i, i + batchSize);
    try {
      const batchResult = await classifyBatchWithAi(chunk, { userId, hierarchy: catHierarchy });
      if (batchResult && batchResult.success && Array.isArray(batchResult.results)) {
        for (const res of batchResult.results) {
          resolvedSignatures.set(res.id, res);
        }
      }
    } catch (batchErr) {
      console.warn(`[Classifier] Batch ${i / batchSize + 1} error:`, batchErr.message);
    }
  }

  // 4. Apply bulk updates to database
  let updatedCount = 0;
  let unchangedCount = 0;

  // Apply immediate updates (CC and Cash)
  for (const item of immediateUpdates) {
    const chosenCat = item.subCategory || item.category;
    await pool.query(
      `UPDATE transactions 
       SET category = $1
       WHERE id = $2`,
      [chosenCat, item.txId]
    );
    if (item.oldCat !== chosenCat) {
      updatedCount++;
      if (sampleChanges.length < 15) {
        sampleChanges.push({
          merchant: item.cleanMerchant,
          oldCategory: item.oldCat || 'ללא סיווג',
          newCategory: item.subCategory && item.subCategory !== item.category ? `${item.category} / ${item.subCategory}` : item.category,
          confidence: 1.0,
        });
      }
    } else {
      unchangedCount++;
    }
  }

  // Apply AI resolved signatures
  for (const dossier of uniqueDossiers) {
    const resolution = resolvedSignatures.get(dossier.id);
    if (!resolution) {
      unchangedCount += dossier.txIds.length;
      continue;
    }

    const { category, subCategory, cleanMerchant, confidence } = resolution;
    const chosenCat = subCategory || category;

    await pool.query(
      `UPDATE transactions 
       SET category = $1, 
           merchant_name = CASE 
             WHEN merchant_name IS NULL OR merchant_name IN ('', 'בית עסק') THEN $2 
             ELSE merchant_name 
           END
       WHERE id = ANY($3::uuid[])`,
      [chosenCat, cleanMerchant, dossier.txIds]
    );

    if (dossier.oldCategory !== category) {
      updatedCount += dossier.txIds.length;
      if (sampleChanges.length < 15) {
        sampleChanges.push({
          merchant: cleanMerchant || dossier.merchantName,
          oldCategory: dossier.oldCategory || 'ללא סיווג',
          newCategory: `${category} / ${subCategory}`,
          confidence: confidence || 0.9,
          count: dossier.txIds.length,
        });
      }
    } else {
      unchangedCount += dossier.txIds.length;
    }
  }

  return {
    total: transactions.length,
    scanned: transactions.length,
    updated: updatedCount,
    unchanged: unchangedCount,
    sampleChanges,
  };
}

/**
 * Backward compatibility alias for reclassifying all unreviewed transactions.
 */
export async function reclassifyAllTransactions(userId = '00000000-0000-0000-0000-000000000001') {
  return reclassifyUnreviewedTransactions(userId);
}
