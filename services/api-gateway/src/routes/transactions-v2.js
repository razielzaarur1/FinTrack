import { z } from 'zod';
import { pool } from '../db.js';
import { saveUserRule } from '../services/classifier.js';

const bulkUpdateSchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1, 'At least one transaction ID is required'),
  category: z.string().optional(),
  isIgnored: z.boolean().optional(),
});

const splitItemSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  category: z.string().min(1, 'Category is required'),
  description: z.string().optional().nullable(),
});

const saveSplitsSchema = z.object({
  splits: z.array(splitItemSchema).min(1, 'At least one split is required'),
});

const noteSchema = z.object({
  note: z.string().min(1, 'Note content cannot be empty'),
});

const linkSchema = z.object({
  targetTransactionId: z.string().uuid('Target transaction ID must be a valid UUID'),
  linkType: z.enum(['refund', 'correction', 'related']).default('related'),
  note: z.string().optional().nullable(),
});

const updateTransactionSchema = z.object({
  category: z.string().optional(),
  userDescription: z.string().optional().nullable(),
  isIgnored: z.boolean().optional(),
});

const cursorPaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(), // ISO date or compound cursor
  cursorId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  category: z.string().optional(),
  type: z.enum(['income', 'expense', 'all']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().optional(),
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().optional(),
  hasNotes: z.coerce.boolean().optional(),
  hasSplits: z.coerce.boolean().optional(),
  isIgnored: z.coerce.boolean().default(false),
});

