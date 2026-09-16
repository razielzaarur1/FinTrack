import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import { saveUserRule } from '../services/classifier.js';
import { verifyTmaToken, verifyTelegramWebAppData } from '../crypto.js';
import { analyzeReceiptFile, analyzeReceiptUrl } from '../services/ai-analyzer.js';
import { calculateFxDetails } from '../services/exchange-rates.js';
import {
  calculateReconciliationScore,
  findMatchesForTransaction,
  runAutoReconciliation,
  detectAndTagCcBillings,
  KNOWN_CC_PATTERNS,
  isCcBillingPattern,
} from '../services/cc-reconciliation.js';

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch (err) {
    console.error('[TMA Receipts] Failed to create uploads directory:', err.message);
  }
}

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
  targetTransactionId: z.string().uuid('Target transaction ID must be a valid UUID').optional(),
  linkedTxId: z.string().uuid('Linked transaction ID must be a valid UUID').optional(),
  linkType: z.enum(['refund', 'correction', 'related', 'installment', 'cc_billing_match']).default('related'),
  note: z.string().optional().nullable(),
  feeAmount: z.number().optional().nullable(),
  feeCategory: z.string().optional().nullable(),
  isFeeClassified: z.boolean().optional().default(false),
}).transform((data) => ({
  ...data,
  targetTransactionId: data.targetTransactionId || data.linkedTxId,
})).refine((data) => !!data.targetTransactionId, {
  message: 'Target transaction ID must be provided',
  path: ['targetTransactionId'],
});

const updateTransactionSchema = z.object({
  category: z.string().optional(),
  userDescription: z.string().optional().nullable(),
  merchantName: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  amount: z.coerce.number().optional(),
  date: z.string().optional(),
  isIgnored: z.boolean().optional(),
  isCcBilling: z.boolean().optional(),
  applyToSimilar: z.boolean().optional(),
});

