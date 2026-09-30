import { pool } from '../db.js';

/**
 * Consolidates duplicate transactions where an earlier 'pending' transaction
 * exists alongside a later 'completed' settled transaction.
 *
 * Transfers user modifications (custom category, manual flag, user_description,
 * review flag, receipts, notes, splits, links) from the pending transaction to the
 * completed transaction, and deletes the duplicate pending row.
 */
export async function consolidatePendingTransactions(clientOrPool = pool) {
  const findDuplicatesQuery = `
    SELECT 
      p.id AS pending_id,
      c.id AS completed_id,
      p.category AS pending_category,
      p.is_manual_category AS pending_manual_category,
      p.user_description AS pending_user_description,
      p.is_reviewed AS pending_reviewed,
      p.is_ignored AS pending_ignored,
      p.is_notified AS pending_notified,
      c.category AS completed_category,
      c.is_manual_category AS completed_manual_category,
      c.user_description AS completed_user_description,
      p.merchant_name AS pending_merchant,
      c.merchant_name AS completed_merchant,
      p.amount,
      p.date AS pending_date,
      c.date AS completed_date
    FROM transactions p
    JOIN transactions c ON p.account_id = c.account_id
      AND p.id <> c.id
      AND p.status = 'pending'
      AND c.status = 'completed'
      AND ABS(p.amount - c.amount) < 0.01
      AND p.date >= (c.date - INTERVAL '5 days')
      AND p.date <= (c.date + INTERVAL '5 days')
      AND (
        (NULLIF(TRIM(p.merchant_name), '') IS NOT NULL AND (
          LOWER(TRIM(p.merchant_name)) = LOWER(TRIM(c.merchant_name))
          OR LOWER(TRIM(p.description)) = LOWER(TRIM(c.description))
          OR c.description ILIKE '%' || TRIM(p.merchant_name) || '%'
          OR p.description ILIKE '%' || TRIM(c.merchant_name) || '%'
        ))
        OR p.external_id = c.external_id
      )
    ORDER BY p.date DESC
  `;

  let mergedCount = 0;
  const client = clientOrPool.connect ? await clientOrPool.connect() : clientOrPool;
  const isDedicatedClient = Boolean(clientOrPool.connect);

  try {
    const res = await client.query(findDuplicatesQuery);
    const pairs = res.rows || [];

    if (pairs.length === 0) {
      return { mergedCount: 0, message: 'No pending/completed duplicates found' };
    }

    const processedPendingIds = new Set();

    for (const pair of pairs) {
      if (processedPendingIds.has(pair.pending_id)) {
        continue;
      }
      processedPendingIds.add(pair.pending_id);

      await client.query('BEGIN');
      try {
        // 1. Transfer user-customized fields to completed transaction
        const setClauses = [];
        const values = [];

        if (pair.pending_manual_category && !pair.completed_manual_category && pair.pending_category) {
          values.push(pair.pending_category);
          setClauses.push(`category = $${values.length}, is_manual_category = true`);
        }

        if (pair.pending_user_description && !pair.completed_user_description) {
          values.push(pair.pending_user_description);
          setClauses.push(`user_description = $${values.length}`);
        }

        if (pair.pending_reviewed) {
          setClauses.push(`is_reviewed = true`);
        }

        if (pair.pending_ignored) {
          setClauses.push(`is_ignored = true`);
        }

        if (pair.pending_notified) {
          setClauses.push(`is_notified = true`);
        }

        if (setClauses.length > 0) {
          values.push(pair.completed_id);
          await client.query(
            `UPDATE transactions SET ${setClauses.join(', ')} WHERE id = $${values.length}`,
            values
          );
        }

        // 2. Transfer receipts
        await client.query(
          `UPDATE transaction_receipts SET transaction_id = $1 WHERE transaction_id = $2`,
          [pair.completed_id, pair.pending_id]
        );

        // 3. Transfer notes
        await client.query(
          `UPDATE transaction_notes SET transaction_id = $1 WHERE transaction_id = $2`,
          [pair.completed_id, pair.pending_id]
        );

        // 4. Transfer splits
        await client.query(
          `UPDATE transaction_splits SET transaction_id = $1 WHERE transaction_id = $2`,
          [pair.completed_id, pair.pending_id]
        );

        // 5. Transfer links
        await client.query(
          `UPDATE transaction_links 
           SET transaction_id_a = $1 
           WHERE transaction_id_a = $2 AND transaction_id_b <> $1`,
          [pair.completed_id, pair.pending_id]
        );
        await client.query(
          `UPDATE transaction_links 
           SET transaction_id_b = $1 
           WHERE transaction_id_b = $2 AND transaction_id_a <> $1`,
          [pair.completed_id, pair.pending_id]
        );
        await client.query(
          `DELETE FROM transaction_links WHERE transaction_id_a = $1 OR transaction_id_b = $1`,
          [pair.pending_id]
        );

        // 6. Delete duplicate pending row
        await client.query(`DELETE FROM transactions WHERE id = $1`, [pair.pending_id]);

        await client.query('COMMIT');
        mergedCount++;
      } catch (pairErr) {
        await client.query('ROLLBACK');
        console.warn(`[Consolidator] Failed to merge pair pending=${pair.pending_id} into completed=${pair.completed_id}:`, pairErr.message);
      }
    }

    return { mergedCount, totalFound: pairs.length };
  } finally {
    if (isDedicatedClient) {
      client.release();
    }
  }
}
