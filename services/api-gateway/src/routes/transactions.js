import { z } from 'zod';
import { pool } from '../db.js';

const updateCategorySchema = z.object({
  category: z.string().min(1, 'Category name is required'),
});

const getTransactionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  page: z.coerce.number().int().min(1).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  accountId: z.string().uuid().optional(),
  category: z.string().optional(),
});

export default async function transactionsRoutes(fastify, options) {
  // GET /transactions - List transactions with pagination and date/account filters
  fastify.get('/', async (request, reply) => {
    const parseResult = getTransactionsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Invalid Query Parameters',
        details: parseResult.error.issues,
      });
    }

    const { limit, offset, page, startDate, endDate, accountId, category } = parseResult.data;
    const actualOffset = page ? (page - 1) * limit : offset;

    const conditions = [];
    const values = [];

    if (startDate) {
      values.push(startDate);
      conditions.push(`t.date >= $${values.length}`);
    }

    if (endDate) {
      values.push(endDate);
      conditions.push(`t.date <= $${values.length}`);
    }

    if (accountId) {
      values.push(accountId);
      conditions.push(`t.account_id = $${values.length}`);
    }

    if (category) {
      values.push(category);
      conditions.push(`t.category = $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
      // Get total count for pagination metadata
      const countSql = `SELECT COUNT(*) AS total FROM transactions t ${whereClause}`;
      const countResult = await pool.query(countSql, values);
      const total = parseInt(countResult.rows[0].total, 10);

      // Get page data
      const dataValues = [...values, limit, actualOffset];
      const dataSql = `
        SELECT
          t.id,
          t.account_id,
          t.external_id,
          t.date,
          t.amount,
          t.currency,
          t.description,
          t.merchant_name,
          t.category,
          t.status,
          t.raw_data,
          t.is_notified,
          t.created_at
        FROM transactions t
        ${whereClause}
        ORDER BY t.date DESC, t.id DESC
        LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}
      `;

      const dataResult = await pool.query(dataSql, dataValues);

      return reply.code(200).send({
        data: dataResult.rows,
        pagination: {
          total,
          limit,
          offset: actualOffset,
          page: page || Math.floor(actualOffset / limit) + 1,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch transactions');
      return reply.code(500).send({ error: 'Internal Server Error', message: err.message });
    }
  });

  // PATCH /transactions/:id - Update transaction category
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params;
    const parseResult = updateCategorySchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Validation Error',
        details: parseResult.error.issues,
      });
    }

    const { category } = parseResult.data;

    try {
      const result = await pool.query(
        `UPDATE transactions
         SET category = $1
         WHERE id = $2
         RETURNING id, account_id, external_id, date, amount, currency, description, category`,
        [category, id]
      );

      if (result.rowCount === 0) {
        return reply.code(404).send({ error: 'Not Found', message: 'Transaction not found' });
      }

      return reply.code(200).send({
        message: 'Transaction category updated successfully',
        transaction: result.rows[0],
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to update transaction');
      return reply.code(500).send({ error: 'Internal Server Error', message: err.message });
    }
  });
}
