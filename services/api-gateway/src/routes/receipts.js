import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import { 
  analyzeReceiptFile, 
  analyzeReceiptUrl, 
  testGeminiApiKey 
} from '../services/ai-analyzer.js';

// Get uploads directory from env or default to ./uploads relative to current directory
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch (err) {
    console.error('[Receipts] Failed to create uploads directory:', err.message);
  }
}

const urlReceiptSchema = z.object({
  url: z.string().url('כתובת URL לא תקינה'),
});

const applySplitsSchema = z.object({
  splits: z.array(
    z.object({
      amount: z.number().positive('הסכום חייב להיות חיובי'),
      category: z.string().min(1, 'חובה לבחור קטגוריה'),
      description: z.string().optional().nullable(),
    })
  ).min(1, 'יש לבחור לפחות פריט אחד לפיצול'),
});

export default async function receiptsRoutes(fastify, options) {
  // GET /api/v2/transactions/:id/receipts - List all receipts for a transaction
  fastify.get('/:id/receipts', async (request, reply) => {
    const { id } = request.params;
    try {
      const res = await pool.query(
        `SELECT id, transaction_id, file_name, file_type, file_size, source_url, 
                ai_analyzed, ai_provider, extracted_data, created_at
         FROM transaction_receipts
         WHERE transaction_id = $1
         ORDER BY created_at DESC`,
        [id]
      );
      return reply.send({ success: true, data: res.rows });
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch receipts');
      return reply.code(500).send({ error: 'Failed to fetch receipts', message: err.message });
    }
  });

  // POST /api/v2/transactions/:id/receipts - Upload file and analyze with AI
  fastify.post('/:id/receipts', async (request, reply) => {
    const { id } = request.params;

    // Verify transaction exists
    const txCheck = await pool.query('SELECT id, amount, merchant_name, description FROM transactions WHERE id = $1', [id]);
    if (txCheck.rows.length === 0) {
      return reply.code(404).send({ error: 'Transaction not found' });
    }

    let data;
    try {
      data = await request.file();
    } catch (err) {
      return reply.code(400).send({ error: 'שגיאה בקריאת הקובץ', details: err.message });
    }

    if (!data) {
      return reply.code(400).send({ error: 'לא נבחר קובץ להעלאה' });
    }

    const fileBuffer = await data.toBuffer();
    const originalName = data.filename || 'receipt.jpg';
    const mimeType = data.mimetype || 'image/jpeg';
    const fileSize = fileBuffer.length;

    // Check size limit: 10MB max
    if (fileSize > 10 * 1024 * 1024) {
      return reply.code(400).send({ error: 'גודל הקובץ חורג מהמגבלה המותרת (עד 10MB)' });
    }

    // Generate unique storage filename
    const ext = path.extname(originalName) || (mimeType === 'application/pdf' ? '.pdf' : '.jpg');
    const storageFileName = `${id}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
    const storagePath = path.join(UPLOADS_DIR, storageFileName);

    try {
      fs.writeFileSync(storagePath, fileBuffer);
    } catch (err) {
      fastify.log.error(err, 'Failed to write file to disk');
      return reply.code(500).send({ error: 'Failed to save file', message: err.message });
    }

    // Run AI analysis
    let aiResult = { ai_analyzed: false, extracted_data: { vendor: null, total: null, items: [] } };
    try {
      aiResult = await analyzeReceiptFile(fileBuffer, mimeType, originalName);
    } catch (err) {
      fastify.log.warn(`AI Analysis error: ${err.message}`);
    }

    // Save record to DB
    try {
      const insertRes = await pool.query(
        `INSERT INTO transaction_receipts 
         (transaction_id, file_name, file_type, file_size, file_path, ai_analyzed, ai_provider, extracted_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, transaction_id, file_name, file_type, file_size, source_url, 
                   ai_analyzed, ai_provider, extracted_data, created_at`,
        [
          id,
          originalName,
          mimeType,
          fileSize,
          storageFileName, // store relative filename
          aiResult.ai_analyzed || false,
          aiResult.ai_provider || 'gemini',
          JSON.stringify(aiResult.extracted_data || {}),
        ]
      );

      return reply.code(201).send({
        success: true,
        data: insertRes.rows[0],
        aiMessage: aiResult.message || null,
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to insert receipt record in DB');
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });

  // POST /api/v2/transactions/:id/receipts/url - Analyze digital receipt by URL
  fastify.post('/:id/receipts/url', async (request, reply) => {
    const { id } = request.params;
    const parseResult = urlReceiptSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Validation Error',
        details: parseResult.error.issues,
      });
    }

    const { url } = parseResult.data;

    // Verify transaction exists
    const txCheck = await pool.query('SELECT id FROM transactions WHERE id = $1', [id]);
    if (txCheck.rows.length === 0) {
      return reply.code(404).send({ error: 'Transaction not found' });
    }

    // Run AI analysis on URL
    let aiResult;
    try {
      aiResult = await analyzeReceiptUrl(url);
    } catch (err) {
      return reply.code(400).send({
        error: 'נכשל בניתוח הקישור',
        message: err.message,
      });
    }

    // Save record to DB
    try {
      const parsedVendor = aiResult.extracted_data?.vendor || 'חשבונית דיגיטלית';
      const insertRes = await pool.query(
        `INSERT INTO transaction_receipts 
         (transaction_id, file_name, file_type, file_size, source_url, ai_analyzed, ai_provider, extracted_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, transaction_id, file_name, file_type, file_size, source_url, 
                   ai_analyzed, ai_provider, extracted_data, created_at`,
        [
          id,
          `${parsedVendor} (קישור דיגיטלי)`,
          'url',
          0,
          url,
          aiResult.ai_analyzed || false,
          aiResult.ai_provider || 'gemini',
          JSON.stringify(aiResult.extracted_data || {}),
        ]
      );

      return reply.code(201).send({
        success: true,
        data: insertRes.rows[0],
        aiMessage: aiResult.message || null,
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to save URL receipt in DB');
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });

  // GET /api/v2/transactions/receipts/file/:filename - View/download receipt file
  fastify.get('/receipts/file/:filename', async (request, reply) => {
    const { filename } = request.params;
    // Sanitize filename to prevent directory traversal
    const safeFilename = path.basename(filename);
    const filePath = path.join(UPLOADS_DIR, safeFilename);

    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({ error: 'הקובץ לא נמצא' });
    }

    const ext = path.extname(safeFilename).toLowerCase();
    let mime = 'application/octet-stream';
    if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
    else if (ext === '.png') mime = 'image/png';
    else if (ext === '.webp') mime = 'image/webp';
    else if (ext === '.pdf') mime = 'application/pdf';

    reply.header('Content-Type', mime);
    reply.header('Cache-Control', 'public, max-age=86400');
    const stream = fs.createReadStream(filePath);
    return reply.send(stream);
  });

  // DELETE /api/v2/transactions/receipts/:receiptId - Delete receipt
  fastify.delete('/receipts/:receiptId', async (request, reply) => {
    const { receiptId } = request.params;

    try {
      const res = await pool.query(
        `SELECT file_path FROM transaction_receipts WHERE id = $1`,
        [receiptId]
      );

      if (res.rows.length === 0) {
        return reply.code(404).send({ error: 'Receipt not found' });
      }

      const filePath = res.rows[0].file_path;
      if (filePath) {
        const fullPath = path.join(UPLOADS_DIR, path.basename(filePath));
        if (fs.existsSync(fullPath)) {
          try {
            fs.unlinkSync(fullPath);
          } catch (err) {
            fastify.log.warn(`Could not delete file ${fullPath}: ${err.message}`);
          }
        }
      }

      await pool.query(`DELETE FROM transaction_receipts WHERE id = $1`, [receiptId]);
      return reply.send({ success: true, message: 'Receipt deleted successfully' });
    } catch (err) {
      fastify.log.error(err, 'Failed to delete receipt');
      return reply.code(500).send({ error: 'Database error', message: err.message });
    }
  });

  // POST /api/v2/transactions/receipts/:receiptId/reanalyze - Re-analyze receipt
  fastify.post('/receipts/:receiptId/reanalyze', async (request, reply) => {
    const { receiptId } = request.params;

    try {
      const res = await pool.query(
        `SELECT id, transaction_id, file_name, file_type, file_path, source_url 
         FROM transaction_receipts WHERE id = $1`,
        [receiptId]
      );

      if (res.rows.length === 0) {
        return reply.code(404).send({ error: 'Receipt not found' });
      }

      const receipt = res.rows[0];
      let aiResult;

      if (receipt.file_type === 'url' && receipt.source_url) {
        aiResult = await analyzeReceiptUrl(receipt.source_url);
      } else if (receipt.file_path) {
        const fullPath = path.join(UPLOADS_DIR, path.basename(receipt.file_path));
        if (!fs.existsSync(fullPath)) {
          return reply.code(404).send({ error: 'קובץ המקור אינו קיים בדיסק' });
        }
        const buffer = fs.readFileSync(fullPath);
        aiResult = await analyzeReceiptFile(buffer, receipt.file_type, receipt.file_name);
      } else {
        return reply.code(400).send({ error: 'אין קובץ או קישור זמינים לניתוח' });
      }

      const updated = await pool.query(
        `UPDATE transaction_receipts
         SET ai_analyzed = $1, ai_provider = $2, extracted_data = $3
         WHERE id = $4
         RETURNING id, transaction_id, file_name, file_type, file_size, source_url, 
                   ai_analyzed, ai_provider, extracted_data, created_at`,
        [
          aiResult.ai_analyzed || false,
          aiResult.ai_provider || 'gemini',
          JSON.stringify(aiResult.extracted_data || {}),
          receiptId
        ]
      );

      return reply.send({ success: true, data: updated.rows[0] });
    } catch (err) {
      fastify.log.error(err, 'Failed to reanalyze receipt');
      return reply.code(500).send({ error: 'Reanalysis failed', message: err.message });
    }
  });

  // POST /api/v2/transactions/:id/receipts/apply-splits - Convert receipt items to transaction splits!
  fastify.post('/:id/receipts/apply-splits', async (request, reply) => {
    const { id } = request.params;
    const parseResult = applySplitsSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Validation Error',
        details: parseResult.error.issues,
      });
    }

    const { splits } = parseResult.data;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check transaction
      const txRes = await client.query('SELECT id, amount FROM transactions WHERE id = $1', [id]);
      if (txRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Transaction not found' });
      }

      // Delete existing splits for this transaction
      await client.query('DELETE FROM transaction_splits WHERE transaction_id = $1', [id]);

      // Insert new splits
      for (const split of splits) {
        await client.query(
          `INSERT INTO transaction_splits (transaction_id, amount, category, description)
           VALUES ($1, $2, $3, $4)`,
          [id, split.amount, split.category, split.description || null]
        );
      }

      // Mark transaction as split
      await client.query('UPDATE transactions SET is_split = true WHERE id = $1', [id]);

      await client.query('COMMIT');

      // Return refreshed splits
      const updatedSplits = await pool.query(
        'SELECT id, amount, category, description, created_at FROM transaction_splits WHERE transaction_id = $1',
        [id]
      );

      return reply.send({
        success: true,
        message: 'הפיצולים עודכנו בהצלחה מתכני החשבונית',
        data: updatedSplits.rows,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      fastify.log.error(err, 'Failed to apply splits from receipt');
      return reply.code(500).send({ error: 'Database error', message: err.message });
    } finally {
      client.release();
    }
  });

  // POST /api/v2/transactions/receipts/test-ai - Test Gemini API connection
  fastify.post('/receipts/test-ai', async (request, reply) => {
    const { apiKey } = request.body || {};
    try {
      const result = await testGeminiApiKey(apiKey);
      return reply.send(result);
    } catch (err) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });
}
