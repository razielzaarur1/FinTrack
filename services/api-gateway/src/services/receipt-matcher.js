import { pool } from '../db.js';
import { classifyWithAi } from './ai-classifier.js';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Searches for a matching transaction for an ingested receipt and links it if found.
 *
 * @param {string} receiptId
 * @param {object} [client] - Optional db client
 * @returns {Promise<{ matched: boolean, transaction?: object, receipt?: object }>}
 */
export async function matchAndLinkReceipt(receiptId, client = pool) {
  try {
    const receiptRes = await client.query(
      `SELECT id, transaction_id, file_name, file_path, source_url, extracted_data, receipt_source, created_at
       FROM transaction_receipts
       WHERE id = $1`,
      [receiptId]
    );

    if (receiptRes.rows.length === 0) {
      return { matched: false, error: 'Receipt not found' };
    }

    const receipt = receiptRes.rows[0];

    // If already linked, return existing transaction
    if (receipt.transaction_id) {
      const txRes = await client.query(
        `SELECT t.id, t.amount, t.date, t.merchant_name, t.description, t.category, b.display_name
         FROM transactions t
         JOIN bank_accounts b ON t.account_id = b.id
         WHERE t.id = $1`,
        [receipt.transaction_id]
      );
      return { matched: true, transaction: txRes.rows[0], receipt, alreadyLinked: true };
    }

    const extracted = receipt.extracted_data || {};
    const total = parseFloat(extracted.total) || 0;
    const dateStr = extracted.date ? String(extracted.date).trim().slice(0, 10) : null;
    const vendor = (extracted.vendor ? String(extracted.vendor).trim() : '');

    if (!total && !dateStr && !vendor) {
      return { matched: false, receipt, reason: 'insufficient_extracted_data' };
    }

    // Build matching query against user transactions
    const params = [DEFAULT_USER_ID];
    const scoreParts = [];

    // Amount score (highest weight: 65 points for exact match within 5 agorot)
    if (total > 0) {
      params.push(total);
      const pIdx = params.length;
      scoreParts.push(`CASE 
        WHEN ABS(ABS(t.amount) - $${pIdx}) < 0.05 THEN 65
        WHEN ABS(ABS(t.amount) - $${pIdx}) <= 1.00 THEN 40
        WHEN ABS(ABS(t.amount) - $${pIdx}) <= 3.00 THEN 20
        ELSE 0 
      END`);
    }

    // Date score (up to 35 points if close in date)
    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      params.push(dateStr);
      const pIdx = params.length;
      scoreParts.push(`CASE 
        WHEN t.date = $${pIdx}::date THEN 35
        WHEN ABS(t.date - $${pIdx}::date) <= 2 THEN 25
        WHEN ABS(t.date - $${pIdx}::date) <= 5 THEN 15
        WHEN ABS(t.date - $${pIdx}::date) <= 10 THEN 5
        ELSE 0 
      END`);
    }

    // Vendor score (up to 30 points)
    if (vendor && vendor.length >= 2) {
      params.push(`%${vendor}%`);
      const pIdx = params.length;
      scoreParts.push(`CASE 
        WHEN t.merchant_name ILIKE $${pIdx} OR t.description ILIKE $${pIdx} THEN 30
        ELSE 0 
      END`);
    }

    if (scoreParts.length === 0) {
      return { matched: false, receipt };
    }

    const scoreExpr = scoreParts.join(' + ');

    const candidateQuery = `
      SELECT 
        t.id, 
        t.amount, 
        t.date, 
        t.merchant_name AS "merchantName", 
        t.description, 
        t.category, 
        t.is_manual_category AS "isManualCategory",
        b.display_name AS "accountDisplayName",
        (${scoreExpr}) AS match_score
      FROM transactions t
      JOIN bank_accounts b ON t.account_id = b.id
      WHERE b.user_id = $1
        AND (${scoreExpr}) >= 65
      ORDER BY match_score DESC, t.date DESC
      LIMIT 1
    `;

    const candidateRes = await client.query(candidateQuery, params);

    if (candidateRes.rows.length === 0) {
      return { matched: false, receipt };
    }

    const matchedTx = candidateRes.rows[0];

    // Link receipt to this transaction!
    await client.query(
      `UPDATE transaction_receipts 
       SET transaction_id = $1 
       WHERE id = $2`,
      [matchedTx.id, receiptId]
    );

    // If transaction doesn't have a manual category, refine classification using receipt items
    const items = Array.isArray(extracted.items) ? extracted.items : [];
    if (!matchedTx.isManualCategory && (items.length > 0 || vendor)) {
      try {
        const aiResult = await classifyWithAi({
          merchantName: matchedTx.merchantName || vendor,
          description: matchedTx.description,
          rawCategory: matchedTx.category,
          amount: parseFloat(matchedTx.amount),
          receiptVendor: vendor,
          receiptItems: items,
          userId: DEFAULT_USER_ID,
        });

        if (aiResult.success && aiResult.category) {
          await client.query(
            `UPDATE transactions 
             SET category = $1,
                 merchant_name = COALESCE(NULLIF($2, ''), merchant_name)
             WHERE id = $3`,
            [aiResult.category, aiResult.cleanMerchant || null, matchedTx.id]
          );
          matchedTx.category = aiResult.category;
          if (aiResult.cleanMerchant) matchedTx.merchantName = aiResult.cleanMerchant;
        }
      } catch (err) {
        console.warn('[ReceiptMatcher] AI refinement error:', err.message);
      }
    }

    return {
      matched: true,
      transaction: matchedTx,
      receipt: { ...receipt, transaction_id: matchedTx.id },
    };
  } catch (err) {
    console.error('[ReceiptMatcher] matchAndLinkReceipt failed:', err);
    return { matched: false, error: err.message };
  }
}

