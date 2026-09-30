import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { pool, seedCategories } from '../db.js';
import { getAiSettings, getAvailableGeminiModels } from '../services/ai-analyzer.js';
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
  isActive: z.boolean().optional().default(true),
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
  isActive: z.boolean().optional(),
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
    const { type, tree, activeOnly } = request.query;
    const conditions = ['user_id = $1'];
    const values = [DEFAULT_USER_ID];

    if (activeOnly === 'true') {
      conditions.push('is_active = true');
    }

    if (type && (type === 'income' || type === 'expense')) {
      values.push(type);
      conditions.push(`(type = $${values.length} OR type = 'both')`);
    }

    const query = `
      SELECT 
        id,
        parent_id AS "parentId",
        name,
        CASE 
          WHEN name_en = name OR (parent_id IS NOT NULL AND name_en ~ '[א-ת]') THEN NULL 
          ELSE name_en 
        END AS "nameEn",
        type,
        color,
        icon,
        custom_svg AS "customSvg",
        is_system AS "isSystem",
        is_active AS "isActive",
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
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // POST /api/categories - Create custom category
  fastify.post('/', async (request, reply) => {
    const parseResult = createCategorySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'Validation Error', details: parseResult.error.issues });
    }

    const { name, nameEn, type, color, icon, parentId, customSvg, sortOrder, isActive } = parseResult.data;

    try {
      const result = await pool.query(
        `INSERT INTO categories (user_id, name, name_en, type, color, icon, parent_id, custom_svg, is_system, sort_order, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9, $10)
         RETURNING id, name, name_en AS "nameEn", type, color, icon, parent_id AS "parentId", custom_svg AS "customSvg", is_system AS "isSystem", is_active AS "isActive", sort_order AS "sortOrder"`,
        [DEFAULT_USER_ID, name, nameEn || null, type, color, icon, parentId || null, customSvg || null, sortOrder, isActive ?? true]
      );
      return reply.code(201).send({ success: true, data: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'Category with this name already exists' });
      }
      fastify.log.error(err, 'Failed to create category');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // POST /api/categories/reset-default - Restore all categories to factory default hierarchy
  fastify.post('/reset-default', async (request, reply) => {
    try {
      await seedCategories(pool, DEFAULT_USER_ID, true);

      // Return refreshed tree
      const query = `
        SELECT 
          id,
          parent_id AS "parentId",
          name,
          CASE 
          WHEN name_en = name OR (parent_id IS NOT NULL AND name_en ~ '[א-ת]') THEN NULL 
          ELSE name_en 
        END AS "nameEn",
          type,
          color,
          icon,
          custom_svg AS "customSvg",
          is_system AS "isSystem",
          is_active AS "isActive",
          sort_order AS "sortOrder",
          created_at AS "createdAt"
        FROM categories
        WHERE user_id = $1
        ORDER BY sort_order ASC, name ASC
      `;
      const result = await pool.query(query, [DEFAULT_USER_ID]);
      const rows = result.rows;

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

      return reply.code(200).send({ success: true, message: 'Categories restored to defaults', data: roots });
    } catch (err) {
      fastify.log.error(err, 'Failed to reset categories to default');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // PUT /api/categories/reorder - Update sort order for multiple categories
  fastify.put('/reorder', async (request, reply) => {
    const { orderedIds, items } = request.body || {};
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (Array.isArray(orderedIds)) {
        for (let idx = 0; idx < orderedIds.length; idx++) {
          await client.query(
            `UPDATE categories SET sort_order = $1 WHERE (id = $2 OR name = $2) AND user_id = $3`,
            [idx, orderedIds[idx], DEFAULT_USER_ID]
          );
        }
      } else if (Array.isArray(items)) {
        for (const item of items) {
          if (item.id && typeof item.sortOrder === 'number') {
            await client.query(
              `UPDATE categories SET sort_order = $1 WHERE (id = $2 OR name = $2) AND user_id = $3`,
              [item.sortOrder, item.id, DEFAULT_USER_ID]
            );
          }
        }
      }
      await client.query('COMMIT');
      return reply.code(200).send({ success: true, message: 'Categories reordered successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      fastify.log.error(err, 'Failed to reorder categories');
      return reply.code(500).send({ error: 'Database error' });
    } finally {
      client.release();
    }
  });

  // PATCH /api/categories/:id - Update category
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params;
    const parseResult = updateCategorySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'Validation Error', details: parseResult.error.issues });
    }

    const { name, nameEn, type, color, icon, parentId, customSvg, sortOrder, isActive } = parseResult.data;
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
    if (isActive !== undefined) {
      values.push(isActive);
      setClauses.push(`is_active = $${values.length}`);
    }

    if (setClauses.length === 0) {
      return reply.code(400).send({ error: 'Nothing to update' });
    }

    values.push(id, DEFAULT_USER_ID);
    const query = `
      UPDATE categories
      SET ${setClauses.join(', ')}
      WHERE id = $${values.length - 1} AND user_id = $${values.length}
      RETURNING id, name, name_en AS "nameEn", type, color, icon, parent_id AS "parentId", custom_svg AS "customSvg", is_system AS "isSystem", is_active AS "isActive", sort_order AS "sortOrder"
    `;

    try {
      const result = await pool.query(query, values);
      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Category not found' });
      }

      // If color was changed, also cascade the color to all subcategories under this category
      if (color !== undefined) {
        await pool.query(
          'UPDATE categories SET color = $1 WHERE parent_id = $2 AND user_id = $3',
          [color, id, DEFAULT_USER_ID]
        );
      }

      return reply.code(200).send({ success: true, data: result.rows[0] });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error' });
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
      return reply.code(500).send({ error: 'Database error' });
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
      return reply.code(500).send({ error: 'Classifier error' });
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
      return reply.code(500).send({ error: 'Database error' });
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
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // POST /api/categories/reclassify-all - Re-run classification on all transactions
  fastify.post('/reclassify-all', async (request, reply) => {
    try {
      const result = await reclassifyAllTransactions(DEFAULT_USER_ID);
      return reply.code(200).send({ success: true, ...result });
    } catch (err) {
      fastify.log.error(err, 'Failed to reclassify transactions');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // POST /api/categories/ai-suggest - Complete English name, color & generate SVG icon with Gemini AI
  fastify.post('/ai-suggest', async (request, reply) => {
    const { nameHe, currentSvg, attemptIndex, parentColor } = request.body || {};
    if (!nameHe || typeof nameHe !== 'string' || !nameHe.trim()) {
      return reply.code(400).send({ error: 'שם קטגוריה בעברית נדרש' });
    }

    const cleanName = nameHe.trim();
    const { geminiApiKey, enableAiAnalysis } = await getAiSettings();

    if (!enableAiAnalysis || !geminiApiKey) {
      return reply.code(400).send({
        error: 'ניתוח AI אינו מוגדר או שחסר מפתח API של Gemini בהגדרות.',
      });
    }

    try {
      const isVariation = Boolean(currentSvg || (attemptIndex && attemptIndex > 0));
      const variationNote = isVariation
        ? `\nחשוב מאוד: המשתמש לוחץ "נסה עיצוב אחר"! עליך ליצור קונספט ויזואלי ומטפורה עיצובית שונים לחלוטין מהעיצוב הקודם!
