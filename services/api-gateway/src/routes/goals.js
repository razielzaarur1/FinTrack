import { z } from 'zod';
import { pool } from '../db.js';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

const createGoalSchema = z
  .object({
    title: z.string().min(1, 'Title is required'),
    target_amount: z.coerce.number().positive('Target amount must be greater than 0').optional(),
    targetAmount: z.coerce.number().positive('Target amount must be greater than 0').optional(),
    current_amount: z.coerce.number().min(0).default(0).optional(),
    currentAmount: z.coerce.number().min(0).default(0).optional(),
    currency: z.string().default('ILS').optional(),
    target_date: z.string().nullable().optional(),
    targetDate: z.string().nullable().optional(),
    icon: z.string().nullable().optional(),
  })
  .refine(
    (data) => data.target_amount !== undefined || data.targetAmount !== undefined,
    {
      message: 'target_amount or targetAmount is required',
      path: ['target_amount'],
    }
  );

const patchGoalSchema = z.object({
  title: z.string().min(1).optional(),
  target_amount: z.coerce.number().positive().optional(),
  targetAmount: z.coerce.number().positive().optional(),
  current_amount: z.coerce.number().min(0).optional(),
  currentAmount: z.coerce.number().min(0).optional(),
  currency: z.string().optional(),
  target_date: z.string().nullable().optional(),
  targetDate: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
});

export default async function goalsRoutes(fastify, options) {
  // GET / - List goals for user
  fastify.get('/', async (request, reply) => {
    try {
      const result = await pool.query(
        `SELECT id, user_id, title, target_amount, current_amount, currency, target_date, icon, created_at
         FROM goals
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [DEFAULT_USER_ID]
      );

      return reply.code(200).send(result.rows);
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch goals');
      return reply.code(500).send({ error: 'Internal Server Error', message: err.message });
    }
  });

  // POST / - Create a new goal
  fastify.post('/', async (request, reply) => {
    const parseResult = createGoalSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Validation Error',
        details: parseResult.error.issues,
      });
    }

    const { title, icon = null } = parseResult.data;
    const targetAmount = parseResult.data.target_amount ?? parseResult.data.targetAmount;
    const currentAmount = parseResult.data.current_amount ?? parseResult.data.currentAmount ?? 0;
    const currency = parseResult.data.currency || 'ILS';
    const targetDate = parseResult.data.target_date ?? parseResult.data.targetDate ?? null;

    try {
      const result = await pool.query(
        `INSERT INTO goals (user_id, title, target_amount, current_amount, currency, target_date, icon, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING id, user_id, title, target_amount, current_amount, currency, target_date, icon, created_at`,
        [DEFAULT_USER_ID, title, targetAmount, currentAmount, currency, targetDate, icon]
      );

      return reply.code(201).send(result.rows[0]);
    } catch (err) {
      fastify.log.error(err, 'Failed to create goal');
      return reply.code(500).send({ error: 'Internal Server Error', message: err.message });
    }
  });

  // PATCH /:id - Update goal details
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params;
    const parseResult = patchGoalSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Validation Error',
        details: parseResult.error.issues,
      });
    }

    const data = parseResult.data;
    const updates = [];
    const values = [];

    if (data.title !== undefined) {
      values.push(data.title);
      updates.push(`title = $${values.length}`);
    }

    const targetAmount = data.target_amount ?? data.targetAmount;
    if (targetAmount !== undefined) {
      values.push(targetAmount);
      updates.push(`target_amount = $${values.length}`);
    }

    const currentAmount = data.current_amount ?? data.currentAmount;
    if (currentAmount !== undefined) {
      values.push(currentAmount);
      updates.push(`current_amount = $${values.length}`);
    }

    if (data.currency !== undefined) {
      values.push(data.currency);
      updates.push(`currency = $${values.length}`);
    }

    const targetDate = data.target_date !== undefined ? data.target_date : data.targetDate;
    if (targetDate !== undefined) {
      values.push(targetDate);
      updates.push(`target_date = $${values.length}`);
    }

    if (data.icon !== undefined) {
      values.push(data.icon);
      updates.push(`icon = $${values.length}`);
    }

    if (updates.length === 0) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'No valid fields provided for update',
      });
    }

    values.push(id, DEFAULT_USER_ID);
    const idIdx = values.length - 1;
    const userIdx = values.length;

    try {
      const sql = `
        UPDATE goals
        SET ${updates.join(', ')}
        WHERE id = $${idIdx} AND user_id = $${userIdx}
        RETURNING id, user_id, title, target_amount, current_amount, currency, target_date, icon, created_at
      `;

      const result = await pool.query(sql, values);

      if (result.rowCount === 0) {
        return reply.code(404).send({ error: 'Not Found', message: 'Goal not found' });
      }

      return reply.code(200).send({
        message: 'Goal updated successfully',
        goal: result.rows[0],
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to update goal');
      return reply.code(500).send({ error: 'Internal Server Error', message: err.message });
    }
  });

  // DELETE /:id - Delete goal by id
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const result = await pool.query(
        `DELETE FROM goals
         WHERE id = $1 AND user_id = $2
         RETURNING id, title`,
        [id, DEFAULT_USER_ID]
      );

      if (result.rowCount === 0) {
        return reply.code(404).send({ error: 'Not Found', message: 'Goal not found' });
      }

      return reply.code(200).send({
        message: 'Goal deleted successfully',
        goal: result.rows[0],
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to delete goal');
      return reply.code(500).send({ error: 'Internal Server Error', message: err.message });
    }
  });
}
