import { z } from 'zod';
import { pool } from '../db.js';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

const createCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  nameEn: z.string().max(100).optional().nullable(),
  type: z.enum(['income', 'expense', 'both']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color').default('#6366f1'),
  icon: z.string().default('tag'),
  sortOrder: z.number().int().optional().default(0),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  nameEn: z.string().max(100).optional().nullable(),
  type: z.enum(['income', 'expense', 'both']).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

export default async function categoriesRoutes(fastify, options) {
  // GET /api/categories - List all categories (system & user custom) with optional type filter
  fastify.get('/', async (request, reply) => {
    const { type } = request.query;
    const conditions = ['user_id = $1'];
    const values = [DEFAULT_USER_ID];

    if (type && (type === 'income' || type === 'expense')) {
      values.push(type);
      conditions.push(`(type = $${values.length} OR type = 'both')`);
    }

    const query = `
      SELECT 
        id,
        name,
        name_en AS "nameEn",
        type,
        color,
        icon,
        is_system AS "isSystem",
        sort_order AS "sortOrder",
        created_at AS "createdAt"
      FROM categories
      WHERE ${conditions.join(' AND ')}
      ORDER BY sort_order ASC, name ASC
    `;

    try {
      const result = await pool.query(query, values);
      return reply.code(200).send({ data: result.rows });
    } catch (err) {
      fastify.log.error(err, 'Failed to list categories');
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });

  // POST /api/categories - Create custom category
  fastify.post('/', async (request, reply) => {
    const parseResult = createCategorySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'Validation Error', details: parseResult.error.issues });
    }

    const { name, nameEn, type, color, icon, sortOrder } = parseResult.data;

    try {
      const result = await pool.query(
        `INSERT INTO categories (user_id, name, name_en, type, color, icon, is_system, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, false, $7)
         RETURNING id, name, name_en AS "nameEn", type, color, icon, is_system AS "isSystem", sort_order AS "sortOrder"`,
        [DEFAULT_USER_ID, name, nameEn || null, type, color, icon, sortOrder]
      );
      return reply.code(201).send({ success: true, data: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'Category with this name already exists' });
      }
      fastify.log.error(err, 'Failed to create category');
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });

  // PATCH /api/categories/:id - Update category
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params;
    const parseResult = updateCategorySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'Validation Error', details: parseResult.error.issues });
    }

    const { name, nameEn, type, color, icon, sortOrder } = parseResult.data;
    const setClauses = [];
    const values = [];

    if (name !== undefined) {
      values.push(name);
      setClauses.push(`name = $${values.length}`);
    }
    if (nameEn !== undefined) {
      values.push(nameEn);
      setClauses.push(`name_en = $${values.length}`);
    }
    if (type !== undefined) {
      values.push(type);
      setClauses.push(`type = $${values.length}`);
    }
    if (color !== undefined) {
      values.push(color);
      setClauses.push(`color = $${values.length}`);
    }
    if (icon !== undefined) {
      values.push(icon);
      setClauses.push(`icon = $${values.length}`);
    }
    if (sortOrder !== undefined) {
      values.push(sortOrder);
      setClauses.push(`sort_order = $${values.length}`);
    }

    if (setClauses.length === 0) {
      return reply.code(400).send({ error: 'Nothing to update' });
    }

    values.push(id, DEFAULT_USER_ID);
    const query = `
      UPDATE categories
      SET ${setClauses.join(', ')}
      WHERE id = $${values.length - 1} AND user_id = $${values.length}
      RETURNING id, name, name_en AS "nameEn", type, color, icon, is_system AS "isSystem", sort_order AS "sortOrder"
    `;

    try {
      const result = await pool.query(query, values);
      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Category not found' });
      }
      return reply.code(200).send({ success: true, data: result.rows[0] });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });

  // DELETE /api/categories/:id - Delete custom category (system categories protected)
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params;
    try {
      // Check if system
      const checkRes = await pool.query('SELECT is_system FROM categories WHERE id = $1', [id]);
      if (checkRes.rows.length === 0) {
        return reply.code(404).send({ error: 'Category not found' });
      }
      if (checkRes.rows[0].is_system) {
        return reply.code(403).send({ error: 'System categories cannot be deleted' });
      }

      await pool.query('DELETE FROM categories WHERE id = $1 AND user_id = $2', [id, DEFAULT_USER_ID]);
      return reply.code(200).send({ success: true, message: 'Category deleted' });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });
}