export function cleanSpacedHebrew(str) {
  if (!str || typeof str !== 'string') return str || '';
  const hebrewLetterRegex = /^[\u0590-\u05FF]$/;
  const parts = str.split(/\s{2,}/);
  const cleaned = parts.map((part) => {
    const tokens = part.trim().split(/\s+/);
    if (tokens.length >= 2 && tokens.every((t) => hebrewLetterRegex.test(t) || /^[0-9]$/.test(t))) {
      return tokens.join('');
    }
    let res = part;
    let prev;
    do {
      prev = res;
      res = res.replace(/(^|[\s])([\u0590-\u05FF])\s([\u0590-\u05FF])(?=[\s]|$)/g, '$1$2$3');
    } while (res !== prev);
    return res;
  });
  return cleaned.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Checks whether a transaction originates from the BIT payment service.
 * Handles Hebrew prepositions (בביט, לביט, מביט, ב-bit), spaced characters (ב י ט, b i t),
 * card descriptors (BIT*1234, BIT-PURCHASE), and excludes insurance/cancellation words (ביטוח, ביטול).
 */
export function isBitTransaction(merchantName, description, memo) {
  const m = cleanSpacedHebrew(merchantName || '').trim();
  const d = cleanSpacedHebrew(description || '').trim();
  const mem = cleanSpacedHebrew(memo || '').trim();
  const allText = [m, d, mem].filter(Boolean).join(' ');

  return /(?:^|[^\w\u0590-\u05FF]|\s)(?:[בלמהכ]?-?bit|[בלמהכ]?-?ביט|b\s*i\s*t|ב\s*י\s*ט)(?:$|[^\w\u0590-\u05FF]|\s)/i.test(allText);
}

export function formatBitTransactionName(merchantName, description, memo) {
  const m = cleanSpacedHebrew(merchantName || '').trim();
  const d = cleanSpacedHebrew(description || '').trim();
  const mem = cleanSpacedHebrew(memo || '').trim();

  if (!isBitTransaction(m, d, mem)) return null;

  const candidates = [d, mem, m];
  let detail = '';

  for (const str of candidates) {
    if (!str) continue;
    let cleaned = str
      .replace(/(?:העברה|העברת|חיוב|תשלום|זיכוי|משיכה|הוראת קבע)\s+(?:ב-?|ל-?|מ-?)?(?:bit|ביט)/gi, ' ')
      .replace(/(?:^|[^\w\u0590-\u05FF]|\s)(?:[בלמהכ]?-?bit|[בלמהכ]?-?ביט|b\s*i\s*t|ב\s*י\s*ט)(?:$|[^\w\u0590-\u05FF]|\s)/gi, ' ')
      .replace(/(?:^|[\s\-_/])(?:אל|לכבוד|עבור|מאת|מ-|ל-)\s*/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    cleaned = cleaned.replace(/^[\s\-_:.*#/]+|[\s\-_:.*#/]+$/g, '').trim();

    if (cleaned && !/^(בית עסק|עסקאות באינטרנט|קניות באינטרנט|תשלום בנייד|העברה|חיוב|תשלום|זיכוי|משיכה)$/.test(cleaned) && cleaned.length >= 2) {
      detail = cleaned;
      break;
    }
  }

  if (detail) {
    return `bit ${cleanSpacedHebrew(detail)}`;
  }
  return 'bit';
}

let hasRepaired0Amount = false;
async function repair0AmountTransactions() {
  if (hasRepaired0Amount) return;
  try {
    await pool.query(`
      UPDATE transactions
      SET amount = CASE 
        WHEN (raw_data->>'originalAmount') IS NOT NULL AND (raw_data->>'originalAmount')::numeric != 0 
        THEN (raw_data->>'originalAmount')::numeric
        WHEN (raw_data->>'chargedAmount') IS NOT NULL AND (raw_data->>'chargedAmount')::numeric != 0
        THEN (raw_data->>'chargedAmount')::numeric
        ELSE amount
      END
      WHERE (amount = 0 OR amount IS NULL) AND raw_data IS NOT NULL
    `);
    hasRepaired0Amount = true;
  } catch (err) {
    // Non-critical background task
  }
}

let hasRepairedBit = false;
export async function repairBitTransactions() {
  if (hasRepairedBit) return;
  try {
    const res = await pool.query(`
      SELECT id, merchant_name, description, raw_data
      FROM transactions
      WHERE (
        merchant_name ILIKE '%bit%'
        OR merchant_name ILIKE '%ביט%'
        OR merchant_name ILIKE '%בביט%'
        OR description ILIKE '%bit%'
        OR description ILIKE '%ביט%'
        OR description ILIKE '%בביט%'
        OR (raw_data->>'memo') ILIKE '%bit%'
        OR (raw_data->>'memo') ILIKE '%ביט%'
        OR (raw_data->>'description') ILIKE '%bit%'
        OR (raw_data->>'description') ILIKE '%ביט%'
      )
    `);
    for (const row of res.rows) {
      const rawMemo = row.raw_data?.memo;
      const rawDesc = row.raw_data?.description;
      const d = row.description || rawDesc || '';
      if (isBitTransaction(row.merchant_name, d, rawMemo)) {
        const bitTitle = formatBitTransactionName(row.merchant_name, d, rawMemo);
        if (bitTitle && bitTitle !== row.merchant_name) {
          await pool.query('UPDATE transactions SET merchant_name = $1 WHERE id = $2', [bitTitle, row.id]);
        }
      }
    }
    hasRepairedBit = true;
  } catch (err) {
    // Non-critical background task
  }
}

/**
 * Automatically discovers and links transactions belonging to the same installment deal
 */
export async function autoLinkInstallmentTransactions(dbPool, specificTxId = null) {
  try {
    let txFilter = '';
    const params = [];
    if (specificTxId) {
      params.push(specificTxId);
      txFilter = 'AND (t.account_id = (SELECT account_id FROM transactions WHERE id = $1))';
    }

    const res = await dbPool.query(`
      SELECT 
        t.id, t.account_id, t.date, t.amount, t.merchant_name, t.description, t.raw_data
      FROM transactions t
      WHERE (
        (t.raw_data->'installments'->>'total' ~ '^[0-9]+$' AND (t.raw_data->'installments'->>'total')::int > 1)
        OR (t.raw_data->'installments'->>'count' ~ '^[0-9]+$' AND (t.raw_data->'installments'->>'count')::int > 1)
        OR (t.raw_data->>'installments') ILIKE '%מתוך%'
        OR (t.raw_data->>'installments') ILIKE '%/%'
        OR t.description ~* '(תשלום|תשלומים|עסקה)?\\s*\\(?[0-9]{1,2}\\s*(מתוך|/)\\s*[0-9]{1,2}\\)?'
        OR t.merchant_name ~* '(תשלום|תשלומים|עסקה)?\\s*\\(?[0-9]{1,2}\\s*(מתוך|/)\\s*[0-9]{1,2}\\)?'
        OR (t.raw_data->>'memo') ~* '(תשלום|תשלומים|עסקה)?\\s*\\(?[0-9]{1,2}\\s*(מתוך|/)\\s*[0-9]{1,2}\\)?'
        OR (t.raw_data->>'description') ~* '(תשלום|תשלומים|עסקה)?\\s*\\(?[0-9]{1,2}\\s*(מתוך|/)\\s*[0-9]{1,2}\\)?'
        OR ((t.raw_data->>'originalAmount')::numeric > ABS(t.amount) * 1.5 AND t.amount < 0)
      )
      ${txFilter}
      ORDER BY t.date ASC
    `, params);

    if (res.rows.length < 2) return;

    const parseTx = (row) => {
      let raw = row.raw_data;
      if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch (e) { raw = {}; }
      }
      if (!raw || typeof raw !== 'object') raw = {};

      let total = 1;
      let number = 1;

      // 1. structured
      const inst = raw.installments;
      if (inst && typeof inst === 'object') {
        total = parseInt(inst.total ?? inst.count ?? 1, 10);
        number = parseInt(inst.number ?? inst.current ?? 1, 10);
      }

      // 2. regex
      if (total <= 1) {
        const candidates = [row.description, row.merchant_name, raw.description, raw.memo, raw.originalDescription].filter(Boolean);
        for (const str of candidates) {
          const match = String(str).match(/(?:תשלום|תשלומים|עסקה)?\s*\(?(\d{1,2})\s*(?:מתוך|\/)\s*(\d{1,2})\)?/);
          if (match) {
            number = parseInt(match[1], 10);
            total = parseInt(match[2], 10);
            break;
          }
        }
      }

      // 3. ratio
      const origAmt = Math.abs(parseFloat(raw.originalAmount || 0));
      const chargedAmt = Math.abs(parseFloat(raw.chargedAmount || row.amount || 0));
      if (total <= 1 && origAmt > 0 && chargedAmt > 0 && origAmt > chargedAmt * 1.5) {
        const ratio = Math.round(origAmt / chargedAmt);
        if (ratio >= 2 && ratio <= 60) {
          total = ratio;
        }
      }

      let baseMerchant = cleanSpacedHebrew(row.merchant_name || row.description || '')
        .replace(/(?:תשלום|תשלומים|עסקה)?\s*\(?\d{1,2}\s*(?:מתוך|\/)\s*\d{1,2}\)?/gi, '')
        .replace(/[0-9]+/g, '')
        .trim()
        .toLowerCase();

      const normalizedDealAmount = origAmt > 0 ? Math.round(origAmt) : Math.round(chargedAmt * (total > 1 ? total : 1));

      return {
        id: row.id,
        accountId: row.account_id,
        number,
        total,
        baseMerchant,
        dealAmount: normalizedDealAmount,
        monthlyAmount: Math.round(chargedAmt),
      };
    };

    const groups = new Map();
    for (const row of res.rows) {
      const parsed = parseTx(row);
      if (parsed.total <= 1 && parsed.dealAmount === 0) continue;

      const groupKey = `${parsed.accountId}_${parsed.baseMerchant}_${parsed.total}_${parsed.dealAmount || parsed.monthlyAmount}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey).push(parsed);
    }

    for (const [key, txList] of groups.entries()) {
      if (txList.length < 2) continue;
      for (let i = 0; i < txList.length; i++) {
        for (let j = i + 1; j < txList.length; j++) {
          const a = txList[i];
          const b = txList[j];
          if (a.id === b.id) continue;

          const [idA, idB] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];

          await dbPool.query(`
            INSERT INTO transaction_links (transaction_id_a, transaction_id_b, link_type, note)
            VALUES ($1, $2, 'installment', 'קישור אוטומטי של עסקת תשלומים')
            ON CONFLICT (transaction_id_a, transaction_id_b) 
            DO UPDATE SET link_type = 'installment'
            WHERE transaction_links.link_type = 'related'
          `, [idA, idB]);
        }
      }
    }
  } catch (err) {
    console.warn('[AutoLinkInstallments] Warning:', err.message);
  }
}

const cursorPaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().optional(), // ISO date or compound cursor
  cursorId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  accountIds: z.string().optional(),
  category: z.string().optional(),
  categories: z.string().optional(),
  currency: z.string().optional(),
  currencies: z.string().optional(),
  type: z.enum(['income', 'expense', 'installments', 'all']).optional(),
  isInstallment: z.coerce.boolean().optional(),
  specialFilters: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().optional(),
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().optional(),
  hasNotes: z.coerce.boolean().optional(),
  hasSplits: z.coerce.boolean().optional(),
  isIgnored: z.coerce.boolean().optional(),
  isReviewed: z.coerce.boolean().optional(),
  isFlagged: z.coerce.boolean().optional(),
});

let isTxV2Initialized = false;
async function preflightTxV2Check() {
  if (isTxV2Initialized) return;
  try {
    await pool.query(`
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_cc_billing BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS original_currency VARCHAR(10);
      ALTER TABLE transaction_links ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE transaction_links ADD COLUMN IF NOT EXISTS fee_category VARCHAR(100) DEFAULT 'עמלות';
      ALTER TABLE transaction_links ADD COLUMN IF NOT EXISTS is_fee_classified BOOLEAN DEFAULT false;
      CREATE INDEX IF NOT EXISTS idx_transactions_cc_billing ON transactions(is_cc_billing);
    `);
    isTxV2Initialized = true;
  } catch (err) {
    console.warn('[TransactionsV2 Preflight] Non-critical warning:', err.message);
  }
}

export default async function transactionsV2Routes(fastify, options) {
  preflightTxV2Check().catch(() => {});
  repair0AmountTransactions().catch(() => {});
  repairBitTransactions().catch(() => {});
  autoLinkInstallmentTransactions(pool).catch(() => {});

  // GET /api/v2/transactions - Cursor-based Infinite Scroll Transactions with rich multi-filters
  fastify.get('/', async (request, reply) => {
    await preflightTxV2Check().catch(() => {});
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
      accountIds,
      category,
      categories,
      currency,
      currencies,
      type,
      isInstallment,
      specialFilters,
      startDate,
      endDate,
      search,
      minAmount,
      maxAmount,
      hasNotes,
      hasSplits,
      isIgnored,
      isReviewed,
      isFlagged,
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

    // Account / Accounts (multi-select support)
    if (accountIds) {
      const ids = String(accountIds).split(',').map(s => s.trim()).filter(Boolean);
      if (ids.length > 0) {
        values.push(ids);
        conditions.push(`t.account_id = ANY($${values.length}::uuid[])`);
      }
    } else if (accountId) {
      values.push(accountId);
      conditions.push(`t.account_id = $${values.length}`);
    }

    // Category / Categories (multi-select + checks splits)
    if (categories) {
      const cats = String(categories).split(',').map(s => s.trim()).filter(Boolean);
      if (cats.length > 0) {
        values.push(cats);
        conditions.push(`(t.category = ANY($${values.length}) OR EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = t.id AND ts.category = ANY($${values.length})))`);
      }
    } else if (category) {
      values.push(category);
      conditions.push(`(t.category = $${values.length} OR EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = t.id AND ts.category = $${values.length}))`);
    }

    // Currency / Currencies (multi-select support)
    if (currencies) {
      const currs = String(currencies).split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      if (currs.length > 0) {
        values.push(currs);
        conditions.push(`UPPER(TRIM(t.currency)) = ANY($${values.length})`);
      }
    } else if (currency) {
      values.push(currency.trim().toUpperCase());
      conditions.push(`UPPER(TRIM(t.currency)) = $${values.length}`);
    }

    // Reviewed / Flagged filter
    if (isReviewed !== undefined) {
      values.push(isReviewed);
      conditions.push(`t.is_reviewed = $${values.length}`);
    }
    if (isFlagged !== undefined) {
      values.push(isFlagged);
      conditions.push(`t.is_flagged = $${values.length}`);
    }

    // Transaction Type: income (positive amount) vs expense (negative amount) vs installments
    if (type === 'income') {
      conditions.push(`t.amount > 0`);
    } else if (type === 'expense') {
      conditions.push(`t.amount < 0`);
    } else if (type === 'installments' || isInstallment === true) {
      conditions.push(`(
        (t.raw_data->'installments'->>'total' ~ '^[0-9]+$' AND (t.raw_data->'installments'->>'total')::int > 1)
        OR (t.raw_data->'installments'->>'count' ~ '^[0-9]+$' AND (t.raw_data->'installments'->>'count')::int > 1)
        OR (t.raw_data->>'installments') ILIKE '%מתוך%'
        OR (t.raw_data->>'installments') ILIKE '%/%'
        OR t.description ~* '(תשלום|תשלומים|עסקה)?\\s*\\(?[0-9]{1,2}\\s*(מתוך|/)\\s*[0-9]{1,2}\\)?'
        OR t.merchant_name ~* '(תשלום|תשלומים|עסקה)?\\s*\\(?[0-9]{1,2}\\s*(מתוך|/)\\s*[0-9]{1,2}\\)?'
        OR (t.raw_data->>'memo') ~* '(תשלום|תשלומים|עסקה)?\\s*\\(?[0-9]{1,2}\\s*(מתוך|/)\\s*[0-9]{1,2}\\)?'
        OR (t.raw_data->>'description') ~* '(תשלום|תשלומים|עסקה)?\\s*\\(?[0-9]{1,2}\\s*(מתוך|/)\\s*[0-9]{1,2}\\)?'
        OR (t.raw_data->>'originalAmount' ~ '^-?[0-9]+(\\.[0-9]+)?$' AND (t.raw_data->>'originalAmount')::numeric > ABS(t.amount) * 1.5 AND t.amount < 0)
      )`);
    }

    // Special Attributes Multi-Filter (installments, foreign, cash, splits, receipts, notes, links, ignored, bit, cc_billing, cc_linked, cc_unlinked, specific currency)
    if (specialFilters) {
      const specials = String(specialFilters).split(',').map((s) => s.trim()).filter(Boolean);
      for (const sp of specials) {
        if (sp === 'installments') {
          conditions.push(`(
            (t.raw_data->'installments'->>'total' ~ '^[0-9]+$' AND (t.raw_data->'installments'->>'total')::int > 1)
            OR (t.raw_data->'installments'->>'count' ~ '^[0-9]+$' AND (t.raw_data->'installments'->>'count')::int > 1)
            OR (t.raw_data->>'installments') ILIKE '%מתוך%'
            OR (t.raw_data->>'installments') ILIKE '%/%'
            OR t.description ~* '(תשלום|תשלומים|עסקה)?\\s*\\(?[0-9]{1,2}\\s*(מתוך|/)\\s*[0-9]{1,2}\\)?'
            OR t.merchant_name ~* '(תשלום|תשלומים|עסקה)?\\s*\\(?[0-9]{1,2}\\s*(מתוך|/)\\s*[0-9]{1,2}\\)?'
            OR (t.raw_data->>'memo') ~* '(תשלום|תשלומים|עסקה)?\\s*\\(?[0-9]{1,2}\\s*(מתוך|/)\\s*[0-9]{1,2}\\)?'
            OR (t.raw_data->>'description') ~* '(תשלום|תשלומים|עסקה)?\\s*\\(?[0-9]{1,2}\\s*(מתוך|/)\\s*[0-9]{1,2}\\)?'
            OR (t.raw_data->>'originalAmount' ~ '^-?[0-9]+(\\.[0-9]+)?$' AND (t.raw_data->>'originalAmount')::numeric > ABS(t.amount) * 1.5 AND t.amount < 0)
          )`);
        } else if (sp === 'foreign') {
          conditions.push(`(
            (t.currency IS NOT NULL AND UPPER(TRIM(t.currency)) NOT IN ('ILS', 'NIS', 'ש"ח', 'שח', '₪'))
            OR (t.raw_data->>'originalCurrency' IS NOT NULL AND UPPER(TRIM(t.raw_data->>'originalCurrency')) NOT IN ('ILS', 'NIS', 'ש"ח', 'שח', '₪'))
            OR (t.raw_data->>'original_currency' IS NOT NULL AND UPPER(TRIM(t.raw_data->>'original_currency')) NOT IN ('ILS', 'NIS', 'ש"ח', 'שח', '₪'))
            OR (t.raw_data->>'chargedCurrency' IS NOT NULL AND UPPER(TRIM(t.raw_data->>'chargedCurrency')) NOT IN ('ILS', 'NIS', 'ש"ח', 'שח', '₪'))
          )`);
        } else if (sp === 'cash') {
          conditions.push(`(
            t.category = 'משיכת מזומן' 
            OR LOWER(t.merchant_name) LIKE '%משיכת מזומן%' 
            OR LOWER(t.description) LIKE '%משיכת מזומן%'
            OR LOWER(t.merchant_name) LIKE '%כספומט%'
            OR LOWER(t.description) LIKE '%כספומט%' 
            OR LOWER(t.merchant_name) LIKE '%atm%'
          )`);
        } else if (sp === 'splits') {
          conditions.push(`t.is_split = true`);
        } else if (sp === 'receipts') {
          conditions.push(`EXISTS (SELECT 1 FROM transaction_receipts tr WHERE tr.transaction_id = t.id)`);
        } else if (sp === 'notes') {
          conditions.push(`EXISTS (SELECT 1 FROM transaction_notes tn WHERE tn.transaction_id = t.id)`);
        } else if (sp === 'links') {
          conditions.push(`EXISTS (SELECT 1 FROM transaction_links tl WHERE tl.transaction_id_a = t.id OR tl.transaction_id_b = t.id)`);
        } else if (sp === 'ignored') {
          conditions.push(`t.is_ignored = true`);
        } else if (sp === 'bit') {
          conditions.push(`(
            (
              t.merchant_name ~* '(^|[^a-zA-Z0-9א-ת])([בלמהכ]?-?bit|[בלמהכ]?-?ביט)([^a-zA-Z0-9א-ת]|$)'
              OR t.description ~* '(^|[^a-zA-Z0-9א-ת])([בלמהכ]?-?bit|[בלמהכ]?-?ביט)([^a-zA-Z0-9א-ת]|$)'
              OR (t.raw_data->>'memo') ~* '(^|[^a-zA-Z0-9א-ת])([בלמהכ]?-?bit|[בלמהכ]?-?ביט)([^a-zA-Z0-9א-ת]|$)'
            )
            AND NOT (
              t.merchant_name ~* '(ביטוח|ביטול|ביטחון|debit)'
              OR t.description ~* '(ביטוח|ביטול|ביטחון|debit)'
              OR (t.raw_data->>'memo') ~* '(ביטוח|ביטול|ביטחון|debit)'
            )
          )`);
        } else if (sp === 'cc_billing') {
          conditions.push(`(t.is_cc_billing = true OR t.category = 'חיוב אשראי')`);
        } else if (sp === 'cc_linked') {
          conditions.push(`((t.is_cc_billing = true OR t.category = 'חיוב אשראי') AND EXISTS (SELECT 1 FROM transaction_links tl WHERE tl.transaction_id_a = t.id OR tl.transaction_id_b = t.id))`);
        } else if (sp === 'cc_unlinked') {
          conditions.push(`((t.is_cc_billing = true OR t.category = 'חיוב אשראי') AND NOT EXISTS (SELECT 1 FROM transaction_links tl WHERE tl.transaction_id_a = t.id OR tl.transaction_id_b = t.id))`);
        } else if (sp.startsWith('curr_') || /^[A-Z]{3}$/.test(sp)) {
          const currCode = sp.replace(/^curr_/, '').toUpperCase();
          values.push(currCode);
          conditions.push(`(
            UPPER(TRIM(t.currency)) = $${values.length}
            OR UPPER(TRIM(COALESCE(t.raw_data->>'originalCurrency', ''))) = $${values.length}
            OR UPPER(TRIM(COALESCE(t.raw_data->>'original_currency', ''))) = $${values.length}
            OR UPPER(TRIM(COALESCE(t.raw_data->>'chargedCurrency', ''))) = $${values.length}
          )`);
        }
      }
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
        COALESCE(
          NULLIF(t.amount, 0),
          NULLIF(CASE WHEN t.raw_data->>'originalAmount' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (t.raw_data->>'originalAmount')::numeric ELSE NULL END, 0),
          NULLIF(CASE WHEN t.raw_data->>'chargedAmount' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (t.raw_data->>'chargedAmount')::numeric ELSE NULL END, 0),
          0
        ) AS "amount",
        COALESCE(
          CASE WHEN t.raw_data->>'originalAmount' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (t.raw_data->>'originalAmount')::numeric ELSE NULL END,
          t.amount
        ) AS "originalAmount",
        COALESCE(
          CASE WHEN t.raw_data->>'chargedAmount' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (t.raw_data->>'chargedAmount')::numeric ELSE NULL END,
          t.amount
        ) AS "chargedAmount",
        COALESCE(t.raw_data->>'originalCurrency', t.raw_data->>'original_currency', t.raw_data->>'chargedCurrency') AS "originalCurrency",
        t.currency,
        t.description,
        t.merchant_name AS "merchantName",
        t.category,
        t.user_description AS "userDescription",
        t.is_ignored AS "isIgnored",
        t.is_split AS "isSplit",
        t.is_cc_billing AS "isCcBilling",
        t.is_manual_category AS "isManualCategory",
        t.is_reviewed AS "isReviewed",
        t.is_flagged AS "isFlagged",
        t.raw_data AS "rawData",
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
        (SELECT COUNT(*) FROM transaction_links tl WHERE tl.transaction_id_a = t.id OR tl.transaction_id_b = t.id) > 0 AS "hasLinks",
        (SELECT COUNT(*) FROM transaction_receipts tr WHERE tr.transaction_id = t.id) > 0 AS "hasReceipts",
        (SELECT COUNT(*) FROM transaction_receipts tr WHERE tr.transaction_id = t.id)::int AS "receiptsCount",
        (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'id', ts.id,
                'category', ts.category,
                'amount', ts.amount,
                'description', ts.description
              )
            ),
            '[]'::json
          )
          FROM transaction_splits ts
          WHERE ts.transaction_id = t.id
        ) AS "splits"
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
      const rawData = hasNextPage ? rows.slice(0, limit) : rows;

      const data = rawData.map((tx) => {
        let mName = cleanSpacedHebrew(tx.merchantName);
        const desc = cleanSpacedHebrew(tx.description);
        const rawMemo = tx.rawData?.memo;
        const bitTitle = formatBitTransactionName(mName, desc, rawMemo);
        if (bitTitle && (!tx.userDescription || !tx.userDescription.trim())) {
          mName = bitTitle;
        }

        const rawOrigCur = tx.originalCurrency || tx.rawData?.originalCurrency || tx.rawData?.original_currency || tx.rawData?.chargedCurrency;
        const rawOrigAmt = tx.rawData?.originalAmount || tx.rawData?.original_amount;
        const nonIlsCurrencies = ['ILS', 'NIS', 'ש"ח', 'שח', '₪'];
        const isForeign = Boolean(
          (rawOrigCur && !nonIlsCurrencies.includes(String(rawOrigCur).toUpperCase().trim())) || 
          (tx.currency && !nonIlsCurrencies.includes(String(tx.currency).toUpperCase().trim()))
        );

        return {
          ...tx,
          merchantName: mName,
          description: desc,
          userDescription: cleanSpacedHebrew(tx.userDescription),
          isForeign,
          isCcBilling: Boolean(tx.isCcBilling || tx.category === 'חיוב אשראי'),
          originalAmount: rawOrigAmt != null && !isNaN(parseFloat(rawOrigAmt)) ? parseFloat(rawOrigAmt) : null,
          originalCurrency: rawOrigCur || (tx.currency && !nonIlsCurrencies.includes(tx.currency) ? tx.currency : null),
        };
      });

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
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // In-memory cache for available currencies (TTL 5 minutes)
  let cachedCurrencies = null;
  let cachedCurrenciesExpiry = 0;
  const CURRENCIES_CACHE_TTL_MS = 5 * 60 * 1000;

  const CURRENCY_METADATA = {
    ILS: { symbol: '₪', name: 'שקל ישראלי (ILS)' },
    NIS: { symbol: '₪', name: 'שקל ישראלי (ILS)' },
    USD: { symbol: '$', name: 'דולר אמריקאי (USD)' },
    EUR: { symbol: '€', name: 'אירו (EUR)' },
    GBP: { symbol: '£', name: 'לירה שטרלינג (GBP)' },
    JPY: { symbol: '¥', name: 'ין יפני (JPY)' },
    CAD: { symbol: 'C$', name: 'דולר קנדי (CAD)' },
    AUD: { symbol: 'A$', name: 'דולר אוסטרלי (AUD)' },
    CHF: { symbol: 'CHF', name: 'פרנק שוויצרי (CHF)' },
    CNY: { symbol: '¥', name: 'יואן סיני (CNY)' },
    INR: { symbol: '₹', name: 'רופי הודי (INR)' },
    THB: { symbol: '฿', name: 'באט תאילנדי (THB)' },
    TRY: { symbol: '₺', name: 'לירה טורקית (TRY)' },
    AED: { symbol: 'د.إ', name: 'דירהם אמירתי (AED)' },
    BRL: { symbol: 'R$', name: 'ריאל ברזילאי (BRL)' },
    MXN: { symbol: 'Mex$', name: 'פזו מקסיקני (MXN)' },
    SGD: { symbol: 'S$', name: 'דולר סינגפורי (SGD)' },
    HKD: { symbol: 'HK$', name: 'דולר הונג קונגי (HKD)' },
  };

  // GET /api/v2/transactions/currencies - Fast, smart cached list of existing currencies in DB
  fastify.get('/currencies', async (request, reply) => {
    const forceRefresh = request.query?.refresh === 'true' || request.query?.refresh === '1';
    const now = Date.now();

    if (!forceRefresh && cachedCurrencies && now < cachedCurrenciesExpiry) {
      return reply.code(200).send({
        data: cachedCurrencies,
        cached: true,
      });
    }

    try {
      const result = await pool.query(`
        SELECT 
          UPPER(TRIM(currency)) AS currency,
          COUNT(*)::int AS count
        FROM transactions
        WHERE currency IS NOT NULL AND TRIM(currency) != ''
        GROUP BY UPPER(TRIM(currency))
        ORDER BY count DESC
      `);

      const list = result.rows.map((row) => {
        const code = row.currency;
        const meta = CURRENCY_METADATA[code] || {
          symbol: code,
          name: code,
        };
        return {
          currency: code,
          symbol: meta.symbol,
          name: meta.name,
          count: row.count,
        };
      });

      cachedCurrencies = list;
      cachedCurrenciesExpiry = now + CURRENCIES_CACHE_TTL_MS;

      return reply.code(200).send({
        data: list,
        cached: false,
      });
    } catch (err) {
      fastify.log.error(err, 'Error querying transaction currencies');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // GET /api/v2/transactions/filter-counts - Aggregated transaction counts for filter options
  fastify.get('/filter-counts', async (request, reply) => {
    try {
      await preflightTxV2Check().catch(() => {});
      // 1. Counts by account
      const accountCountsRes = await pool.query(`
        SELECT account_id, COUNT(*)::int AS count 
        FROM transactions 
        GROUP BY account_id
      `);
      const accounts = {};
      accountCountsRes.rows.forEach((r) => { accounts[r.account_id] = r.count; });

      // 2. Counts by category (both regular transactions and split items)
      const categoryCountsRes = await pool.query(`
        SELECT category, COUNT(*)::int AS count 
        FROM (
          SELECT category FROM transactions WHERE (is_split = false OR is_split IS NULL) AND category IS NOT NULL
          UNION ALL
          SELECT category FROM transaction_splits WHERE category IS NOT NULL
        ) sub
        GROUP BY category
      `);
      const categories = {};
      categoryCountsRes.rows.forEach((r) => { categories[r.category] = r.count; });

      // 3. Special filters counts
      const specialsRes = await pool.query(`
        SELECT
          COUNT(*) FILTER (
            WHERE (raw_data->'installments'->>'total' ~ '^[0-9]+$' AND (raw_data->'installments'->>'total')::int > 1)
               OR (raw_data->'installments'->>'count' ~ '^[0-9]+$' AND (raw_data->'installments'->>'count')::int > 1)
               OR (raw_data->>'installments') ILIKE '%מתוך%'
               OR (raw_data->>'installments') ILIKE '%/%'
               OR description ~* '(תשלום|תשלומים|עסקה)?\\s*\\(?[0-9]{1,2}\\s*(מתוך|/)\\s*[0-9]{1,2}\\)?'
               OR merchant_name ~* '(תשלום|תשלומים|עסקה)?\\s*\\(?[0-9]{1,2}\\s*(מתוך|/)\\s*[0-9]{1,2}\\)?'
               OR (raw_data->>'memo') ~* '(תשלום|תשלומים|עסקה)?\\s*\\(?[0-9]{1,2}\\s*(מתוך|/)\\s*[0-9]{1,2}\\)?'
               OR (raw_data->>'description') ~* '(תשלום|תשלומים|עסקה)?\\s*\\(?[0-9]{1,2}\\s*(מתוך|/)\\s*[0-9]{1,2}\\)?'
               OR (raw_data->>'originalAmount' ~ '^-?[0-9]+(\\.[0-9]+)?$' AND (raw_data->>'originalAmount')::numeric > ABS(amount) * 1.5 AND amount < 0)
          )::int AS "installments",
          COUNT(*) FILTER (
            WHERE (currency IS NOT NULL AND UPPER(TRIM(currency)) NOT IN ('ILS', 'NIS', 'ש"ח', 'שח', '₪'))
               OR (raw_data->>'originalCurrency' IS NOT NULL AND UPPER(TRIM(raw_data->>'originalCurrency')) NOT IN ('ILS', 'NIS', 'ש"ח', 'שח', '₪'))
               OR (raw_data->>'original_currency' IS NOT NULL AND UPPER(TRIM(raw_data->>'original_currency')) NOT IN ('ILS', 'NIS', 'ש"ח', 'שח', '₪'))
               OR (raw_data->>'chargedCurrency' IS NOT NULL AND UPPER(TRIM(raw_data->>'chargedCurrency')) NOT IN ('ILS', 'NIS', 'ש"ח', 'שח', '₪'))
          )::int AS "foreign",
          COUNT(*) FILTER (
            WHERE category = 'משיכת מזומן' 
               OR LOWER(merchant_name) LIKE '%משיכת מזומן%' 
               OR LOWER(description) LIKE '%משיכת מזומן%' 
               OR LOWER(merchant_name) LIKE '%כספומט%'
               OR LOWER(description) LIKE '%כספומט%' 
               OR LOWER(merchant_name) LIKE '%atm%'
          )::int AS "cash",
          COUNT(*) FILTER (WHERE is_split = true)::int AS "splits",
          COUNT(*) FILTER (WHERE is_ignored = true)::int AS "ignored",
          COUNT(*) FILTER (
            WHERE EXISTS (SELECT 1 FROM transaction_receipts tr WHERE tr.transaction_id = transactions.id)
          )::int AS "receipts",
          COUNT(*) FILTER (
            WHERE EXISTS (SELECT 1 FROM transaction_notes tn WHERE tn.transaction_id = transactions.id)
          )::int AS "notes",
          COUNT(*) FILTER (
            WHERE EXISTS (SELECT 1 FROM transaction_links tl WHERE tl.transaction_id_a = transactions.id OR tl.transaction_id_b = transactions.id)
          )::int AS "links",
          COUNT(*) FILTER (
            WHERE (
              (
                merchant_name ~* '(^|[^a-zA-Z0-9א-ת])([בלמהכ]?-?bit|[בלמהכ]?-?ביט)([^a-zA-Z0-9א-ת]|$)'
                OR description ~* '(^|[^a-zA-Z0-9א-ת])([בלמהכ]?-?bit|[בלמהכ]?-?ביט)([^a-zA-Z0-9א-ת]|$)'
                OR (raw_data->>'memo') ~* '(^|[^a-zA-Z0-9א-ת])([בלמהכ]?-?bit|[בלמהכ]?-?ביט)([^a-zA-Z0-9א-ת]|$)'
              )
              AND NOT (
                merchant_name ~* '(ביטוח|ביטול|ביטחון|debit)'
                OR description ~* '(ביטוח|ביטול|ביטחון|debit)'
                OR (raw_data->>'memo') ~* '(ביטוח|ביטול|ביטחון|debit)'
              )
            )
          )::int AS "bit",
          COUNT(*) FILTER (
            WHERE is_cc_billing = true OR category = 'חיוב אשראי'
          )::int AS "cc_billing",
          COUNT(*) FILTER (
            WHERE (is_cc_billing = true OR category = 'חיוב אשראי')
              AND EXISTS (SELECT 1 FROM transaction_links tl WHERE tl.transaction_id_a = transactions.id OR tl.transaction_id_b = transactions.id)
          )::int AS "cc_linked",
          COUNT(*) FILTER (
            WHERE (is_cc_billing = true OR category = 'חיוב אשראי')
              AND NOT EXISTS (SELECT 1 FROM transaction_links tl WHERE tl.transaction_id_a = transactions.id OR tl.transaction_id_b = transactions.id)
          )::int AS "cc_unlinked"
        FROM transactions
      `);
      const specials = specialsRes.rows[0] || {};

      // 4. Currency counts (for all currencies appearing in transactions)
      const currencyCountsRes = await pool.query(`
        SELECT curr, COUNT(*)::int AS count
        FROM (
          SELECT COALESCE(
            NULLIF(UPPER(TRIM(currency)), ''),
            NULLIF(UPPER(TRIM(raw_data->>'originalCurrency')), ''),
            NULLIF(UPPER(TRIM(raw_data->>'original_currency')), ''),
            NULLIF(UPPER(TRIM(raw_data->>'chargedCurrency')), '')
          ) AS curr
          FROM transactions
        ) s
        WHERE curr IS NOT NULL AND curr NOT IN ('ILS', 'NIS', 'ש"ח', 'שח', '₪')
        GROUP BY curr
      `);
      const currencies = {};
      currencyCountsRes.rows.forEach((r) => { currencies[r.curr] = r.count; });

      return reply.code(200).send({
        accounts,
        categories,
        specials,
        currencies,
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to calculate filter counts');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // GET /api/v2/transactions/:id - Fetch single transaction details
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params;
    try {
      const query = `
        SELECT 
          t.id,
          t.account_id AS "accountId",
          b.display_name AS "accountDisplayName",
          b.bank_company AS "bankCompany",
          b.account_number AS "accountNumber",
          t.amount,
          COALESCE(
            CASE WHEN t.raw_data->>'originalAmount' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (t.raw_data->>'originalAmount')::numeric ELSE NULL END,
            t.amount
          ) AS "originalAmount",
          COALESCE(t.raw_data->>'originalCurrency', t.raw_data->>'original_currency', t.raw_data->>'chargedCurrency') AS "originalCurrency",
          COALESCE(
            CASE WHEN t.raw_data->>'chargedAmount' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (t.raw_data->>'chargedAmount')::numeric ELSE NULL END,
            t.amount
          ) AS "chargedAmount",
          t.currency,
          t.description,
          t.merchant_name AS "merchantName",
          t.user_description AS "userDescription",
          t.category,
          t.date,
          t.processed_date AS "processedDate",
          t.raw_data->>'memo' AS "memo",
          t.raw_data AS "rawData",
          COALESCE(t.raw_data->>'identifier', t.external_id) AS "identifier",
          t.raw_data->>'type' AS "type",
          t.raw_data->'installments' AS "installments",
          t.is_ignored AS "isIgnored",
          t.is_reviewed AS "isReviewed",
          t.is_flagged AS "isFlagged",
          t.is_split AS "isSplit",
          t.is_cc_billing AS "isCcBilling",
          CASE 
            WHEN t.category = 'משיכת מזומן' 
              OR LOWER(t.merchant_name) LIKE '%משיכת מזומן%' 
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
          (SELECT COUNT(*) FROM transaction_links tl WHERE tl.transaction_id_a = t.id OR tl.transaction_id_b = t.id) > 0 AS "hasLinks",
          (SELECT COUNT(*) FROM transaction_receipts tr WHERE tr.transaction_id = t.id) > 0 AS "hasReceipts",
          (SELECT COUNT(*) FROM transaction_receipts tr WHERE tr.transaction_id = t.id)::int AS "receiptsCount",
          (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'id', ts.id,
                  'category', ts.category,
                  'amount', ts.amount,
                  'description', ts.description
                )
              ),
              '[]'::json
            )
            FROM transaction_splits ts
            WHERE ts.transaction_id = t.id
          ) AS "splits"
        FROM transactions t
        JOIN bank_accounts b ON t.account_id = b.id
        WHERE t.id = $1
      `;
      const result = await pool.query(query, [id]);
      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Transaction not found' });
      }
      const tx = result.rows[0];
      let mName = cleanSpacedHebrew(tx.merchantName);
      const desc = cleanSpacedHebrew(tx.description);
      const rawMemo = tx.rawData?.memo;
      const bitTitle = formatBitTransactionName(mName, desc, rawMemo);
      if (bitTitle && (!tx.userDescription || !tx.userDescription.trim())) {
        mName = bitTitle;
      }
      const fxDetails = await calculateFxDetails(tx);
      return reply.code(200).send({
        data: {
          ...tx,
          merchantName: mName,
          description: desc,
          userDescription: cleanSpacedHebrew(tx.userDescription),
          fxDetails,
        }
      });
    } catch (err) {
      fastify.log.error(err, 'Error in single transaction query');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // GET /api/v2/transactions/:id/fx - Get historical exchange rate and FX fee breakdown
  fastify.get('/:id/fx', async (request, reply) => {
    const { id } = request.params;
    try {
      const query = `
        SELECT t.*, b.display_name AS "accountDisplayName", b.bank_company AS "bankCompany"
        FROM transactions t
        JOIN bank_accounts b ON t.account_id = b.id
        WHERE t.id = $1
      `;
      const res = await pool.query(query, [id]);
      if (res.rows.length === 0) {
        return reply.code(404).send({ error: 'Transaction not found' });
      }
      const tx = res.rows[0];
      const fxDetails = await calculateFxDetails(tx);
      return reply.code(200).send({ data: fxDetails });
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch FX details');
      return reply.code(500).send({ error: 'Failed to calculate FX details' });
    }
  });

  // PATCH /api/v2/transactions/:id - Update category, user description, or ignore status
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params;
    const parseResult = updateTransactionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'Validation Error', details: parseResult.error.issues });
    }

    const { category, userDescription, merchantName, description, amount, date, isIgnored, applyToSimilar } = parseResult.data;
    const setClauses = [];
    const values = [];

    if (category !== undefined) {
      values.push(category);
      setClauses.push(`category = $${values.length}`);
      setClauses.push(`is_manual_category = true`);
      setClauses.push(`is_reviewed = true`);
    }
    if (userDescription !== undefined) {
      values.push(userDescription);
      setClauses.push(`user_description = $${values.length}`);
    }
    if (merchantName !== undefined) {
      values.push(merchantName);
      setClauses.push(`merchant_name = $${values.length}`);
    }
    if (description !== undefined) {
      values.push(description);
      setClauses.push(`description = $${values.length}`);
    }
    if (amount !== undefined) {
      values.push(amount);
      setClauses.push(`amount = $${values.length}`);
    }
    if (date !== undefined) {
      values.push(date);
      setClauses.push(`date = $${values.length}`);
    }
    if (isIgnored !== undefined) {
      values.push(isIgnored);
      setClauses.push(`is_ignored = $${values.length}`);
    }

    if (setClauses.length === 0) {
      return reply.code(400).send({ error: 'Nothing to update' });
    }

    try {
      let updatedSimilarCount = 0;

      // If applyToSimilar is requested, apply category, userDescription, and isIgnored to matching transactions
      if (applyToSimilar) {
        const origRes = await pool.query('SELECT id, merchant_name, description, raw_data FROM transactions WHERE id = $1', [id]);
        const origTx = origRes.rows[0];
        if (origTx) {
          const rawMemo = origTx.raw_data?.memo;
          const rawDesc = origTx.raw_data?.description;
          const mName = cleanSpacedHebrew(origTx.merchant_name || '').trim();
          const desc = cleanSpacedHebrew(origTx.description || rawDesc || '').trim();
          const isCurrentBit = isBitTransaction(mName, desc, rawMemo);

          const similarSetClauses = [];
          const similarValues = [];

          if (category !== undefined) {
            similarValues.push(category);
            similarSetClauses.push(`category = $${similarValues.length}`);
            similarSetClauses.push(`is_manual_category = true`);
            similarSetClauses.push(`is_reviewed = true`);
          }
          if (userDescription !== undefined) {
            similarValues.push(userDescription);
            similarSetClauses.push(`user_description = $${similarValues.length}`);
          }
          if (isIgnored !== undefined) {
            similarValues.push(isIgnored);
            similarSetClauses.push(`is_ignored = $${similarValues.length}`);
          }

          if (similarSetClauses.length > 0) {
            if (isCurrentBit) {
              const currentBitTitle = formatBitTransactionName(mName, desc, rawMemo);
              const currentDetail = currentBitTitle && currentBitTitle.startsWith('bit ')
                ? currentBitTitle.slice(4).trim()
                : '';

              if (currentDetail) {
                // Apply to BIT transactions containing this same contact name
                similarValues.push(`%${currentDetail}%`);
                const bulkQuery = `
                  UPDATE transactions
                  SET ${similarSetClauses.join(', ')}
                  WHERE (
                    (merchant_name ILIKE $${similarValues.length} OR description ILIKE $${similarValues.length} OR (raw_data->>'memo') ILIKE $${similarValues.length})
                    AND (merchant_name ILIKE '%bit%' OR merchant_name ILIKE '%ביט%' OR merchant_name ILIKE '%בביט%' OR description ILIKE '%bit%' OR description ILIKE '%ביט%')
                  )
                `;
                const bulkRes = await pool.query(bulkQuery, similarValues);
                updatedSimilarCount = bulkRes.rowCount || 0;
              } else {
                // Apply to all BIT transactions
                const bulkQuery = `
                  UPDATE transactions
                  SET ${similarSetClauses.join(', ')}
                  WHERE (
                    merchant_name ILIKE 'bit%' OR merchant_name ILIKE 'ביט%' OR merchant_name ILIKE '% בביט%' OR merchant_name ILIKE '%בביט%'
                    OR description ILIKE '%ביט%' OR description ILIKE '%bit%'
                  )
                `;
                const bulkRes = await pool.query(bulkQuery, similarValues);
                updatedSimilarCount = bulkRes.rowCount || 0;
              }
            } else {
              let whereSql = '';
              if (mName && mName !== 'בית עסק' && mName !== '') {
                similarValues.push(mName);
                whereSql = `TRIM(merchant_name) = TRIM($${similarValues.length})`;
              } else if (desc && desc !== '') {
                similarValues.push(desc);
                whereSql = `TRIM(description) = TRIM($${similarValues.length})`;
              }

              if (whereSql) {
                const bulkQuery = `
                  UPDATE transactions
                  SET ${similarSetClauses.join(', ')}
                  WHERE ${whereSql}
                `;
                const bulkRes = await pool.query(bulkQuery, similarValues);
                updatedSimilarCount = bulkRes.rowCount || 0;
              }
            }
          }
        }
      }

      // Update the specific transaction
      values.push(id);
      const query = `
        UPDATE transactions 
        SET ${setClauses.join(', ')} 
        WHERE id = $${values.length}
        RETURNING id, category, merchant_name AS "merchantName", description, amount, date, user_description AS "userDescription", is_ignored AS "isIgnored"
      `;

      const result = await pool.query(query, values);
      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Transaction not found' });
      }

      // Auto-learn user categorization rule if category was updated
      if (category) {
        const tx = result.rows[0];
        const m = tx.merchantName?.trim();
        if (m && m !== 'בית עסק' && m !== 'ללא תיאור' && !m.startsWith('bit ')) {
          saveUserRule({
            userId: '00000000-0000-0000-0000-000000000001',
            merchantPattern: m,
            category: category,
            matchType: 'exact',
          }).catch(() => {});
        }
      }

      return reply.code(200).send({
        data: result.rows[0],
        updatedSimilarCount,
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to update transaction');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // GET /api/v2/transactions/:id/similar - List similar transactions sharing merchant name or BIT
  fastify.get('/:id/similar', async (request, reply) => {
    const { id } = request.params;
    try {
      const origRes = await pool.query(
        'SELECT id, merchant_name, description, raw_data FROM transactions WHERE id = $1',
        [id]
      );
      if (origRes.rows.length === 0) {
        return reply.code(404).send({ error: 'Transaction not found' });
      }
      const origTx = origRes.rows[0];
      const rawMemo = origTx.raw_data?.memo;
      const rawDesc = origTx.raw_data?.description;
      const m = cleanSpacedHebrew(origTx.merchant_name || '').trim();
      const d = cleanSpacedHebrew(origTx.description || rawDesc || '').trim();
      const mem = cleanSpacedHebrew(rawMemo || '').trim();

      const isCurrentBit = isBitTransaction(m, d, mem);

      if (isCurrentBit) {
        // Find ALL other BIT transactions in the system!
        const res = await pool.query(
          `SELECT t.id, t.date, t.amount, t.category, t.merchant_name AS "merchantName", t.description, t.user_description AS "userDescription",
                  t.raw_data AS "rawData",
                  b.display_name AS "accountDisplayName", b.bank_company AS "bankCompany"
           FROM transactions t
           JOIN bank_accounts b ON t.account_id = b.id
           WHERE t.id != $1
             AND (
               t.merchant_name ILIKE '%bit%'
               OR t.merchant_name ILIKE '%ביט%'
               OR t.merchant_name ILIKE '%בביט%'
               OR t.description ILIKE '%bit%'
               OR t.description ILIKE '%ביט%'
               OR t.description ILIKE '%בביט%'
               OR (t.raw_data->>'memo') ILIKE '%bit%'
               OR (t.raw_data->>'memo') ILIKE '%ביט%'
               OR (t.raw_data->>'description') ILIKE '%bit%'
               OR (t.raw_data->>'description') ILIKE '%ביט%'
             )
           ORDER BY t.date DESC
           LIMIT 200`,
          [id]
        );

        const currentBitTitle = formatBitTransactionName(m, d, mem);
        const currentDetail = currentBitTitle && currentBitTitle.startsWith('bit ')
          ? currentBitTitle.slice(4).trim().toLowerCase()
          : '';

        const data = res.rows
          .filter((r) => isBitTransaction(r.merchantName, r.description, r.rawData?.memo))
          .map((r) => {
            let mName = cleanSpacedHebrew(r.merchantName);
            const desc = cleanSpacedHebrew(r.description);
            const itemMemo = r.rawData?.memo;
            const bitTitle = formatBitTransactionName(mName, desc, itemMemo);
            if (bitTitle && (!r.userDescription || !r.userDescription.trim())) {
              mName = bitTitle;
            }
            return {
              ...r,
              merchantName: mName,
              description: desc,
              userDescription: cleanSpacedHebrew(r.userDescription),
            };
          })
          .sort((a, b) => {
            if (currentDetail) {
              const aName = (a.merchantName || '').toLowerCase();
              const bName = (b.merchantName || '').toLowerCase();
              const aMatches = aName.includes(currentDetail);
              const bMatches = bName.includes(currentDetail);
              if (aMatches && !bMatches) return -1;
              if (!aMatches && bMatches) return 1;
            }
            return new Date(b.date).getTime() - new Date(a.date).getTime();
          });

        return reply.code(200).send({ data, total: data.length });
      }

      // Non-BIT normal merchant lookup
      const searchMerchant = (m && m !== 'בית עסק') ? m : (d && d !== '' ? d : null);
      if (!searchMerchant) {
        return reply.code(200).send({ data: [], total: 0 });
      }

      const res = await pool.query(
        `SELECT t.id, t.date, t.amount, t.category, t.merchant_name AS "merchantName", t.description, t.user_description AS "userDescription",
                b.display_name AS "accountDisplayName", b.bank_company AS "bankCompany"
         FROM transactions t
         JOIN bank_accounts b ON t.account_id = b.id
         WHERE t.id != $1
           AND (
             TRIM(t.merchant_name) = TRIM($2)
             OR (t.merchant_name IS NOT NULL AND TRIM(t.merchant_name) != 'בית עסק' AND TRIM(t.merchant_name) != '' AND TRIM(t.merchant_name) ILIKE TRIM($2))
           )
         ORDER BY t.date DESC
         LIMIT 50`,
        [id, searchMerchant]
      );

      const data = res.rows.map((r) => ({
        ...r,
        merchantName: cleanSpacedHebrew(r.merchantName),
        description: cleanSpacedHebrew(r.description),
        userDescription: cleanSpacedHebrew(r.userDescription),
      }));

      return reply.code(200).send({ data, total: data.length });
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch similar transactions');
      return reply.code(500).send({ error: 'Database error' });
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
      setClauses.push(`is_manual_category = true`);
      setClauses.push(`is_reviewed = true`);
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
      return reply.code(500).send({ error: 'Database error' });
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
      return reply.code(500).send({ error: 'Database error' });
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
    const txRes = await pool.query('SELECT id, amount, category, description, date FROM transactions WHERE id = $1', [id]);
    if (txRes.rows.length === 0) {
      return reply.code(404).send({ error: 'Transaction not found' });
    }

    const rawParentAmount = parseFloat(txRes.rows[0].amount);
    const parentAmount = Math.abs(rawParentAmount);
    let splitsList = splits.map((s) => ({
      amount: Math.abs(parseFloat(s.amount)),
      category: s.category,
      description: s.description || null,
    }));
    const splitsSum = splitsList.reduce((acc, curr) => acc + curr.amount, 0);

    // Prevent exceeding parent amount
    if (splitsSum > parentAmount + 0.01) {
      return reply.code(400).send({
        error: 'Split Balance Mismatch',
        message: `Total splits sum (₪${splitsSum.toFixed(2)}) cannot exceed original transaction amount (₪${parentAmount.toFixed(2)})`,
        parentAmount,
        splitsSum,
      });
    }

    // Partial split support: if splitsSum < parentAmount - 0.01, append remainder split with parent's original category
    const remainder = parentAmount - splitsSum;
    if (remainder > 0.01) {
      splitsList.push({
        amount: Math.round(remainder * 100) / 100,
        category: txRes.rows[0].category || 'כללי',
        description: 'יתרת תנועה',
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM transaction_splits WHERE transaction_id = $1', [id]);

      for (const split of splitsList) {
        const signedSplitAmount = rawParentAmount < 0 ? -Math.abs(split.amount) : Math.abs(split.amount);
        await client.query(
          `INSERT INTO transaction_splits (transaction_id, amount, category, description)
           VALUES ($1, $2, $3, $4)`,
          [id, signedSplitAmount, split.category, split.description || null]
        );
      }

      await client.query('UPDATE transactions SET is_split = true WHERE id = $1', [id]);

      // Check if any split is allocated to "ארנק" (Cash Wallet)
      const walletSplit = splits.find(s =>
        (s.category && s.category.includes('ארנק')) ||
        (s.description && s.description.includes('ארנק'))
      );

      const splitExternalId = `split_wallet_${id}`;

      // Look up any EXISTING wallet deposit for this transaction (from a previous save)
      const existingWalletTx = await client.query(
        `SELECT t.amount, b.id AS wallet_account_id
         FROM transactions t
         JOIN bank_accounts b ON t.account_id = b.id
         WHERE t.external_id = $1 AND b.bank_company = 'wallet'
         LIMIT 1`,
        [splitExternalId]
      );
      const previousWalletAmount = existingWalletTx.rows.length > 0
        ? parseFloat(existingWalletTx.rows[0].amount) || 0
        : 0;

      if (walletSplit && walletSplit.amount > 0) {
        // Delta: only adjust balance by the difference (avoids double-credit on re-save)
        const delta = walletSplit.amount - previousWalletAmount;
        if (Math.abs(delta) > 0.001) {
          await client.query(
            `UPDATE bank_accounts
             SET balance = GREATEST(balance + $1, 0)
             WHERE bank_company = 'wallet' AND user_id = '00000000-0000-0000-0000-000000000001'`,
            [delta]
          );
        }

        // Fetch wallet account ID and insert/update deposit transaction
        const walletAccRes = await client.query(
          `SELECT id FROM bank_accounts WHERE bank_company = 'wallet' AND user_id = '00000000-0000-0000-0000-000000000001' LIMIT 1`
        );
        if (walletAccRes.rows.length > 0) {
          const walletId = walletAccRes.rows[0].id;
          await client.query(
            `INSERT INTO transactions (
               account_id, external_id, date, amount, currency, description, merchant_name, category, status, user_description, is_manual_category, is_reviewed
             ) VALUES ($1, $2, $3, $4, 'ILS', $5, 'ארנק מזומנים', 'ארנק מזומנים', 'completed', $6, true, true)
             ON CONFLICT (account_id, external_id) DO UPDATE
               SET amount = EXCLUDED.amount, description = EXCLUDED.description, user_description = EXCLUDED.user_description`,
            [walletId, splitExternalId, txRes.rows[0].date || new Date(), walletSplit.amount, 'הפקדה מפיצול משיכת מזומן', walletSplit.description || 'הפקדה לארנק מזומנים']
          );
        }
      } else if (previousWalletAmount > 0) {
        // Wallet split was removed – revert the previously credited balance
        await client.query(
          `UPDATE bank_accounts SET balance = GREATEST(balance - $1, 0) WHERE bank_company = 'wallet'`,
          [previousWalletAmount]
        );
        await client.query('DELETE FROM transactions WHERE external_id = $1', [splitExternalId]);
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
      return reply.code(500).send({ error: 'Database error' });
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

      // Revert wallet deposit if it existed
      const splitExternalId = `split_wallet_${id}`;
      const prevWalletTx = await client.query('SELECT amount FROM transactions WHERE external_id = $1', [splitExternalId]);
      if (prevWalletTx.rows.length > 0) {
        const amt = parseFloat(prevWalletTx.rows[0].amount) || 0;
        await client.query(
          `UPDATE bank_accounts SET balance = GREATEST(balance - $1, 0) WHERE bank_company = 'wallet'`,
          [amt]
        );
        await client.query('DELETE FROM transactions WHERE external_id = $1', [splitExternalId]);
      }

      await client.query('COMMIT');
      return reply.code(200).send({ success: true, message: 'Splits removed' });
    } catch (err) {
      await client.query('ROLLBACK');
      return reply.code(500).send({ error: 'Database error' });
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
      return reply.code(500).send({ error: 'Database error' });
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
      return reply.code(500).send({ error: 'Database error' });
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
      return reply.code(500).send({ error: 'Database error' });
    }
  });

let feeColumnsChecked = false;
let hasFeeColumns = false;

async function ensureFeeColumnsExist(pool) {
  if (feeColumnsChecked) return hasFeeColumns;
  try {
    const check = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'transaction_links' AND column_name = 'fee_amount'
    `);
    if (check.rows.length > 0) {
      hasFeeColumns = true;
      feeColumnsChecked = true;
      return true;
    }
    await pool.query(`
      ALTER TABLE transaction_links ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE transaction_links ADD COLUMN IF NOT EXISTS fee_category VARCHAR(100) DEFAULT 'עמלות';
      ALTER TABLE transaction_links ADD COLUMN IF NOT EXISTS is_fee_classified BOOLEAN DEFAULT false;
    `);
    hasFeeColumns = true;
    feeColumnsChecked = true;
    return true;
  } catch (err) {
    console.warn('[TransactionsV2] fee columns not present in transaction_links, using note fallback:', err.message);
    hasFeeColumns = false;
    feeColumnsChecked = true;
    return false;
  }
}

  // GET /api/v2/transactions/:id/links - Get linked transactions
  fastify.get('/:id/links', async (request, reply) => {
    const { id } = request.params;
    await autoLinkInstallmentTransactions(pool, id).catch(() => {});
    const feeCols = await ensureFeeColumnsExist(pool);
    const feeSelect = feeCols 
      ? `COALESCE(tl.fee_amount, 0) AS "feeAmount",
         COALESCE(tl.fee_category, 'עמלות') AS "feeCategory",
         COALESCE(tl.is_fee_classified, false) AS "isFeeClassified",`
      : `0 AS "feeAmount",
         'עמלות' AS "feeCategory",
         false AS "isFeeClassified",`;

    const query = `
      SELECT 
        tl.id AS "linkId",
        tl.link_type AS "linkType",
        tl.note AS "linkNote",
        ${feeSelect}
        tl.created_at AS "linkedAt",
        t.id,
        t.date,
        t.amount,
        t.currency,
        t.merchant_name AS "merchantName",
        t.description,
        t.user_description AS "userDescription",
        t.category,
        b.display_name AS "accountDisplayName",
        b.bank_company AS "bankCompany"
      FROM transaction_links tl
      JOIN transactions t ON (
        (tl.transaction_id_a = $1 AND tl.transaction_id_b = t.id)
        OR
        (tl.transaction_id_b = $1 AND tl.transaction_id_a = t.id)
      )
      JOIN bank_accounts b ON t.account_id = b.id
      WHERE tl.transaction_id_a = $1 OR tl.transaction_id_b = $1
      ORDER BY tl.created_at DESC
    `;
    try {
      const result = await pool.query(query, [id]);
      const data = result.rows.map((l) => {
        let feeAmount = parseFloat(l.feeAmount) || 0;
        let feeCategory = l.feeCategory || 'עמלות';
        let isFeeClassified = Boolean(l.isFeeClassified);
        let linkNote = l.linkNote || '';

        // If fallback [FEE:amt:cat:classified] is in linkNote, parse it
        const match = linkNote.match(/\[FEE:([\d.]+):([^:]+):([01])\]/);
        if (match) {
          feeAmount = parseFloat(match[1]) || 0;
          feeCategory = match[2] || 'עמלות';
          isFeeClassified = match[3] === '1';
          linkNote = linkNote.replace(match[0], '').trim();
        }

        return {
          ...l,
          feeAmount,
          feeCategory,
          isFeeClassified,
          linkNote,
          merchantName: cleanSpacedHebrew(l.merchantName),
          description: cleanSpacedHebrew(l.description),
          userDescription: cleanSpacedHebrew(l.userDescription),
        };
      });
      return reply.code(200).send({ data });
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch transaction links');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // POST /api/v2/transactions/:id/links - Link this transaction to another
  fastify.post('/:id/links', async (request, reply) => {
    const { id } = request.params;
    const parseResult = linkSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'Validation Error', details: parseResult.error.issues });
    }

    const { targetTransactionId, linkType, note, feeAmount, feeCategory, isFeeClassified } = parseResult.data;
    if (id === targetTransactionId) {
      return reply.code(400).send({ error: 'Cannot link a transaction to itself' });
    }

    try {
      const feeCols = await ensureFeeColumnsExist(pool);
      // Check if a link in either direction already exists
      const existing = await pool.query(
        `SELECT id FROM transaction_links
         WHERE (transaction_id_a = $1 AND transaction_id_b = $2)
            OR (transaction_id_a = $2 AND transaction_id_b = $1)`,
        [id, targetTransactionId]
      );

      let result;
      if (feeCols) {
        try {
          if (existing.rows.length > 0) {
            result = await pool.query(
              `UPDATE transaction_links
               SET link_type = $1, note = $2,
                   fee_amount = COALESCE($4, fee_amount),
                   fee_category = COALESCE($5, fee_category),
                   is_fee_classified = COALESCE($6, is_fee_classified)
               WHERE id = $3
               RETURNING id, transaction_id_a AS "transactionIdA", transaction_id_b AS "transactionIdB",
                         link_type AS "linkType", note, fee_amount AS "feeAmount",
                         fee_category AS "feeCategory", is_fee_classified AS "isFeeClassified"`,
              [linkType, note || null, existing.rows[0].id, feeAmount ?? null, feeCategory || 'עמלות', Boolean(isFeeClassified)]
            );
          } else {
            result = await pool.query(
              `INSERT INTO transaction_links (transaction_id_a, transaction_id_b, link_type, note, fee_amount, fee_category, is_fee_classified)
               VALUES ($1, $2, $3, $4, COALESCE($5, 0), COALESCE($6, 'עמלות'), COALESCE($7, false))
               RETURNING id, transaction_id_a AS "transactionIdA", transaction_id_b AS "transactionIdB",
                         link_type AS "linkType", note, fee_amount AS "feeAmount",
                         fee_category AS "feeCategory", is_fee_classified AS "isFeeClassified"`,
              [id, targetTransactionId, linkType, note || null, feeAmount ?? null, feeCategory || 'עמלות', Boolean(isFeeClassified)]
            );
          }
          return reply.code(201).send({ success: true, data: result.rows[0] });
        } catch (dbErr) {
          console.warn('[TransactionsV2] Insert with fee columns failed, falling back:', dbErr.message);
          hasFeeColumns = false;
        }
      }

      // Fallback: store fee info safely in note
      const hasFee = feeAmount !== undefined && feeAmount !== null && Number(feeAmount) > 0;
      const feeTag = hasFee ? `[FEE:${Number(feeAmount).toFixed(2)}:${feeCategory || 'עמלות'}:${isFeeClassified ? '1' : '0'}]` : '';
      const finalNote = [note, feeTag].filter(Boolean).join(' ').trim() || null;

      if (existing.rows.length > 0) {
        result = await pool.query(
          `UPDATE transaction_links
           SET link_type = $1, note = $2
           WHERE id = $3
           RETURNING id, transaction_id_a AS "transactionIdA", transaction_id_b AS "transactionIdB",
                     link_type AS "linkType", note`,
          [linkType, finalNote, existing.rows[0].id]
        );
      } else {
        result = await pool.query(
          `INSERT INTO transaction_links (transaction_id_a, transaction_id_b, link_type, note)
           VALUES ($1, $2, $3, $4)
           RETURNING id, transaction_id_a AS "transactionIdA", transaction_id_b AS "transactionIdB",
                     link_type AS "linkType", note`,
          [id, targetTransactionId, linkType, finalNote]
        );
      }

      const row = result.rows[0] || {};
      row.feeAmount = feeAmount || 0;
      row.feeCategory = feeCategory || 'עמלות';
      row.isFeeClassified = Boolean(isFeeClassified);
      return reply.code(201).send({ success: true, data: row });
    } catch (err) {
      fastify.log.error(err, 'Failed to link transaction');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // PATCH /api/v2/transactions/links/:linkId/fee - Toggle or update fee classification
  fastify.patch('/links/:linkId/fee', async (request, reply) => {
    const { linkId } = request.params;
    const { isFeeClassified, feeAmount, feeCategory } = request.body || {};
    try {
      const feeCols = await ensureFeeColumnsExist(pool);
      if (feeCols) {
        try {
          const setClauses = [];
          const values = [];
          if (isFeeClassified !== undefined) {
            values.push(isFeeClassified);
            setClauses.push(`is_fee_classified = $${values.length}`);
          }
          if (feeAmount !== undefined) {
            values.push(feeAmount);
            setClauses.push(`fee_amount = $${values.length}`);
          }
          if (feeCategory !== undefined) {
            values.push(feeCategory);
            setClauses.push(`fee_category = $${values.length}`);
          }
          if (setClauses.length > 0) {
            values.push(linkId);
            const res = await pool.query(
              `UPDATE transaction_links SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
              values
            );
            if (res.rows.length === 0) return reply.code(404).send({ error: 'Link not found' });
            return reply.code(200).send({ success: true, data: res.rows[0] });
          }
        } catch (updateErr) {
          console.warn('[TransactionsV2] Fee update via columns failed, falling back to note:', updateErr.message);
        }
      }

      // Fallback: update fee in note
      const currentRes = await pool.query('SELECT note FROM transaction_links WHERE id = $1', [linkId]);
      if (currentRes.rows.length === 0) return reply.code(404).send({ error: 'Link not found' });
      let currentNote = currentRes.rows[0].note || '';
      let existingAmount = 0;
      let existingCat = 'עמלות';
      let existingClassified = false;
      const match = currentNote.match(/\[FEE:([\d.]+):([^:]+):([01])\]/);
      if (match) {
        existingAmount = parseFloat(match[1]) || 0;
        existingCat = match[2] || 'עמלות';
        existingClassified = match[3] === '1';
        currentNote = currentNote.replace(match[0], '').trim();
      }
      const newAmount = feeAmount !== undefined ? feeAmount : existingAmount;
      const newCat = feeCategory !== undefined ? feeCategory : existingCat;
      const newClassified = isFeeClassified !== undefined ? isFeeClassified : existingClassified;
      const newTag = (newAmount > 0) ? `[FEE:${Number(newAmount).toFixed(2)}:${newCat}:${newClassified ? '1' : '0'}]` : '';
      const updatedNote = [currentNote, newTag].filter(Boolean).join(' ').trim() || null;
      await pool.query('UPDATE transaction_links SET note = $1 WHERE id = $2', [updatedNote, linkId]);
      return reply.code(200).send({ success: true, data: { id: linkId, feeAmount: newAmount, feeCategory: newCat, isFeeClassified: newClassified } });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error' });
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
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // GET /api/v2/transactions/:id/reconciliation-candidates - Get matching candidate transactions
  fastify.get('/:id/reconciliation-candidates', async (request, reply) => {
    const { id } = request.params;
    let minScore = request.query.minScore ? parseInt(request.query.minScore, 10) : undefined;
    const daysWindow = request.query.daysWindow ? parseInt(request.query.daysWindow, 10) : 45;

    // Load minScore from settings if not explicitly passed
    if (minScore === undefined || isNaN(minScore)) {
      try {
        const settingsRes = await pool.query(
          `SELECT settings FROM system_settings WHERE user_id = '00000000-0000-0000-0000-000000000001'`
        );
        const settings = settingsRes.rows[0]?.settings || {};
        minScore = typeof settings.ccManualScoreThreshold === 'number' 
          ? settings.ccManualScoreThreshold 
          : (typeof settings.reconciliationMinScore === 'number' ? settings.reconciliationMinScore : 35);
      } catch {
        minScore = 35;
      }
    }

    try {
      const candidates = await findMatchesForTransaction(pool, id, { minScore, daysWindow });
      return reply.code(200).send({ data: candidates, minScore });
    } catch (err) {
      fastify.log.error(err, 'Failed to find reconciliation candidates');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // GET /api/v2/transactions/detected-cc-merchants - List identified credit card companies & billing merchants
  fastify.get('/detected-cc-merchants', async (request, reply) => {
    try {
      const query = `
        SELECT 
          COALESCE(NULLIF(TRIM(t.merchant_name), ''), NULLIF(TRIM(t.description), ''), 'ללא שם') AS "merchantName",
          b.bank_company AS "bankCompany",
          b.display_name AS "accountDisplayName",
          COUNT(t.id)::int AS "txCount",
          ROUND(COALESCE(SUM(ABS(t.amount)), 0)::numeric, 2) AS "totalAmount",
          MAX(t.date) AS "lastDate",
          COUNT(t.id) FILTER (WHERE EXISTS (
            SELECT 1 FROM transaction_links tl 
            WHERE tl.transaction_id_a = t.id OR tl.transaction_id_b = t.id
          ))::int AS "linkedCount"
        FROM transactions t
        JOIN bank_accounts b ON t.account_id = b.id
        WHERE b.user_id = '00000000-0000-0000-0000-000000000001'
          AND (t.is_cc_billing = true OR t.category = 'חיוב אשראי')
        GROUP BY COALESCE(NULLIF(TRIM(t.merchant_name), ''), NULLIF(TRIM(t.description), ''), 'ללא שם'), b.bank_company, b.display_name
        ORDER BY "txCount" DESC, "totalAmount" DESC;
      `;
      const res = await pool.query(query);
      const merchants = res.rows.map((row) => ({
        merchantName: cleanSpacedHebrew(row.merchantName),
        bankCompany: row.bankCompany,
        accountDisplayName: row.accountDisplayName,
        txCount: parseInt(row.txCount, 10) || 0,
        totalAmount: parseFloat(row.totalAmount) || 0,
        lastDate: row.lastDate,
        linkedCount: parseInt(row.linkedCount, 10) || 0,
      }));
      return reply.code(200).send({ data: merchants });
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch detected CC merchants');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // POST /api/v2/transactions/reconcile-auto - Auto-link exact-amount matches (>= 85%)
  fastify.post('/reconcile-auto', async (request, reply) => {
    const autoThreshold = request.body?.autoThreshold ? parseInt(request.body.autoThreshold, 10) : 85;
    try {
      const result = await runAutoReconciliation(pool, '00000000-0000-0000-0000-000000000001', { autoThreshold });
      return reply.code(200).send({ success: true, ...result });
    } catch (err) {
      fastify.log.error(err, 'Failed to run auto-reconciliation');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // POST /api/v2/transactions/detect-cc-billings - Scan and tag CC billings
  fastify.post('/detect-cc-billings', async (request, reply) => {
    const userPatterns = request.body?.userPatterns || [];
    try {
      const result = await detectAndTagCcBillings(pool, '00000000-0000-0000-0000-000000000001', userPatterns);
      return reply.code(200).send({ success: true, ...result });
    } catch (err) {
      fastify.log.error(err, 'Failed to detect CC billings');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // Helper to flag unusually low or positive credit card debits in bank accounts
  async function flagAnomalousCcBillings() {
    try {
      const settingsRes = await pool.query(
        `SELECT settings FROM system_settings WHERE user_id = '00000000-0000-0000-0000-000000000001'`
      );
      const settings = settingsRes.rows[0]?.settings || {};
      if (settings.flagLowCcBillings === false) {
        return { flaggedCount: 0 };
      }
      const minThreshold = typeof settings.ccBillingMinThreshold === 'number' ? settings.ccBillingMinThreshold : 500;
      const lookbackDays = typeof settings.ccBillingLookbackDays === 'number' ? settings.ccBillingLookbackDays : 60;

      const query = `
        UPDATE transactions t
        SET is_flagged = true
        FROM bank_accounts b
        WHERE t.account_id = b.id
          AND b.user_id = '00000000-0000-0000-0000-000000000001'
          AND b.bank_company NOT IN ('isracard', 'cal', 'max', 'amex', 'wallet')
          AND t.date >= CURRENT_DATE - ($1 || ' days')::interval
          AND (
            t.description ~* '(חיוב כרטיס|חיוב כאל|חיוב מקס|מקס איט|חיוב ישראכרט|כרטיסי אשראי|ויזה כאל|דיינרס|אמריקן אקספרס|חיוב כרטיסי|הוראת קבע כרטיס)'
            OR t.merchant_name ~* '(חיוב כרטיס|חיוב כאל|חיוב מקס|מקס איט|חיוב ישראכרט|כרטיסי אשראי|ויזה כאל|דיינרס|אמריקן אקספרס|חיוב כרטיסי|הוראת קבע כרטיס)'
          )
          AND (t.amount > 0 OR (t.amount < 0 AND ABS(t.amount) < $2))
          AND t.is_reviewed = false
          AND t.is_flagged = false
          AND t.is_ignored = false
        RETURNING t.id
      `;
      const res = await pool.query(query, [lookbackDays, minThreshold]);
      return { flaggedCount: res.rowCount };
    } catch (err) {
      fastify.log.warn(`[CC Billing Anomaly Detection] Error: ${err.message}`);
      return { flaggedCount: 0, error: err.message };
    }
  }

  // POST /api/v2/transactions/detect-anomalies - Run anomaly detection on demand
  fastify.post('/detect-anomalies', async (request, reply) => {
    const result = await flagAnomalousCcBillings();
    return reply.send({ success: true, ...result });
  });

  // GET /api/v2/transactions/review-queue - Get transactions awaiting review or flagged
  fastify.get('/review-queue', async (request, reply) => {
    await flagAnomalousCcBillings().catch(() => {});
    const { flaggedOnly, tab } = request.query;
    let condition = 't.is_reviewed = false AND t.is_flagged = false';
    
    if (tab === 'flagged' || flaggedOnly === 'true') {
      condition = 't.is_flagged = true';
    } else if (tab === 'approved') {
      condition = 't.is_reviewed = true';
    } else if (tab === 'pending') {
      condition = 't.is_reviewed = false AND t.is_flagged = false';
    } else if (flaggedOnly === 'all') {
      condition = '(t.is_reviewed = false OR t.is_flagged = true)';
    }

    const query = `
      SELECT 
        t.id,
        t.account_id AS "accountId",
        b.bank_company AS "bankCompany",
        b.display_name AS "accountDisplayName",
        b.account_number AS "accountNumber",
        t.date,
        t.processed_date AS "processedDate",
        t.amount,
        t.currency,
        t.description,
        t.merchant_name AS "merchantName",
        t.category,
        t.user_description AS "userDescription",
        t.is_flagged AS "isFlagged",
        t.is_reviewed AS "isReviewed",
        t.raw_data AS "rawData"
      FROM transactions t
      JOIN bank_accounts b ON t.account_id = b.id
      WHERE b.user_id = '00000000-0000-0000-0000-000000000001' AND ${condition} AND t.is_ignored = false
      ORDER BY t.date DESC, t.id DESC
      LIMIT 100
    `;
    try {
      const res = await pool.query(query);
      const data = res.rows.map((tx) => ({
        ...tx,
        merchantName: cleanSpacedHebrew(tx.merchantName),
        description: cleanSpacedHebrew(tx.description),
        userDescription: cleanSpacedHebrew(tx.userDescription),
      }));
      return reply.code(200).send({ data });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // POST /api/v2/transactions/:id/review - Fast review actions (approve, flag, unapprove, change_category)
  fastify.post('/:id/review', async (request, reply) => {
    const { id } = request.params;
    const { action, category } = request.body || {};
    try {
      if (action === 'approve') {
        await pool.query('UPDATE transactions SET is_reviewed = true, is_flagged = false WHERE id = $1', [id]);
      } else if (action === 'flag') {
        await pool.query('UPDATE transactions SET is_flagged = NOT is_flagged WHERE id = $1', [id]);
      } else if (action === 'unapprove') {
        await pool.query('UPDATE transactions SET is_reviewed = false WHERE id = $1', [id]);
      } else if (action === 'change_category' && category) {
        await pool.query(
          'UPDATE transactions SET category = $1, is_manual_category = true, is_reviewed = true WHERE id = $2',
          [category, id]
        );
      }
      return reply.code(200).send({ success: true, id, action });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TELEGRAM MINI APP (TMA) - ZERO-TRUST / LEAST-PRIVILEGE SCOPED ENDPOINTS
  // ──────────────────────────────────────────────────────────────────────────

  // Helper to cryptographically verify Telegram WebApp initData against botToken & chat ID
  async function validateTelegramAccess(request, reply) {
    try {
      const settingsRes = await pool.query(
        `SELECT settings FROM system_settings WHERE user_id = '00000000-0000-0000-0000-000000000001'`
      );
      const settings = settingsRes.rows[0]?.settings || {};
      const { telegramBotToken, telegramChatId } = settings;

      // If Telegram bot is configured in settings, enforce cryptographic WebApp verification
      if (telegramBotToken && telegramChatId) {
        const initData = request.headers['x-telegram-init-data'] || request.query?.initData;
        const tgCheck = verifyTelegramWebAppData(initData, telegramBotToken, telegramChatId);
        if (!tgCheck.valid) {
          reply.code(404).send({
            error: 'Not Found',
            message: 'Not Found',
          });
          return false;
        }
      }
      return true;
    } catch (err) {
      reply.code(500).send({ error: 'Security Check Error' });
      return false;
    }
  }

  // GET /api/v2/transactions/tma/categories - Fetch categories for TMA picker
  fastify.get('/tma/categories', async (request, reply) => {
    const isTgAuthorized = await validateTelegramAccess(request, reply);
    if (!isTgAuthorized) return;

    const token = request.headers['x-tma-token'];
    const isTokenValid = verifyTmaToken(token);

    if (!isTokenValid) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'טוקן TMA אינו תקף או שפג תוקפו' });
    }

    try {
      const res = await pool.query(
        `SELECT id, name, name_en, type, color, icon
         FROM categories
         WHERE user_id = '00000000-0000-0000-0000-000000000001'
         ORDER BY sort_order ASC, name ASC`
      );
      return reply.code(200).send({ data: res.rows });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // GET /api/v2/transactions/tma/:id - View single transaction inside TMA
  fastify.get('/tma/:id', async (request, reply) => {
    const isTgAuthorized = await validateTelegramAccess(request, reply);
    if (!isTgAuthorized) return;

    const { id } = request.params;
    const token = request.headers['x-tma-token'];

    // Strict validation: token MUST be cryptographically valid AND bound to this transaction ID
    const isAuthorized = verifyTmaToken(token, id);
    if (!isAuthorized) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'אין לך הרשאה לגשת לתנועה זו. הטוקן אינו תואם או שפג תוקפו.',
      });
    }

    try {
      const query = `
        SELECT
          t.id,
          t.date,
          t.amount,
          t.currency,
          t.merchant_name AS "merchantName",
          t.description,
          t.category,
          t.user_description AS "userDescription",
          t.is_ignored AS "isIgnored",
          t.status,
          t.processed_date AS "processedDate",
          t.raw_data AS "rawData",
          b.display_name AS "accountDisplayName",
          b.bank_company AS "bankCompany",
          RIGHT(COALESCE(b.account_number, '0000'), 4) AS "cardLast4"
        FROM transactions t
        JOIN bank_accounts b ON t.account_id = b.id
        WHERE t.id = $1
      `;
      const res = await pool.query(query, [id]);
      if (res.rows.length === 0) {
        return reply.code(404).send({ error: 'Not Found', message: 'התנועה לא נמצאה' });
      }

      const row = res.rows[0];
      let raw = row.rawData;
      if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch (e) { raw = {}; }
      }
      if (!raw || typeof raw !== 'object') raw = {};

      const fxDetails = await calculateFxDetails(row);

      return reply.code(200).send({
        data: {
          id: row.id,
          date: row.date,
          amount: parseFloat(row.amount),
          currency: row.currency || 'ILS',
          merchantName: cleanSpacedHebrew(row.merchantName),
          description: cleanSpacedHebrew(row.description),
          category: row.category,
          userDescription: cleanSpacedHebrew(row.userDescription),
          isIgnored: Boolean(row.isIgnored),
          identifier: raw.identifier || row.id,
          processedDate: row.processedDate || raw.processedDate || row.date,
          originalAmount: raw.originalAmount != null ? raw.originalAmount : row.amount,
          originalCurrency: raw.originalCurrency || row.currency || 'ILS',
          chargedAmount: raw.chargedAmount != null ? raw.chargedAmount : row.amount,
          memo: cleanSpacedHebrew(raw.memo || ''),
          status: row.status || raw.status || 'completed',
          type: raw.type || (parseFloat(row.amount) < 0 ? 'expense' : 'income'),
          installments: raw.installments || null,
          rawData: row.rawData,
          accountDisplayName: row.accountDisplayName || row.bankCompany,
          bankCompany: row.bankCompany,
          cardLast4: row.cardLast4,
          fxDetails,
        },
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch TMA transaction');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // PATCH /api/v2/transactions/tma/:id - Edit single transaction inside TMA
  fastify.patch('/tma/:id', async (request, reply) => {
    const isTgAuthorized = await validateTelegramAccess(request, reply);
    if (!isTgAuthorized) return;

    const { id } = request.params;
    const token = request.headers['x-tma-token'];

    // Strict validation: token MUST be cryptographically valid AND bound to this transaction ID
    const isAuthorized = verifyTmaToken(token, id);
    if (!isAuthorized) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'אין לך הרשאה לערוך תנועה זו. הטוקן אינו תואם או שפג תוקפו.',
      });
    }

    const { category, userDescription, merchantName, isIgnored, applyToSimilar } = request.body || {};

    try {
      // 1. Fetch current transaction state
      const currentRes = await pool.query(
        `SELECT id, category, merchant_name, description, user_description, is_ignored, raw_data
         FROM transactions WHERE id = $1`,
        [id]
      );
      if (currentRes.rows.length === 0) {
        return reply.code(404).send({ error: 'Not Found', message: 'התנועה לא נמצאה' });
      }
      const current = currentRes.rows[0];

      const setClauses = [];
      const values = [];

      if (category !== undefined) {
        values.push(category?.trim() || null);
        setClauses.push(`category = $${values.length}`);
        setClauses.push(`is_manual_category = true`);
        setClauses.push(`is_reviewed = true`);
      }
      if (userDescription !== undefined) {
        values.push(userDescription?.trim() || null);
        setClauses.push(`user_description = $${values.length}`);
      }
      if (merchantName !== undefined) {
        values.push(merchantName?.trim() || null);
        setClauses.push(`merchant_name = $${values.length}`);
      }
      if (isIgnored !== undefined) {
        values.push(Boolean(isIgnored));
        setClauses.push(`is_ignored = $${values.length}`);
      }

      if (setClauses.length === 0) {
        return reply.code(400).send({ error: 'Nothing to update', message: 'לא נמסרו שדות לעדכון' });
      }

      let updatedSimilarCount = 0;

      // 2. If applyToSimilar is checked, apply changes to similar transactions
      if (applyToSimilar) {
        const rawMemo = current.raw_data?.memo;
        const rawDesc = current.raw_data?.description;
        const mName = cleanSpacedHebrew(current.merchant_name || '').trim();
        const desc = cleanSpacedHebrew(current.description || rawDesc || '').trim();
        const isCurrentBit = isBitTransaction(mName, desc, rawMemo);

        const similarSetClauses = [];
        const similarValues = [];

        if (category !== undefined) {
          similarValues.push(category?.trim() || null);
          similarSetClauses.push(`category = $${similarValues.length}`);
          similarSetClauses.push(`is_manual_category = true`);
          similarSetClauses.push(`is_reviewed = true`);
        }
        if (userDescription !== undefined) {
          similarValues.push(userDescription?.trim() || null);
          similarSetClauses.push(`user_description = $${similarValues.length}`);
        }
        if (isIgnored !== undefined) {
          similarValues.push(Boolean(isIgnored));
          similarSetClauses.push(`is_ignored = $${similarValues.length}`);
        }

        if (similarSetClauses.length > 0) {
          if (isCurrentBit) {
            const currentBitTitle = formatBitTransactionName(mName, desc, rawMemo);
            const currentDetail = currentBitTitle && currentBitTitle.startsWith('bit ')
              ? currentBitTitle.slice(4).trim()
              : '';

            if (currentDetail) {
              similarValues.push(`%${currentDetail}%`);
              const bulkQuery = `
                UPDATE transactions
                SET ${similarSetClauses.join(', ')}
                WHERE (
                  (merchant_name ILIKE $${similarValues.length} OR description ILIKE $${similarValues.length} OR (raw_data->>'memo') ILIKE $${similarValues.length})
                  AND (merchant_name ILIKE '%bit%' OR merchant_name ILIKE '%ביט%' OR merchant_name ILIKE '%בביט%' OR description ILIKE '%bit%' OR description ILIKE '%ביט%')
                )
              `;
              const bulkRes = await pool.query(bulkQuery, similarValues);
              updatedSimilarCount = bulkRes.rowCount || 0;
            }
          } else {
            let whereSql = '';
            if (mName && mName !== 'בית עסק' && mName !== '') {
              similarValues.push(mName);
              whereSql = `TRIM(merchant_name) = TRIM($${similarValues.length})`;
            } else if (desc && desc !== '') {
              similarValues.push(desc);
              whereSql = `TRIM(description) = TRIM($${similarValues.length})`;
            }

            if (whereSql) {
              const bulkQuery = `
                UPDATE transactions
                SET ${similarSetClauses.join(', ')}
                WHERE ${whereSql}
              `;
              const bulkRes = await pool.query(bulkQuery, similarValues);
              updatedSimilarCount = bulkRes.rowCount || 0;
            }
          }
        }
      }

      // 3. Update target transaction
      values.push(id);
      const updateRes = await pool.query(
        `UPDATE transactions
         SET ${setClauses.join(', ')}
         WHERE id = $${values.length}
         RETURNING id, category, user_description AS "userDescription", merchant_name AS "merchantName", is_ignored AS "isIgnored"`,
        values
      );

      // 4. If category provided, save rule for future transactions
      if (category && applyToSimilar) {
        const pattern = (merchantName || current.merchant_name || current.description || '').trim();
        if (pattern && pattern.length >= 2 && !pattern.startsWith('bit ')) {
          saveUserRule({
            userId: '00000000-0000-0000-0000-000000000001',
            merchantPattern: pattern,
            category: category.trim(),
            matchType: 'exact',
          }).catch((err) => fastify.log.warn(`Failed to save user category rule: ${err.message}`));
        }
      }

      return reply.code(200).send({
        success: true,
        message: 'התנועה עודכנה בהצלחה!',
        data: updateRes.rows[0],
        updatedSimilarCount,
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to update TMA transaction');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // GET /api/v2/transactions/tma/:id/similar - Similar transactions
  fastify.get('/tma/:id/similar', async (request, reply) => {
    const isTgAuthorized = await validateTelegramAccess(request, reply);
    if (!isTgAuthorized) return;

    const { id } = request.params;
    const token = request.headers['x-tma-token'];
    if (!verifyTmaToken(token, id)) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'טוקן לא תקין' });
    }

    try {
      const txRes = await pool.query('SELECT merchant_name, description, raw_data FROM transactions WHERE id = $1', [id]);
      if (txRes.rows.length === 0) return reply.code(404).send({ error: 'Not Found' });
      const currentTx = txRes.rows[0];
      const merchantName = currentTx.merchant_name?.trim();

      if (!merchantName) {
        return reply.send({ success: true, data: [] });
      }

      const res = await pool.query(
        `SELECT t.id, t.date, t.amount, t.currency, t.merchant_name AS "merchantName",
                t.description, t.category, t.user_description AS "userDescription",
                b.display_name AS "accountDisplayName", b.bank_company AS "bankCompany"
         FROM transactions t
         JOIN bank_accounts b ON t.account_id = b.id
         WHERE t.id != $1 AND t.merchant_name = $2
         ORDER BY t.date DESC
         LIMIT 50`,
        [id, merchantName]
      );
      const rows = res.rows.map(r => ({
        ...r,
        amount: parseFloat(r.amount),
        merchantName: cleanSpacedHebrew(r.merchantName),
        description: cleanSpacedHebrew(r.description),
        userDescription: cleanSpacedHebrew(r.userDescription),
      }));
      return reply.send({ success: true, data: rows });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // GET /api/v2/transactions/tma/:id/splits - Get splits
  fastify.get('/tma/:id/splits', async (request, reply) => {
    const isTgAuthorized = await validateTelegramAccess(request, reply);
    if (!isTgAuthorized) return;

    const { id } = request.params;
    const token = request.headers['x-tma-token'];
    if (!verifyTmaToken(token, id)) return reply.code(401).send({ error: 'Unauthorized' });

    try {
      const res = await pool.query(
        `SELECT id, category, amount, description FROM transaction_splits WHERE transaction_id = $1 ORDER BY id ASC`,
        [id]
      );
      const splits = res.rows.map(s => ({ ...s, amount: parseFloat(s.amount) }));
      return reply.send({ success: true, data: splits });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // PUT /api/v2/transactions/tma/:id/splits - Save splits
  fastify.put('/tma/:id/splits', async (request, reply) => {
    const isTgAuthorized = await validateTelegramAccess(request, reply);
    if (!isTgAuthorized) return;

    const { id } = request.params;
    const token = request.headers['x-tma-token'];
    if (!verifyTmaToken(token, id)) return reply.code(401).send({ error: 'Unauthorized' });

    const { splits } = request.body || {};
    if (!Array.isArray(splits) || splits.length === 0) {
      return reply.code(400).send({ error: 'At least one split required', message: 'נדרש לפחות פיצול אחד' });
    }

    const txRes = await pool.query('SELECT amount, category, description FROM transactions WHERE id = $1', [id]);
    if (txRes.rows.length === 0) return reply.code(404).send({ error: 'Not Found', message: 'התנועה לא נמצאה' });

    const rawParentAmount = parseFloat(txRes.rows[0].amount);
    const parentAmount = Math.abs(rawParentAmount);
    let splitsList = splits.map((s) => ({
      amount: Math.abs(parseFloat(s.amount) || 0),
      category: s.category || txRes.rows[0].category || 'אחר / שונות',
      description: s.description || null,
    }));
    const splitsTotal = splitsList.reduce((acc, s) => acc + s.amount, 0);

    if (splitsTotal > parentAmount + 0.01) {
      return reply.code(400).send({
        error: `סכום הפיצולים (${splitsTotal.toFixed(2)} ₪) אינו יכול לעלות על סכום התנועה (${parentAmount.toFixed(2)} ₪)`,
        message: `סכום הפיצולים (${splitsTotal.toFixed(2)} ₪) אינו יכול לעלות על סכום התנועה (${parentAmount.toFixed(2)} ₪)`,
      });
    }

    const remainder = parentAmount - splitsTotal;
    if (remainder > 0.01) {
      splitsList.push({
        amount: Math.round(remainder * 100) / 100,
        category: txRes.rows[0].category || 'כללי',
        description: 'יתרת תנועה',
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM transaction_splits WHERE transaction_id = $1', [id]);

      for (const s of splitsList) {
        const signedSplitAmount = rawParentAmount < 0 ? -Math.abs(s.amount) : Math.abs(s.amount);
        await client.query(
          `INSERT INTO transaction_splits (transaction_id, amount, category, description) VALUES ($1, $2, $3, $4)`,
          [id, signedSplitAmount, s.category, s.description || null]
        );
      }
      await client.query('UPDATE transactions SET is_split = true WHERE id = $1', [id]);
      await client.query('COMMIT');

      return reply.send({ success: true, message: 'הפיצולים נשמרו בהצלחה' });
    } catch (err) {
      await client.query('ROLLBACK');
      fastify.log.error(err, 'Failed to save TMA splits');
      return reply.code(500).send({ error: 'Database error' });
    } finally {
      client.release();
    }
  });

  // GET /api/v2/transactions/tma/:id/notes - Get notes
  fastify.get('/tma/:id/notes', async (request, reply) => {
    const isTgAuthorized = await validateTelegramAccess(request, reply);
    if (!isTgAuthorized) return;

    const { id } = request.params;
    const token = request.headers['x-tma-token'];
    if (!verifyTmaToken(token, id)) return reply.code(401).send({ error: 'Unauthorized' });

    try {
      const res = await pool.query(
        `SELECT id, note, created_at AS "createdAt" FROM transaction_notes WHERE transaction_id = $1 ORDER BY created_at DESC`,
        [id]
      );
      return reply.send({ success: true, data: res.rows });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // POST /api/v2/transactions/tma/:id/notes - Add note
  fastify.post('/tma/:id/notes', async (request, reply) => {
    const isTgAuthorized = await validateTelegramAccess(request, reply);
    if (!isTgAuthorized) return;

    const { id } = request.params;
    const token = request.headers['x-tma-token'];
    if (!verifyTmaToken(token, id)) return reply.code(401).send({ error: 'Unauthorized' });

    const { note } = request.body || {};
    if (!note || !note.trim()) return reply.code(400).send({ error: 'תוכן הערה נדרש' });

    try {
      const res = await pool.query(
        `INSERT INTO transaction_notes (transaction_id, note) VALUES ($1, $2) RETURNING id, note, created_at AS "createdAt"`,
        [id, note.trim()]
      );
      return reply.code(201).send({ success: true, data: res.rows[0] });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // DELETE /api/v2/transactions/tma/:id/notes/:noteId - Delete note
  fastify.delete('/tma/:id/notes/:noteId', async (request, reply) => {
    const isTgAuthorized = await validateTelegramAccess(request, reply);
    if (!isTgAuthorized) return;

    const { id, noteId } = request.params;
    const token = request.headers['x-tma-token'];
    if (!verifyTmaToken(token, id)) return reply.code(401).send({ error: 'Unauthorized' });

    try {
      await pool.query(`DELETE FROM transaction_notes WHERE id = $1 AND transaction_id = $2`, [noteId, id]);
      return reply.send({ success: true });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // GET /api/v2/transactions/tma/:id/links - Get linked transactions
  fastify.get('/tma/:id/links', async (request, reply) => {
    const isTgAuthorized = await validateTelegramAccess(request, reply);
    if (!isTgAuthorized) return;

    const { id } = request.params;
    const token = request.headers['x-tma-token'];
    if (!verifyTmaToken(token, id)) return reply.code(401).send({ error: 'Unauthorized' });

    await autoLinkInstallmentTransactions(pool, id).catch(() => {});

    try {
      const query = `
        SELECT 
          tl.id AS "linkId",
          tl.link_type AS "linkType",
          tl.note AS "linkNote",
          tl.created_at AS "linkedAt",
          t.id AS "id",
          t.date AS "date",
          t.amount AS "amount",
          t.currency AS "currency",
          t.merchant_name AS "merchantName",
          t.description AS "description",
          t.user_description AS "userDescription",
          t.category AS "category",
          b.display_name AS "accountDisplayName",
          b.bank_company AS "bankCompany"
        FROM transaction_links tl
        JOIN transactions t ON (
          (tl.transaction_id_a = $1 AND tl.transaction_id_b = t.id)
          OR
          (tl.transaction_id_b = $1 AND tl.transaction_id_a = t.id)
        )
        JOIN bank_accounts b ON t.account_id = b.id
        WHERE tl.transaction_id_a = $1 OR tl.transaction_id_b = $1
        ORDER BY t.date DESC
      `;
      const res = await pool.query(query, [id]);
      const data = res.rows.map(r => ({
        ...r,
        amount: parseFloat(r.amount),
        merchantName: cleanSpacedHebrew(r.merchantName),
        description: cleanSpacedHebrew(r.description),
        userDescription: cleanSpacedHebrew(r.userDescription),
      }));
      return reply.send({ success: true, data });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // POST /api/v2/transactions/tma/:id/links - Link this transaction to another
  fastify.post('/tma/:id/links', async (request, reply) => {
    const isTgAuthorized = await validateTelegramAccess(request, reply);
    if (!isTgAuthorized) return;

    const { id } = request.params;
    const token = request.headers['x-tma-token'];
    if (!verifyTmaToken(token, id)) return reply.code(401).send({ error: 'Unauthorized' });

    const { targetTransactionId, linkType = 'related', note = null } = request.body || {};
    if (!targetTransactionId || targetTransactionId === id) {
      return reply.code(400).send({ error: 'מזהה תנועה לקישור אינו תקין' });
    }

    try {
      const [idA, idB] = id < targetTransactionId ? [id, targetTransactionId] : [targetTransactionId, id];
      const res = await pool.query(
        `INSERT INTO transaction_links (transaction_id_a, transaction_id_b, link_type, note)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (transaction_id_a, transaction_id_b)
         DO UPDATE SET link_type = EXCLUDED.link_type, note = EXCLUDED.note
         RETURNING id AS "linkId", link_type AS "linkType", note`,
        [idA, idB, linkType, note]
      );
      return reply.code(201).send({ success: true, data: res.rows[0] });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // DELETE /api/v2/transactions/tma/:id/links/:linkId - Delete link
  fastify.delete('/tma/:id/links/:linkId', async (request, reply) => {
    const isTgAuthorized = await validateTelegramAccess(request, reply);
    if (!isTgAuthorized) return;

    const { id, linkId } = request.params;
    const token = request.headers['x-tma-token'];
    if (!verifyTmaToken(token, id)) return reply.code(401).send({ error: 'Unauthorized' });

    try {
      await pool.query(
        `DELETE FROM transaction_links WHERE id = $1 AND (transaction_id_a = $2 OR transaction_id_b = $2)`,
        [linkId, id]
      );
      return reply.send({ success: true });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // GET /api/v2/transactions/tma/:id/linkable - Search and list transactions available to link
  fastify.get('/tma/:id/linkable', async (request, reply) => {
    const isTgAuthorized = await validateTelegramAccess(request, reply);
    if (!isTgAuthorized) return;

    const { id } = request.params;
    const token = request.headers['x-tma-token'];
    if (!verifyTmaToken(token, id)) return reply.code(401).send({ error: 'Unauthorized' });

    const search = request.query?.search?.trim() || '';
    const limit = Math.min(parseInt(request.query?.limit || '50', 10), 100);

    try {
      let query;
      let values;
      if (search) {
        query = `
          SELECT 
            t.id,
            t.date,
            t.amount,
            t.currency,
            t.merchant_name AS "merchantName",
            t.description,
            t.user_description AS "userDescription",
            t.category,
            b.display_name AS "accountDisplayName",
            b.bank_company AS "bankCompany"
          FROM transactions t
          JOIN bank_accounts b ON t.account_id = b.id
          WHERE t.id != $1
            AND (
              t.merchant_name ILIKE $2
              OR t.description ILIKE $2
              OR t.user_description ILIKE $2
              OR t.category ILIKE $2
              OR CAST(t.amount AS TEXT) ILIKE $2
            )
          ORDER BY t.date DESC, t.id DESC
          LIMIT $3
        `;
        values = [id, `%${search}%`, limit];
      } else {
        query = `
          SELECT 
            t.id,
            t.date,
            t.amount,
            t.currency,
            t.merchant_name AS "merchantName",
            t.description,
            t.user_description AS "userDescription",
            t.category,
            b.display_name AS "accountDisplayName",
            b.bank_company AS "bankCompany"
          FROM transactions t
          JOIN bank_accounts b ON t.account_id = b.id
          WHERE t.id != $1
          ORDER BY t.date DESC, t.id DESC
          LIMIT $2
        `;
        values = [id, limit];
      }

      const res = await pool.query(query, values);
      const data = res.rows.map(r => ({
        ...r,
        amount: parseFloat(r.amount),
        merchantName: cleanSpacedHebrew(r.merchantName),
        description: cleanSpacedHebrew(r.description),
        userDescription: cleanSpacedHebrew(r.userDescription),
      }));
      return reply.send({ success: true, data });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // GET /api/v2/transactions/tma/:id/receipts - List receipts for transaction
  fastify.get('/tma/:id/receipts', async (request, reply) => {
    const isTgAuthorized = await validateTelegramAccess(request, reply);
    if (!isTgAuthorized) return;

    const { id } = request.params;
    const token = request.headers['x-tma-token'];
    if (!verifyTmaToken(token, id)) return reply.code(401).send({ error: 'Unauthorized' });

    try {
      const res = await pool.query(
        `SELECT id, transaction_id, file_path, file_name, file_type, file_size, source_url, 
                ai_analyzed, ai_provider, extracted_data, created_at
         FROM transaction_receipts
         WHERE transaction_id = $1
         ORDER BY created_at DESC`,
        [id]
      );
      return reply.send({ success: true, data: res.rows });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // POST /api/v2/transactions/tma/:id/receipts/url - Add digital receipt URL
  fastify.post('/tma/:id/receipts/url', async (request, reply) => {
    const isTgAuthorized = await validateTelegramAccess(request, reply);
    if (!isTgAuthorized) return;

    const { id } = request.params;
    const token = request.headers['x-tma-token'];
    if (!verifyTmaToken(token, id)) return reply.code(401).send({ error: 'Unauthorized' });

    const { url } = request.body || {};
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      return reply.code(400).send({ error: 'כתובת URL לא תקינה' });
    }

    try {
      let aiResult;
      try {
        aiResult = await analyzeReceiptUrl(url);
      } catch (err) {
        aiResult = { ai_analyzed: false, extracted_data: { vendor: null, total: null, items: [] } };
      }

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

      return reply.code(201).send({ success: true, data: insertRes.rows[0] });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // POST /api/v2/transactions/tma/:id/receipts/upload - Upload receipt file
  fastify.post('/tma/:id/receipts/upload', async (request, reply) => {
    const isTgAuthorized = await validateTelegramAccess(request, reply);
    if (!isTgAuthorized) return;

    const { id } = request.params;
    const token = request.headers['x-tma-token'];
    if (!verifyTmaToken(token, id)) return reply.code(401).send({ error: 'Unauthorized' });

    let data;
    try {
      data = await request.file();
    } catch (err) {
      return reply.code(400).send({ error: 'שגיאה בקריאת הקובץ', details: err.message });
    }
    if (!data) return reply.code(400).send({ error: 'לא נבחר קובץ' });

    const fileBuffer = await data.toBuffer();
    const originalName = data.filename || 'receipt.jpg';
    const mimeType = data.mimetype || 'image/jpeg';
    const fileSize = fileBuffer.length;

    if (fileSize > 15 * 1024 * 1024) {
      return reply.code(400).send({ error: 'גודל הקובץ חורג מ-15MB' });
    }

    const ext = path.extname(originalName) || (mimeType === 'application/pdf' ? '.pdf' : '.jpg');
    const storageFileName = `${id}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
    const storagePath = path.join(UPLOADS_DIR, storageFileName);

    try {
      fs.writeFileSync(storagePath, fileBuffer);
    } catch (err) {
      return reply.code(500).send({ error: 'שגיאה בשמירת הקובץ בדיסק' });
    }

    let aiResult = { ai_analyzed: false, extracted_data: { vendor: null, total: null, items: [] } };
    try {
      aiResult = await analyzeReceiptFile(storagePath, mimeType);
    } catch (aiErr) {
      fastify.log.warn(`TMA Receipt AI analysis error: ${aiErr.message}`);
    }

    try {
      const insertRes = await pool.query(
        `INSERT INTO transaction_receipts 
         (transaction_id, file_path, file_name, file_type, file_size, ai_analyzed, ai_provider, extracted_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, transaction_id, file_name, file_type, file_size, source_url, 
                   ai_analyzed, ai_provider, extracted_data, created_at`,
        [
          id,
          storageFileName,
          originalName,
          mimeType,
          fileSize,
          aiResult.ai_analyzed || false,
          aiResult.ai_provider || 'gemini',
          JSON.stringify(aiResult.extracted_data || {}),
        ]
      );
      return reply.code(201).send({ success: true, data: insertRes.rows[0] });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // DELETE /api/v2/transactions/tma/:id/receipts/:receiptId - Delete receipt
  fastify.delete('/tma/:id/receipts/:receiptId', async (request, reply) => {
    const isTgAuthorized = await validateTelegramAccess(request, reply);
    if (!isTgAuthorized) return;

    const { id, receiptId } = request.params;
    const token = request.headers['x-tma-token'];
    if (!verifyTmaToken(token, id)) return reply.code(401).send({ error: 'Unauthorized' });

    try {
      const res = await pool.query('SELECT file_path FROM transaction_receipts WHERE id = $1 AND transaction_id = $2', [receiptId, id]);
      if (res.rows.length === 0) return reply.code(404).send({ error: 'Receipt not found' });

      const filePath = res.rows[0].file_path;
      if (filePath) {
        const fullPath = path.join(UPLOADS_DIR, path.basename(filePath));
        if (fs.existsSync(fullPath)) {
          try { fs.unlinkSync(fullPath); } catch (_) {}
        }
      }

      await pool.query('DELETE FROM transaction_receipts WHERE id = $1 AND transaction_id = $2', [receiptId, id]);
      return reply.send({ success: true });
    } catch (err) {
      return reply.code(500).send({ error: 'Database error' });
    }
  });

  // GET /api/v2/transactions/tma/receipts/file/:filename - View receipt image in TMA
  fastify.get('/tma/receipts/file/:filename', async (request, reply) => {
    const { filename } = request.params;
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
}
