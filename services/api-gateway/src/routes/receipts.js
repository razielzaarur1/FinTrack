import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import { 
  analyzeReceiptFile, 
  analyzeReceiptUrl, 
  testGeminiApiKey 
} from '../services/ai-analyzer.js';

/**
 * Determine a writable directory for storing uploads with seamless fallbacks
 */
function getWritableUploadsDir() {
  const candidates = [
    process.env.UPLOADS_DIR,
    '/app/uploads',
    '/opt/finapp/uploads',
    path.join(process.cwd(), 'uploads'),
    path.join(os.tmpdir(), 'finapp_uploads')
  ].filter(Boolean);

  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // Test write and delete
      const testFile = path.join(dir, `.write_test_${Date.now()}`);
      fs.writeFileSync(testFile, 'ok');
      fs.unlinkSync(testFile);
      return dir;
    } catch (err) {
      console.warn(`[Receipts] Directory '${dir}' is not writable:`, err.message);
    }
  }

  const fallback = path.join(os.tmpdir(), 'finapp_uploads');
  try {
    fs.mkdirSync(fallback, { recursive: true });
  } catch (_) {}
  return fallback;
}

/**
 * Search for a saved receipt file across candidate directories
 */
function findReceiptFile(filename) {
  if (!filename) return null;
  const safeFilename = path.basename(filename);
  const candidates = [
    process.env.UPLOADS_DIR,
    '/app/uploads',
    '/opt/finapp/uploads',
    path.join(process.cwd(), 'uploads'),
    path.join(os.tmpdir(), 'finapp_uploads')
  ].filter(Boolean);

  for (const dir of candidates) {
    const filePath = path.join(dir, safeFilename);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

/**
 * Find candidate transactions that match the extracted receipt details (vendor, date, amount)
 */
async function findMatchingTransactions(currentTxId, extractedData, client = pool) {
  if (!extractedData) return [];
  const vendor = extractedData.vendor ? String(extractedData.vendor).trim() : '';
  const total = parseFloat(extractedData.total) || 0;
  const date = extractedData.date ? String(extractedData.date).trim() : null;

  if (!total && !vendor && !date) return [];

  const params = [currentTxId];
  const scoreExpressions = [];

  // 1. Amount match (highest priority)
  if (total > 0) {
    params.push(total);
    const pIdx = params.length;
    scoreExpressions.push(`CASE WHEN ABS(ABS(t.amount) - $${pIdx}) < 0.01 THEN 60 WHEN ABS(ABS(t.amount) - $${pIdx}) <= 2.00 THEN 35 ELSE 0 END`);
  }

  // 2. Date match
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    params.push(date);
    const pIdx = params.length;
    scoreExpressions.push(`CASE 
      WHEN t.date = $${pIdx}::date THEN 40 
      WHEN ABS(t.date - $${pIdx}::date) <= 3 THEN 25 
      WHEN ABS(t.date - $${pIdx}::date) <= 7 THEN 10 
      ELSE 0 
    END`);
  }

  // 3. Vendor match
  if (vendor && vendor.length >= 2) {
    params.push(`%${vendor}%`);
    const pIdx = params.length;
    scoreExpressions.push(`CASE WHEN t.merchant_name ILIKE $${pIdx} OR t.description ILIKE $${pIdx} THEN 35 ELSE 0 END`);
  }

  if (scoreExpressions.length === 0) return [];

  const scoreSql = scoreExpressions.join(' + ');

  const query = `
    SELECT 
      t.id, 
      t.date, 
      t.amount, 
      t.currency, 
      t.merchant_name AS "merchantName", 
      t.description,
      t.category,
      b.display_name AS "accountDisplayName",
      b.bank_company AS "bankCompany",
      (${scoreSql}) AS match_score
    FROM transactions t
    JOIN bank_accounts b ON t.account_id = b.id
    WHERE t.id != $1 AND (${scoreSql}) >= 30
    ORDER BY match_score DESC, t.date DESC
    LIMIT 3
  `;

  try {
    const res = await client.query(query, params);
    return res.rows;
  } catch (err) {
    console.warn('[Receipts] Error finding matching transactions:', err.message);
    return [];
  }
}

/**
 * Compute verification discrepancy details for a receipt against its parent transaction
 */
async function computeReceiptVerification(txData, receipt, client = pool) {
  const extracted = receipt.extracted_data || {};
  const receiptTotal = parseFloat(extracted.total);
  const receiptDate = extracted.date;

  let isAmountMismatch = false;
  let isDateMismatch = false;

  if (txData && !isNaN(receiptTotal) && receiptTotal > 0) {
    isAmountMismatch = Math.abs(receiptTotal - Math.abs(parseFloat(txData.amount))) > 0.05;
  }

  if (txData && receiptDate && txData.date) {
    const rDate = new Date(receiptDate);
    const tDate = new Date(txData.date);
    const diffDays = Math.abs((rDate - tDate) / (1000 * 60 * 60 * 24));
    isDateMismatch = diffDays > 3;
  }

  let suggestedMatches = [];
  if (isAmountMismatch || isDateMismatch) {
    suggestedMatches = await findMatchingTransactions(receipt.transaction_id, extracted, client);
  }

  return {
    verification: {
      isMismatch: isAmountMismatch || isDateMismatch,
      isAmountMismatch,
      isDateMismatch,
      txAmount: txData ? Math.abs(parseFloat(txData.amount)) : null,
      txDate: txData ? txData.date : null,
      txMerchant: txData ? txData.merchant_name : null,
      receiptTotal: !isNaN(receiptTotal) ? receiptTotal : null,
      receiptDate: receiptDate || null,
      receiptVendor: extracted.vendor || null,
    },
    suggestedMatches,
  };
}

/**
 * Validates that a URL is safe to fetch (SSRF protection).
 * Blocks: private IP ranges, loopback, link-local (AWS metadata), non-HTTPS.
 * @param {string} rawUrl
 * @returns {{ safe: boolean, reason?: string }}
 */
function validateReceiptUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_) {
    return { safe: false, reason: 'כתובת URL לא תקינה' };
  }

  // Only allow HTTPS (not http:// to internal services)
  if (parsed.protocol !== 'https:') {
    return { safe: false, reason: 'רק קישורי HTTPS מורשים לניתוח חשבוניות' };
  }

  const hostname = parsed.hostname;

  // Block IP-literal private/loopback addresses
  // Covers: loopback (127.x), RFC 1918 (10.x, 192.168.x, 172.16-31.x),
  //         link-local / AWS metadata (169.254.x), "this" network (0.x), IPv6 loopback (::1)
  const PRIVATE_RE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|::1$)/i;

  if (PRIVATE_RE.test(hostname)) {
    return { safe: false, reason: 'גישה לכתובות IP פנימיות אינה מורשית' };
  }

  // Block localhost variants
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return { safe: false, reason: 'גישה לשרתים פנימיים אינה מורשית' };
  }

  return { safe: true };
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
  // GET /api/v2/transactions/:id/receipts - List all receipts for a transaction with verification
  fastify.get('/:id/receipts', async (request, reply) => {
    const { id } = request.params;
    try {
      // Fetch transaction for verification comparison
      const txRes = await pool.query('SELECT id, date, amount, merchant_name FROM transactions WHERE id = $1', [id]);
      const txData = txRes.rows[0];

      const res = await pool.query(
        `SELECT id, transaction_id, file_name, file_type, file_size, file_path, source_url, 
                ai_analyzed, ai_provider, extracted_data, created_at
         FROM transaction_receipts
         WHERE transaction_id = $1
         ORDER BY created_at DESC`,
        [id]
      );

      const enrichedReceipts = await Promise.all(
        res.rows.map(async (receipt) => {
          const vData = await computeReceiptVerification(txData, receipt);
          return {
            ...receipt,
            ...vData,
          };
        })
      );

      return reply.send({ success: true, data: enrichedReceipts });
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch receipts');
      return reply.code(500).send({ error: 'Failed to fetch receipts' });
    }
  });

  // POST /api/v2/transactions/:id/receipts - Upload file and analyze with AI
  fastify.post('/:id/receipts', async (request, reply) => {
    const { id } = request.params;

    // Verify transaction exists
    const txCheck = await pool.query('SELECT id, amount, merchant_name, description, date FROM transactions WHERE id = $1', [id]);
    if (txCheck.rows.length === 0) {
      return reply.code(404).send({ error: 'Transaction not found' });
    }
    const txData = txCheck.rows[0];

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

    // Check size limit: 15MB max
    if (fileSize > 15 * 1024 * 1024) {
      return reply.code(400).send({ error: 'גודל הקובץ חורג מהמגבלה המותרת (עד 15MB)' });
    }

    // Get writable uploads directory
    const targetDir = getWritableUploadsDir();
    const ext = path.extname(originalName) || (mimeType === 'application/pdf' ? '.pdf' : '.jpg');
    const storageFileName = `${id}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
    const storagePath = path.join(targetDir, storageFileName);

    try {
      fs.writeFileSync(storagePath, fileBuffer);
    } catch (err) {
      fastify.log.error(err, `Failed to write file to disk at ${storagePath}`);
      return reply.code(500).send({ 
        error: 'נכשל בשמירת הקובץ בדיסק', 
        details: err.message,
        path: storagePath 
      });
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
         RETURNING id, transaction_id, file_name, file_type, file_size, file_path, source_url, 
                   ai_analyzed, ai_provider, extracted_data, created_at`,
        [
          id,
          originalName,
          mimeType,
          fileSize,
          storageFileName,
          aiResult.ai_analyzed || false,
          aiResult.ai_provider || 'gemini',
          JSON.stringify(aiResult.extracted_data || {}),
        ]
      );

      const savedReceipt = insertRes.rows[0];
      const vData = await computeReceiptVerification(txData, savedReceipt);

      return reply.code(201).send({
        success: true,
        data: {
          ...savedReceipt,
          ...vData,
        },
        aiMessage: aiResult.message || null,
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to insert receipt record in DB');
      return reply.code(500).send({ error: 'Database error' });
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

    // SSRF protection: reject private/internal URLs before fetching
    const urlCheck = validateReceiptUrl(url);
    if (!urlCheck.safe) {
      return reply.code(400).send({ error: 'כתובת URL אינה מורשית', reason: urlCheck.reason });
    }

    // Verify transaction exists
    const txCheck = await pool.query('SELECT id, date, amount, merchant_name FROM transactions WHERE id = $1', [id]);
    if (txCheck.rows.length === 0) {
      return reply.code(404).send({ error: 'Transaction not found' });
    }
    const txData = txCheck.rows[0];

    // Run AI analysis on URL
    let aiResult;
    try {
      aiResult = await analyzeReceiptUrl(url);
    } catch (err) {
      return reply.code(400).send({
        error: 'נכשל בניתוח הקישור',
        });
    }

    // Save record to DB
    try {
      const parsedVendor = aiResult.extracted_data?.vendor || 'חשבונית דיגיטלית';
      const insertRes = await pool.query(
        `INSERT INTO transaction_receipts 
         (transaction_id, file_name, file_type, file_size, source_url, ai_analyzed, ai_provider, extracted_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, transaction_id, file_name, file_type, file_size, file_path, source_url, 
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

      const savedReceipt = insertRes.rows[0];
      const vData = await computeReceiptVerification(txData, savedReceipt);

      return reply.code(201).send({
        success: true,
        data: {
          ...savedReceipt,
          ...vData,
        },
        aiMessage: aiResult.message || null,
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to save URL receipt in DB');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // POST /api/v2/transactions/receipts/:receiptId/move - Move receipt to a different transaction
  fastify.post('/receipts/:receiptId/move', async (request, reply) => {
    const { receiptId } = request.params;
    const { targetTransactionId } = request.body || {};

    if (!targetTransactionId) {
      return reply.code(400).send({ error: 'Target transaction ID is required' });
    }

    try {
      // Verify target transaction exists
      const txCheck = await pool.query('SELECT id, merchant_name, amount, date FROM transactions WHERE id = $1', [targetTransactionId]);
      if (txCheck.rows.length === 0) {
        return reply.code(404).send({ error: 'Target transaction not found' });
      }

      const res = await pool.query(
        `UPDATE transaction_receipts
         SET transaction_id = $1
         WHERE id = $2
         RETURNING id, transaction_id, file_name, file_type, file_size, file_path, source_url, 
                   ai_analyzed, ai_provider, extracted_data, created_at`,
        [targetTransactionId, receiptId]
      );

      if (res.rows.length === 0) {
        return reply.code(404).send({ error: 'Receipt not found' });
      }

      return reply.send({
        success: true,
        message: 'החשבונית הועברה בהצלחה לתנועה המתאימה',
        data: res.rows[0],
        targetTransaction: txCheck.rows[0]
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to move receipt');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // GET /api/v2/transactions/receipts/file/:filename - View/download receipt file
  fastify.get('/receipts/file/:filename', async (request, reply) => {
    const { filename } = request.params;
    const filePath = findReceiptFile(filename);

    if (!filePath || !fs.existsSync(filePath)) {
      return reply.code(404).send({ error: 'הקובץ לא נמצא' });
    }

    const ext = path.extname(filePath).toLowerCase();
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

      const filePathVal = res.rows[0].file_path;
      if (filePathVal) {
        const fullPath = findReceiptFile(filePathVal);
        if (fullPath && fs.existsSync(fullPath)) {
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
      return reply.code(500).send({ error: 'Database error' });
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
      const txRes = await pool.query('SELECT id, date, amount, merchant_name FROM transactions WHERE id = $1', [receipt.transaction_id]);
      const txData = txRes.rows[0];

      let aiResult;

      if (receipt.file_type === 'url' && receipt.source_url) {
        aiResult = await analyzeReceiptUrl(receipt.source_url);
      } else if (receipt.file_path) {
        const fullPath = findReceiptFile(receipt.file_path);
        if (!fullPath || !fs.existsSync(fullPath)) {
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
         RETURNING id, transaction_id, file_name, file_type, file_size, file_path, source_url, 
                   ai_analyzed, ai_provider, extracted_data, created_at`,
        [
          aiResult.ai_analyzed || false,
          aiResult.ai_provider || 'gemini',
          JSON.stringify(aiResult.extracted_data || {}),
          receiptId
        ]
      );

      const savedReceipt = updated.rows[0];
      const vData = await computeReceiptVerification(txData, savedReceipt);

      return reply.send({ 
        success: true, 
        data: {
          ...savedReceipt,
          ...vData,
        }
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to reanalyze receipt');
      return reply.code(500).send({ error: 'Reanalysis failed' });
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
      return reply.code(500).send({ error: 'Database error' });
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
