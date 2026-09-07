import { z } from 'zod';
import { pool } from '../db.js';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

const createBudgetSchema = z
  .object({
    category: z.string().min(1, 'Category is required'),
    monthly_limit: z.coerce.number().positive('Monthly limit must be greater than 0').optional(),
    monthlyLimit: z.coerce.number().positive('Monthly limit must be greater than 0').optional(),
    currency: z.string().default('ILS').optional(),
  })
  .refine(
    (data) => data.monthly_limit !== undefined || data.monthlyLimit !== undefined,
    {
      message: 'monthly_limit or monthlyLimit is required',
      path: ['monthly_limit'],
    }
  );

export default async function budgetsRoutes(fastify, options) {
  // GET / - List budgets for user
  fastify.get('/', async (request, reply) => {
    try {
      const result = await pool.query(
        `SELECT id, user_id, category, monthly_limit, currency, created_at, updated_at
         FROM budgets
         WHERE user_id = $1
         ORDER BY category ASC`,
        [DEFAULT_USER_ID]
      );

      return reply.code(200).send(result.rows);
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch budgets');
      return reply.code(500).send({ error: 'Internal Server Error', message: err.message });
    }
  });

  // POST / - Create or update budget
  fastify.post('/', async (request, reply) => {
    const parseResult = createBudgetSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Validation Error',
        details: parseResult.error.issues,
      });
    }

    const { category, currency = 'ILS' } = parseResult.data;
    const monthlyLimit = parseResult.data.monthly_limit ?? parseResult.data.monthlyLimit;

    try {
      const result = await pool.query(
        `INSERT INTO budgets (user_id, category, monthly_limit, currency, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (user_id, category)
         DO UPDATE SET
           monthly_limit = EXCLUDED.monthly_limit,
           currency = EXCLUDED.currency,
           updated_at = NOW()
         RETURNING id, user_id, category, monthly_limit, currency, created_at, updated_at`,
        [DEFAULT_USER_ID, category, monthlyLimit, currency]
      );

      return reply.code(201).send(result.rows[0]);
    } catch (err) {
      fastify.log.error(err, 'Failed to save budget');
      return reply.code(500).send({ error: 'Internal Server Error', message: err.message });
    }
  });

  // DELETE /:id - Delete budget by id
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const result = await pool.query(
        `DELETE FROM budgets
         WHERE id = $1 AND user_id = $2
         RETURNING id, category`,
        [id, DEFAULT_USER_ID]
      );

      if (result.rowCount === 0) {
        return reply.code(404).send({ error: 'Not Found', message: 'Budget not found' });
      }

      return reply.code(200).send({
        message: 'Budget deleted successfully',
        budget: result.rows[0],
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to delete budget');
      return reply.code(500).send({ error: 'Internal Server Error', message: err.message });
    }
  });
}