העיצוב הקודם היה:
${currentSvg || 'עיצוב קודם'}
בחר אובייקט אחר לחלוטין המתאים לקטגוריה זו!`
        : '';

      const hasValidParentColor = parentColor && /^#[0-9a-fA-F]{6}$/i.test(parentColor);
      const colorRequirement = hasValidParentColor
        ? `2. "color": חובה להשתמש בדיוק בצבע של קטגוריית האב: "${parentColor}".`
        : `2. "color": קוד צבע HEX מודרני והרמוני המתאים לאופי הקטגוריה (למשל: ירוק #10b981 למזון/מכולת, כתום #f59e0b לאוכל/מסעדות, כחול #3b82f6 לדיור, סגול #8b5cf6 לרכב/תחבורה, אדום #ef4444 לבריאות, ורוד #ec4899 לקניות, ציאן #06b6d4 לחינוך, וכו').`;

      const prompt = `אתה מומחה UX/UI ומנהל קטלוג האייקונים עבור אפליקציית FinTrack.
המשתמש מגדיר קטגוריה פיננסית בעברית: "${cleanName}".${variationNote}

עליך לבחור אייקון מוכן, תקני ואיכותי מתוך ספריית Lucide Icons המוכרת (מעל 1,400 אייקונים).
חשוב מאוד: אל תמציא צורות לא קשורות (למשל: לתרומה, צדקה או מעשר אל תבחר מתנה, אלא HeartHandshake או HandHeart או Coins או Landmark; לכושר וספורט בחר Dumbbell או Activity או Footprints; ללימודים בחר GraduationCap או BookOpen; לדיור וחשבונות בחר Home או Zap או Droplet וכו').

עליך לספק:
1. "nameEn": שם קצר ונקי באנגלית (1-3 מילים, Capitalized).
${colorRequirement}
3. "iconName": שם האייקון המדויק מתוך ספריית Lucide ב-PascalCase (למשל: HeartHandshake, HandHeart, Heart, Dumbbell, Activity, Utensils, Coffee, ShoppingCart, ShoppingBag, Home, Building, Car, Fuel, Plane, GraduationCap, Briefcase, Laptop, CreditCard, Wallet, PiggyBank, Landmark, ShieldCheck, Wrench, Baby, Dog, Gift, Smile, Stethoscope, Pill, Sparkles, Tag).
4. "designConcept": תיאור קצר בעברית של מה האייקון שנבחר מייצג (למשל: "לחיצת יד עם לב לתרומות וחסד", "משקולת כושר", "כובע אקדמי ללימודים").

החזר אך ורק תשובת JSON תקנית במבנה:
{
  "nameEn": "...",
  "color": "#...",
  "iconName": "...",
  "designConcept": "..."
}`;

      const dynamicModels = await getAvailableGeminiModels(geminiApiKey);
      const modelsToTry = dynamicModels.length > 0
        ? dynamicModels
        : ['gemini-1.5-flash-002', 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];

      const genAI = new GoogleGenerativeAI(geminiApiKey);
      let lastError = null;

      for (const modelName of modelsToTry) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: isVariation ? 0.7 : 0.2,
            },
          });

          const result = await model.generateContent(prompt);
          const text = result.response.text();
          const parsed = JSON.parse(text);

          if (parsed && (parsed.iconName || parsed.customSvg || parsed.nameEn)) {
            const effectiveColor = hasValidParentColor
              ? parentColor
              : (parsed.color || '#6366f1');

            return reply.send({
              success: true,
              data: {
                nameEn: parsed.nameEn || '',
                color: effectiveColor,
                iconName: parsed.iconName || 'Tag',
                customSvg: parsed.customSvg || '',
                designConcept: parsed.designConcept || '',
                modelUsed: modelName,
              },
            });
          }
        } catch (genErr) {
          lastError = genErr;
        }
      }

      throw lastError || new Error('לא התקבלה תשובה תקינה מ-Gemini AI');
    } catch (err) {
      fastify.log.error(err, 'Failed to suggest category with AI');
      return reply.code(500).send({ error: err.message || 'שגיאה ביצירת נתוני קטגוריה באמצעות AI' });
    }
  });
}
