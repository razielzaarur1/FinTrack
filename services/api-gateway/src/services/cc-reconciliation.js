/**
 * Credit Card Billing Detection & Reconciliation Algorithm Service
 * 
 * Handles:
 * 1. Detection of credit card billing transactions on bank accounts.
 * 2. Intelligent matching between bank CC billings and credit card / foreign transactions.
 * 3. Strict auto-linking (exact amount only >= 85%) and candidate suggestions (>= 35%).
 * 4. Fee difference classification when linking transactions with non-zero spread.
 */

export const KNOWN_CC_PATTERNS = [
  'ישראכרט',
  'כרטיסי אשראי לישראל',
  'כאל',
  'cal',
  'מקס',
  'max',
  'לאומי קארד',
  'ויזה',
  'אמריקן אקספרס',
  'דיינרס',
  'isracard',
  'american express',
  'diners',
  'חיוב כרטיס',
  'הוראת קבע כרטיס',
  'חיוב כרטיסי אשראי',
  'כרטיס חיוב',
  'הו"ק כרטיס',
  'מקס איט פיננסים',
  'cal - כרטיסי אשראי',
  'חיוב מועדון',
  'חיוב חשבון כרטיס',
  'direct debit',
];

/**
 * Checks whether text matches credit card billing patterns.
 */
export function isCcBillingPattern(text, userPatterns = []) {
  if (!text || typeof text !== 'string') return false;
  const clean = text.trim().toLowerCase();
  
  // 1. Check user custom patterns
  for (const p of userPatterns) {
    if (p && clean.includes(String(p).trim().toLowerCase())) return true;
  }

  // 2. Check built-in Israeli credit card companies and keywords
  for (const p of KNOWN_CC_PATTERNS) {
    if (clean.includes(p.toLowerCase())) return true;
  }

  return false;
}

/**
 * Calculates reconciliation match score between a bank billing transaction and candidate transaction.
 * 
 * Rules:
 * - Amount proximity has DOMINANT weight (up to 80 pts).
 * - Proximity in date provides up to 20 pts.
 * - Account complementarity (bank checking vs credit card) adds 5 pts.
 * - Exact amount match is strictly required for auto-link eligibility (>= 85%).
 */
export function calculateReconciliationScore(bankTx, candTx) {
  if (!bankTx || !candTx || bankTx.id === candTx.id) {
    return { score: 0, isExactAmount: false, diffAmount: 0, diffDays: 0 };
  }

  const amtBank = Math.abs(parseFloat(bankTx.amount) || 0);
  const amtCand = Math.abs(parseFloat(candTx.amount) || 0);
  if (amtBank === 0 || amtCand === 0) {
    return { score: 0, isExactAmount: false, diffAmount: 0, diffDays: 0 };
  }

  const diffAmount = Math.abs(amtBank - amtCand);
  const isExactAmount = diffAmount < 0.01;
  const pctDiff = diffAmount / Math.max(amtBank, 1);

  // 1. Amount Proximity Score (up to 80 points)
  let amountScore = 0;
  if (isExactAmount) {
    amountScore = 80;
  } else if (pctDiff <= 0.002) { // 0.2%
    amountScore = 65;
  } else if (pctDiff <= 0.005) { // 0.5% (e.g. few agorot)
    amountScore = 55;
  } else if (pctDiff <= 0.015) { // 1.5% (typical FX fee)
    amountScore = 45;
  } else if (pctDiff <= 0.03) {  // 3% (e.g. ₪15 fee on ₪3,000)
    amountScore = 32;
  } else if (pctDiff <= 0.05) {  // 5%
    amountScore = 18;
  } else {
    amountScore = 0;
  }

  // If amount difference exceeds 5%, no match
  if (amountScore === 0) {
    return { score: 0, isExactAmount, diffAmount, diffDays: 0 };
  }

  // 2. Date Proximity Score (up to 20 points)
  const dBank = new Date(bankTx.date);
  const dCand = new Date(candTx.date);
  const diffDays = Math.round((dBank - dCand) / (1000 * 3600 * 24)); // Positive if cand is before bank

  let dateScore = 0;
  if (diffDays >= 0 && diffDays <= 4) {
    dateScore = 20;
  } else if (diffDays >= 5 && diffDays <= 10) {
    dateScore = 16;
  } else if (diffDays >= 11 && diffDays <= 20) {
    dateScore = 12;
  } else if (diffDays >= 21 && diffDays <= 35) {
    dateScore = 8;
  } else if (diffDays >= -5 && diffDays < 0) {
    // Booking delay: bank showed charge 1-5 days before card synced
    dateScore = 10;
  } else {
    dateScore = 0;
  }

  // 3. Complementary account bonus (+5 points)
  let accountBonus = 0;
  if (bankTx.accountId !== candTx.accountId) {
    accountBonus = 5;
  }

  const totalScore = Math.min(100, Math.round(amountScore + dateScore + accountBonus));

  return {
    score: totalScore,
    isExactAmount,
    diffAmount: Number(diffAmount.toFixed(2)),
    diffDays,
    eligibleForAutoLink: totalScore >= 85 && isExactAmount, // STRICT: Auto-link ONLY on exact amount!
  };
}

/**
 * Finds matching candidates for a given credit card billing transaction.
 */