/**
 * Checks if any unlinked receipt in the system matches a newly created or updated transaction.
 *
 * @param {object} transaction - Transaction row (id, amount, date, merchant_name, description)
 * @param {object} [client] - Optional db client
 * @returns {Promise<{ linked: boolean, receipt?: object }>}
 */
export async function matchPendingReceiptsForTransaction(transaction, client = pool) {
  if (!transaction || !transaction.id) return { linked: false };

  const txAmount = Math.abs(parseFloat(transaction.amount || 0));
  if (txAmount <= 0) return { linked: false };

  const txDate = transaction.date instanceof Date 
    ? transaction.date.toISOString().slice(0, 10) 
    : String(transaction.date || '').slice(0, 10);

  const txMerchant = (transaction.merchant_name || transaction.merchantName || transaction.description || '').trim();

  try {
    // Find unlinked receipts
    const unlinkedRes = await client.query(
      `SELECT id, file_name, file_path, source_url, extracted_data, created_at
       FROM transaction_receipts
       WHERE transaction_id IS NULL
         AND extracted_data IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 40`
    );

    for (const r of unlinkedRes.rows) {
      const ext = r.extracted_data || {};
      const rTotal = parseFloat(ext.total) || 0;
      const rDate = ext.date ? String(ext.date).slice(0, 10) : null;
      const rVendor = ext.vendor ? String(ext.vendor).trim() : '';

      // Check amount match within 0.05
      const amountDiff = Math.abs(rTotal - txAmount);
      if (amountDiff > 0.05) continue;

      // Check date within 5 days
      if (txDate && rDate) {
        const diffMs = Math.abs(new Date(txDate).getTime() - new Date(rDate).getTime());
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays > 5) continue;
      }

      // Check vendor similarity if available
      let vendorBonus = false;
      if (rVendor && txMerchant) {
        const cleanVendor = rVendor.toLowerCase().replace(/[^a-z0-9א-ת]/g, '');
        const cleanTxM = txMerchant.toLowerCase().replace(/[^a-z0-9א-ת]/g, '');
        if (cleanVendor.includes(cleanTxM) || cleanTxM.includes(cleanVendor)) {
          vendorBonus = true;
        }
      }

      // We have a strong match! Link receipt to transaction
      await client.query(
        `UPDATE transaction_receipts 
         SET transaction_id = $1 
         WHERE id = $2`,
        [transaction.id, r.id]
      );

      console.log(`[ReceiptMatcher] Auto-linked pending receipt ${r.id} to transaction ${transaction.id} (Amount: ₪${txAmount})`);

      // Refine transaction category with receipt items if not manual
      const items = Array.isArray(ext.items) ? ext.items : [];
      if (!transaction.is_manual_category && !transaction.isManualCategory && (items.length > 0 || rVendor)) {
        try {
          const aiResult = await classifyWithAi({
            merchantName: txMerchant || rVendor,
            description: transaction.description,
            rawCategory: transaction.category,
            amount: parseFloat(transaction.amount),
            receiptVendor: rVendor,
            receiptItems: items,
            userId: DEFAULT_USER_ID,
          });

          if (aiResult.success && aiResult.category) {
            await client.query(
              `UPDATE transactions 
               SET category = $1,
                   merchant_name = COALESCE(NULLIF($2, ''), merchant_name)
               WHERE id = $3`,
              [aiResult.category, aiResult.cleanMerchant || null, transaction.id]
            );
          }
        } catch (aiErr) {
          console.warn('[ReceiptMatcher] AI refinement on pending receipt link error:', aiErr.message);
        }
      }

      return {
        linked: true,
        receipt: {
          id: r.id,
          vendor: rVendor || txMerchant,
          total: rTotal || txAmount,
          filePath: r.file_path,
          sourceUrl: r.source_url,
          itemsCount: items.length,
        },
      };
    }

    return { linked: false };
  } catch (err) {
    console.warn('[ReceiptMatcher] matchPendingReceiptsForTransaction error:', err.message);
    return { linked: false };
  }
}