export default async function transactionsV2Routes(fastify, options) {
  // GET /api/v2/transactions - Cursor-based Infinite Scroll Transactions with rich multi-filters
  fastify.get('/', async (request, reply) => {
    const parseResult = cursorPaginationQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Invalid Query Parameters',
        details: parseResult.error.issues,
      });
    }

    const {
      limit,
      cursor,
      cursorId,
      accountId,
      category,
      type,
      startDate,
      endDate,
      search,
      minAmount,
      maxAmount,
      hasNotes,
      hasSplits,
      isIgnored,
    } = parseResult.data;

    const conditions = [];
    const values = [];

    // Ignore filter
    if (isIgnored !== undefined) {
      values.push(isIgnored);
      conditions.push(`t.is_ignored = $${values.length}`);
    }

    // Date filters
    if (startDate) {
      values.push(startDate);
      conditions.push(`t.date >= $${values.length}`);
    }
    if (endDate) {
      values.push(endDate);
      conditions.push(`t.date <= $${values.length}`);
    }

    // Account
    if (accountId) {
      values.push(accountId);
      conditions.push(`t.account_id = $${values.length}`);
    }

    // Category
    if (category) {
      values.push(category);
      conditions.push(`t.category = $${values.length}`);
    }

    // Transaction Type: income (positive amount) vs expense (negative amount)
    if (type === 'income') {
      conditions.push(`t.amount > 0`);
    } else if (type === 'expense') {
      conditions.push(`t.amount < 0`);
    }

    // Amount range (absolute or signed)
    if (minAmount !== undefined) {
      values.push(minAmount);
      conditions.push(`ABS(t.amount) >= $${values.length}`);
    }
    if (maxAmount !== undefined) {
      values.push(maxAmount);
      conditions.push(`ABS(t.amount) <= $${values.length}`);
    }

    // Search query in description, user_description or merchant_name
    if (search && search.trim()) {
      values.push(`%${search.trim()}%`);
      conditions.push(`(
        t.description ILIKE $${values.length} OR 
        t.merchant_name ILIKE $${values.length} OR 
        COALESCE(t.user_description, '') ILIKE $${values.length}
      )`);
    }

    // Filter by notes existence
    if (hasNotes === true) {
      conditions.push(`EXISTS (SELECT 1 FROM transaction_notes tn WHERE tn.transaction_id = t.id)`);
    }

    // Filter by splits existence
    if (hasSplits === true) {
      conditions.push(`t.is_split = true`);
    }

    // Cursor Pagination Condition (ordered by date DESC, id DESC)
    if (cursor && cursorId) {
      values.push(cursor);
      const curDateIdx = values.length;
      values.push(cursorId);
      const curIdIdx = values.length;
      conditions.push(`(t.date < $${curDateIdx} OR (t.date = $${curDateIdx} AND t.id < $${curIdIdx}))`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Query limit + 1 to check if hasNextPage
    values.push(limit + 1);
    const limitIdx = values.length;

    const query = `
      SELECT 
        t.id,
        t.account_id AS "accountId",
        b.bank_company AS "bankCompany",
        b.display_name AS "accountDisplayName",
        b.account_number AS "accountNumber",
        t.external_id AS "externalId",
        t.date,
        t.processed_date AS "processedDate",
        t.amount,
        t.currency,
        t.description,
        t.merchant_name AS "merchantName",
        t.category,
        t.user_description AS "userDescription",
        t.is_ignored AS "isIgnored",
        t.is_split AS "isSplit",
        CASE
          WHEN LOWER(t.merchant_name) LIKE '%משיכת מזומן%' 
            OR LOWER(t.description) LIKE '%משיכת מזומן%' 
            OR LOWER(t.merchant_name) LIKE '%כספומט%'
            OR LOWER(t.description) LIKE '%כספומט%' 
            OR LOWER(t.merchant_name) LIKE '%atm%'
          THEN true
          ELSE false
        END AS "isCashWithdrawal",
        t.status,
        t.created_at AS "createdAt",
        (SELECT COUNT(*) FROM transaction_notes tn WHERE tn.transaction_id = t.id) > 0 AS "hasNotes",
        (SELECT COUNT(*) FROM transaction_links tl WHERE tl.transaction_id_a = t.id OR tl.transaction_id_b = t.id) > 0 AS "hasLinks"
      FROM transactions t
      JOIN bank_accounts b ON t.account_id = b.id
      ${whereClause}
      ORDER BY t.date DESC, t.id DESC
      LIMIT $${limitIdx}
    `;

    try {
      const result = await pool.query(query, values);
      const rows = result.rows;
      const hasNextPage = rows.length > limit;
      const data = hasNextPage ? rows.slice(0, limit) : rows;

      const nextCursor = data.length > 0 ? data[data.length - 1].date : null;
      const nextCursorId = data.length > 0 ? data[data.length - 1].id : null;

      return reply.code(200).send({
        data,
        nextCursor: hasNextPage ? nextCursor : null,
        nextCursorId: hasNextPage ? nextCursorId : null,
        hasNextPage,
      });
    } catch (err) {
      fastify.log.error(err, 'Error in cursor transactions query');
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });

  // PATCH /api/v2/transactions/:id - Update category, user description, or ignore status
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params;
    const parseResult = updateTransactionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'Validation Error', details: parseResult.error.issues });
    }

    const { category, userDescription, isIgnored } = parseResult.data;
    const setClauses = [];
    const values = [];

    if (category !== undefined) {
      values.push(category);
      setClauses.push(`category = $${values.length}`);
    }
    if (userDescription !== undefined) {
      values.push(userDescription);
      setClauses.push(`user_description = $${values.length}`);
    }
    if (isIgnored !== undefined) {
      values.push(isIgnored);
      setClauses.push(`is_ignored = $${values.length}`);
    }

    if (setClauses.length === 0) {
      return reply.code(400).send({ error: 'Nothing to update' });
    }

    values.push(id);
    const query = `
      UPDATE transactions 
      SET ${setClauses.join(', ')} 
      WHERE id = $${values.length}
      RETURNING id, category, user_description AS "userDescription", is_ignored AS "isIgnored"
    `;

    try {
      const result = await pool.query(query, values);
      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Transaction not found' });
      }

      // Auto-learn user categorization rule if category was updated
      if (category) {
        pool.query('SELECT merchant_name FROM transactions WHERE id = $1', [id])
          .then((res) => {
            const m = res.rows[0]?.merchant_name;
            if (m && m.trim() && m !== 'בית עסק') {
              saveUserRule({
                userId: '00000000-0000-0000-0000-000000000001',
                merchantPattern: m.trim(),
                category: category,
                matchType: 'exact',
              }).catch(() => {});
            }
          })
          .catch(() => {});
      }

      return reply.code(200).send({ success: true, data: result.rows[0] });
    } catch (err) {
      fastify.log.error(err, 'Failed to update transaction');
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });

  // POST /api/v2/transactions/bulk-update - Update multiple transactions category or ignored status
  fastify.post('/bulk-update', async (request, reply) => {
    const parseResult = bulkUpdateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'Validation Error', details: parseResult.error.issues });
    }

    const { transactionIds, category, isIgnored } = parseResult.data;
    const setClauses = [];
    const values = [];

    if (category !== undefined) {
      values.push(category);
      setClauses.push(`category = $${values.length}`);
    }
    if (isIgnored !== undefined) {
      values.push(isIgnored);
      setClauses.push(`is_ignored = $${values.length}`);
    }

    if (setClauses.length === 0) {
      return reply.code(400).send({ error: 'Nothing to update' });
    }

    values.push(transactionIds);
    const query = `
      UPDATE transactions
      SET ${setClauses.join(', ')}
      WHERE id = ANY($${values.length}::uuid[])
      RETURNING id, category, is_ignored AS "isIgnored"
    `;

    try {
      const result = await pool.query(query, values);

      // Also learn user rule for merchants of updated transactions
      if (category) {
        pool.query(
          `SELECT DISTINCT merchant_name FROM transactions WHERE id = ANY($1::uuid[]) AND merchant_name IS NOT NULL`,
          [transactionIds]
        ).then((res) => {
          for (const row of res.rows) {
            if (row.merchant_name && row.merchant_name.trim() && row.merchant_name !== 'בית עסק') {
              saveUserRule({
                userId: '00000000-0000-0000-0000-000000000001',
                merchantPattern: row.merchant_name.trim(),
                category: category,
                matchType: 'exact',
              }).catch(() => {});
            }
          }
        }).catch(() => {});
      }

      return reply.code(200).send({
        success: true,
        updatedCount: result.rowCount,
        data: result.rows,
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to bulk update transactions');
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });

  // GET /api/v2/transactions/:id/splits - Get splits for a transaction
  fastify.get('/:id/splits', async (request, reply) => {
    const { id } = request.params;
    try {
      const result = await pool.query(
        `SELECT id, transaction_id AS "transactionId", amount, category, description, created_at AS "createdAt"
         FROM transaction_splits 
         WHERE transaction_id = $1 
         ORDER BY created_at ASC`,
        [id]
      );
      return reply.code(200).send({ data: result.rows });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });

  // PUT /api/v2/transactions/:id/splits - Replace/save splits with strict balance check
  fastify.put('/:id/splits', async (request, reply) => {
    const { id } = request.params;
    const parseResult = saveSplitsSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'Validation Error', details: parseResult.error.issues });
    }

    const { splits } = parseResult.data;

    // Verify parent transaction exists and get absolute amount
    const txRes = await pool.query('SELECT id, amount FROM transactions WHERE id = $1', [id]);
    if (txRes.rows.length === 0) {
      return reply.code(404).send({ error: 'Transaction not found' });
    }

    const parentAmount = Math.abs(parseFloat(txRes.rows[0].amount));
    const splitsSum = splits.reduce((acc, curr) => acc + parseFloat(curr.amount), 0);

    // Enforce balance within 0.01 tolerance
    if (Math.abs(parentAmount - splitsSum) > 0.01) {
      return reply.code(400).send({
        error: 'Split Balance Mismatch',
        message: `Total splits sum (₪${splitsSum.toFixed(2)}) must exactly equal original transaction amount (₪${parentAmount.toFixed(2)})`,
        parentAmount,
        splitsSum,
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM transaction_splits WHERE transaction_id = $1', [id]);

      for (const split of splits) {
        await client.query(
          `INSERT INTO transaction_splits (transaction_id, amount, category, description)
           VALUES ($1, $2, $3, $4)`,
          [id, split.amount, split.category, split.description || null]
        );
      }

      await client.query('UPDATE transactions SET is_split = true WHERE id = $1', [id]);

      // Check if any split is allocated to "ארנק" (Cash Wallet)
      const walletSplit = splits.find(s => 
        (s.category && s.category.includes('ארנק')) || 
        (s.description && s.description.includes('ארנק'))
      );
      if (walletSplit && walletSplit.amount > 0) {
        await client.query(
          `UPDATE bank_accounts 
           SET balance = balance + $1 
           WHERE bank_company = 'wallet' AND user_id = '00000000-0000-0000-0000-000000000001'`,
          [walletSplit.amount]
        );
      }

      await client.query('COMMIT');

      const updated = await pool.query(
        'SELECT id, amount, category, description FROM transaction_splits WHERE transaction_id = $1',
        [id]
      );
      return reply.code(200).send({ success: true, data: updated.rows });
    } catch (err) {
      await client.query('ROLLBACK');
      fastify.log.error(err, 'Failed to save transaction splits');
      return reply.code(500).send({ error: 'Database error', message: err.message });
    } finally {
      client.release();
    }
  });

  // DELETE /api/v2/transactions/:id/splits - Remove all splits
  fastify.delete('/:id/splits', async (request, reply) => {
    const { id } = request.params;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM transaction_splits WHERE transaction_id = $1', [id]);
      await client.query('UPDATE transactions SET is_split = false WHERE id = $1', [id]);
      await client.query('COMMIT');
      return reply.code(200).send({ success: true, message: 'Splits removed' });
    } catch (err) {
      await client.query('ROLLBACK');
      return reply.code(500).send({ error: 'Database error', message: err.message });
    } finally {
      client.release();
    }
  });

  // GET /api/v2/transactions/:id/notes - Get notes for a transaction
  fastify.get('/:id/notes', async (request, reply) => {
    const { id } = request.params;
    try {
      const result = await pool.query(
        `SELECT id, transaction_id AS "transactionId", note, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM transaction_notes 
         WHERE transaction_id = $1 
         ORDER BY created_at DESC`,
        [id]
      );
      return reply.code(200).send({ data: result.rows });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });

  // POST /api/v2/transactions/:id/notes - Add note
  fastify.post('/:id/notes', async (request, reply) => {
    const { id } = request.params;
    const parseResult = noteSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'Validation Error', details: parseResult.error.issues });
    }

    try {
      const result = await pool.query(
        `INSERT INTO transaction_notes (transaction_id, note)
         VALUES ($1, $2)
         RETURNING id, transaction_id AS "transactionId", note, created_at AS "createdAt"`,
        [id, parseResult.data.note]
      );
      return reply.code(201).send({ success: true, data: result.rows[0] });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });

  // DELETE /api/v2/transactions/notes/:noteId - Delete note
  fastify.delete('/notes/:noteId', async (request, reply) => {
    const { noteId } = request.params;
    try {
      const result = await pool.query('DELETE FROM transaction_notes WHERE id = $1 RETURNING id', [noteId]);
      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Note not found' });
      }
      return reply.code(200).send({ success: true });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });

  // GET /api/v2/transactions/:id/links - Get linked transactions
  fastify.get('/:id/links', async (request, reply) => {
    const { id } = request.params;
    const query = `
      SELECT 
        tl.id AS "linkId",
        tl.link_type AS "linkType",
        tl.note AS "linkNote",
        tl.created_at AS "linkedAt",
        t.id,
        t.date,
        t.amount,
        t.currency,
        t.description,
        t.category,
        b.bank_company AS "bankCompany"
      FROM transaction_links tl
      JOIN transactions t ON (
        CASE 
          WHEN tl.transaction_id_a = $1 THEN tl.transaction_id_b = t.id
          ELSE tl.transaction_id_a = t.id
        END
      )
      JOIN bank_accounts b ON t.account_id = b.id
      WHERE tl.transaction_id_a = $1 OR tl.transaction_id_b = $1
    `;
    try {
      const result = await pool.query(query, [id]);
      return reply.code(200).send({ data: result.rows });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });

  // POST /api/v2/transactions/:id/links - Link this transaction to another
  fastify.post('/:id/links', async (request, reply) => {
    const { id } = request.params;
    const parseResult = linkSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'Validation Error', details: parseResult.error.issues });
    }

    const { targetTransactionId, linkType, note } = parseResult.data;
    if (id === targetTransactionId) {
      return reply.code(400).send({ error: 'Cannot link a transaction to itself' });
    }

    try {
      const result = await pool.query(
        `INSERT INTO transaction_links (transaction_id_a, transaction_id_b, link_type, note)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (transaction_id_a, transaction_id_b) DO UPDATE
         SET link_type = EXCLUDED.link_type, note = EXCLUDED.note
         RETURNING id, transaction_id_a AS "transactionIdA", transaction_id_b AS "transactionIdB", link_type AS "linkType", note`,
        [id, targetTransactionId, linkType, note || null]
      );
      return reply.code(201).send({ success: true, data: result.rows[0] });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });

  // DELETE /api/v2/transactions/links/:linkId - Remove link
  fastify.delete('/links/:linkId', async (request, reply) => {
    const { linkId } = request.params;
    try {
      const result = await pool.query('DELETE FROM transaction_links WHERE id = $1 RETURNING id', [linkId]);
      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Link not found' });
      }
      return reply.code(200).send({ success: true });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });
}