export async function findMatchesForTransaction(pool, txId, options = {}) {
  const minScore = options.minScore ?? 35;
  const daysWindow = options.daysWindow ?? 45;

  // 1. Fetch the target transaction
  const targetRes = await pool.query(`
    SELECT t.id, t.account_id AS "accountId", t.date, t.amount, t.currency,
           t.merchant_name AS "merchantName", t.description, t.category,
           t.is_cc_billing AS "isCcBilling",
           b.bank_company AS "bankCompany", b.display_name AS "accountDisplayName"
    FROM transactions t
    JOIN bank_accounts b ON t.account_id = b.id
    WHERE t.id = $1
  `, [txId]);

  if (targetRes.rows.length === 0) return [];
  const target = targetRes.rows[0];

  // 2. Fetch candidate transactions in +/- daysWindow window that are NOT already linked to this transaction
  const candRes = await pool.query(`
    SELECT t.id, t.account_id AS "accountId", t.date, t.amount, t.currency,
           t.merchant_name AS "merchantName", t.description, t.category,
           t.user_description AS "userDescription",
           b.bank_company AS "bankCompany", b.display_name AS "accountDisplayName"
    FROM transactions t
    JOIN bank_accounts b ON t.account_id = b.id
    WHERE t.id != $1
      AND t.date BETWEEN ($2::date - ($3 || ' days')::interval) AND ($2::date + ($3 || ' days')::interval)
      AND NOT EXISTS (
        SELECT 1 FROM transaction_links tl 
        WHERE (tl.transaction_id_a = $1 AND tl.transaction_id_b = t.id)
           OR (tl.transaction_id_b = $1 AND tl.transaction_id_a = t.id)
      )
    ORDER BY t.date DESC
    LIMIT 100
  `, [txId, target.date, daysWindow]);

  const candidates = [];
  for (const cand of candRes.rows) {
    const match = calculateReconciliationScore(target, cand);
    if (match.score >= minScore) {
      candidates.push({
        candidate: cand,
        ...match,
      });
    }
  }

  // Sort by score descending (highest confidence first)
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

/**
 * Runs automatic reconciliation on all unlinked credit card billing transactions.
 * STRICT: Only links transactions with score >= 85% AND 100% exact amount match!
 */
export async function runAutoReconciliation(pool, userId, options = {}) {
  const threshold = options.autoThreshold ?? 85;

  // 1. Fetch unlinked CC billing transactions
  const billingsRes = await pool.query(`
    SELECT t.id, t.account_id AS "accountId", t.date, t.amount, t.currency,
           t.merchant_name AS "merchantName", t.description, t.category
    FROM transactions t
    JOIN bank_accounts b ON t.account_id = b.id
    WHERE b.user_id = $1
      AND (t.is_cc_billing = true OR t.category = 'חיוב אשראי')
      AND NOT EXISTS (
        SELECT 1 FROM transaction_links tl 
        WHERE tl.transaction_id_a = t.id OR tl.transaction_id_b = t.id
      )
    ORDER BY t.date DESC
  `, [userId]);

  let linkedCount = 0;
  const client = await pool.connect();

  try {
    for (const bTx of billingsRes.rows) {
      const matches = await findMatchesForTransaction(pool, bTx.id, { minScore: threshold });
      // Filter strictly for exact amount matches
      const bestExact = matches.find((m) => m.eligibleForAutoLink);
      if (bestExact) {
        // Link them
        await client.query(`
          INSERT INTO transaction_links (transaction_id_a, transaction_id_b, link_type, note, created_at)
          VALUES ($1, $2, 'cc_billing_match', $3, NOW())
          ON CONFLICT (transaction_id_a, transaction_id_b) DO NOTHING
        `, [bTx.id, bestExact.candidate.id, `התאמה אוטומטית בדיוק סכום (${bestExact.score}%)`]);
        linkedCount++;
      }
    }
  } finally {
    client.release();
  }

  return { linkedCount, processedBillings: billingsRes.rows.length };
}

/**
 * Scans transactions and tags credit card billings.
 * Categorizes them to 'חיוב אשראי' and sets is_ignored = true by default.
 */
export async function detectAndTagCcBillings(pool, userId, userPatterns = []) {
  const client = await pool.connect();
  try {
    // 1. Find potential CC billings in bank checking accounts
    const candidatesRes = await client.query(`
      SELECT t.id, t.merchant_name, t.description, t.amount, t.is_ignored, t.category, b.bank_company
      FROM transactions t
      JOIN bank_accounts b ON t.account_id = b.id
      WHERE b.user_id = $1
        AND b.bank_company NOT IN ('max', 'cal', 'isracard', 'amex')
        AND (t.is_cc_billing = false OR t.is_cc_billing IS NULL)
    `, [userId]);

    let taggedCount = 0;
    for (const tx of candidatesRes.rows) {
      const match = isCcBillingPattern(`${tx.merchant_name || ''} ${tx.description || ''}`, userPatterns);
      if (match) {
        await client.query(`
          UPDATE transactions
          SET is_cc_billing = true,
              category = CASE WHEN category = 'חיוב אשראי' THEN category ELSE 'חיוב אשראי' END,
              is_ignored = true
          WHERE id = $1
        `, [tx.id]);
        taggedCount++;
      }
    }

    return { taggedCount };
  } finally {
    client.release();
  }
}
