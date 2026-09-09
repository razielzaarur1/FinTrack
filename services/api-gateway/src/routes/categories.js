import { z } from 'zod';
import { pool } from '../db.js';
import {
  classifyTransaction,
  saveUserRule,
  reclassifyAllTransactions,
} from '../services/classifier.js';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

const createCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  nameEn: z.string().max(100).optional().nullable(),
  type: z.enum(['income', 'expense', 'both']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color').default('#6366f1'),
  icon: z.string().default('tag'),
  parentId: z.string().uuid().optional().nullable(),
  customSvg: z.string().optional().nullable(),
  sortOrder: z.number().int().optional().default(0),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  nameEn: z.string().max(100).optional().nullable(),
  type: z.enum(['income', 'expense', 'both']).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().optional(),
  parentId: z.string().uuid().optional().nullable(),
  customSvg: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

const classifyBodySchema = z.object({
  merchantName: z.string().optional().default(''),
  description: z.string().optional().default(''),
  rawCategory: z.string().optional().default(''),
  amount: z.number().optional().default(0),
});

const saveRuleSchema = z.object({
  merchantPattern: z.string().min(1, 'Merchant pattern is required'),
  category: z.string().min(1, 'Category is required'),
  subCategory: z.string().optional().nullable(),
  matchType: z.enum(['exact', 'contains']).default('exact'),
});

export default async function categoriesRoutes(fastify, options) {
  // GET /api/categories - List all categories (system & user custom) with optional type filter
  fastify.get('/', async (request, reply) => {
    const { type, tree } = request.query;
    const conditions = ['user_id = $1'];
    const values = [DEFAULT_USER_ID];

    if (type && (type === 'income' || type === 'expense')) {
      values.push(type);
      conditions.push(`(type = $${values.length} OR type = 'both')`);
    }

    const query = `
      SELECT 
        id,
        parent_id AS "parentId",
        name,
        name_en AS "nameEn",
        type,
        color,
        icon,
        custom_svg AS "customSvg",
        is_system AS "isSystem",
        sort_order AS "sortOrder",
        created_at AS "createdAt"
      FROM categories
      WHERE ${conditions.join(' AND ')}
      ORDER BY sort_order ASC, name ASC
    `;

    try {
      const result = await pool.query(query, values);
      const rows = result.rows;

      if (tree === 'true') {
        const map = new Map();
        const roots = [];
        for (const r of rows) {
          map.set(r.id, { ...r, subs: [] });
        }
        for (const r of rows) {
          if (r.parentId && map.has(r.parentId)) {
            map.get(r.parentId).subs.push(map.get(r.id));
          } else {
            roots.push(map.get(r.id));
          }
        }
        return reply.code(200).send({ data: roots });
      }

      return reply.code(200).send({ data: rows });
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

    const { name, nameEn, type, color, icon, parentId, customSvg, sortOrder } = parseResult.data;

    try {
      const result = await pool.query(
        `INSERT INTO categories (user_id, name, name_en, type, color, icon, parent_id, custom_svg, is_system, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9)
         RETURNING id, name, name_en AS "nameEn", type, color, icon, parent_id AS "parentId", custom_svg AS "customSvg", is_system AS "isSystem", sort_order AS "sortOrder"`,
        [DEFAULT_USER_ID, name, nameEn || null, type, color, icon, parentId || null, customSvg || null, sortOrder]
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

    const { name, nameEn, type, color, icon, parentId, customSvg, sortOrder } = parseResult.data;
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
    if (parentId !== undefined) {
      values.push(parentId);
      setClauses.push(`parent_id = $${values.length}`);
    }
    if (customSvg !== undefined) {
      values.push(customSvg);
      setClauses.push(`custom_svg = $${values.length}`);
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
      RETURNING id, name, name_en AS "nameEn", type, color, icon, parent_id AS "parentId", custom_svg AS "customSvg", is_system AS "isSystem", sort_order AS "sortOrder"
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

  // DELETE /api/categories/:id - Delete custom category
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params;
    try {
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

  // POST /api/categories/classify - Run 3-tier intelligent classification for a merchant/transaction
  fastify.post('/classify', async (request, reply) => {
    const parseResult = classifyBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'Invalid parameters', details: parseResult.error.issues });
    }

    const { merchantName, description, rawCategory, amount } = parseResult.data;
    try {
      const classification = await classifyTransaction({
        userId: DEFAULT_USER_ID,
        merchantName,
        description,
        rawCategory,
        amount,
      });
      return reply.code(200).send({ success: true, data: classification });
    } catch (err) {
      fastify.log.error(err, 'Failed to classify transaction');
      return reply.code(500).send({ error: 'Classifier error', message: err.message });
    }
  });

  // GET /api/categories/rules - List user classification rules
  fastify.get('/rules', async (request, reply) => {
    try {
      const res = await pool.query(
        `SELECT id, merchant_pattern AS "merchantPattern", category, sub_category AS "subCategory", match_type AS "matchType", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM user_category_rules
         WHERE user_id = $1
         ORDER BY updated_at DESC`,
        [DEFAULT_USER_ID]
      );
      return reply.code(200).send({ data: res.rows });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });

  // POST /api/categories/rules - Save user learning rule
  fastify.post('/rules', async (request, reply) => {
    const parseResult = saveRuleSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'Validation Error', details: parseResult.error.issues });
    }

    try {
      const saved = await saveUserRule({
        userId: DEFAULT_USER_ID,
        ...parseResult.data,
      });
      return reply.code(200).send({ success: true, data: saved });
    } catch (err) {
      fastify.log.error(err, 'Failed to save rule');
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });

  // POST /api/categories/reclassify-all - Re-run classification on all transactions
  fastify.post('/reclassify-all', async (request, reply) => {
    try {
      const result = await reclassifyAllTransactions(DEFAULT_USER_ID);
      return reply.code(200).send({ success: true, ...result });
    } catch (err) {
      fastify.log.error(err, 'Failed to reclassify transactions');
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });
}
