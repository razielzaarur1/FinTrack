import { z } from 'zod';
import { pool } from '../db.js';
import { encryptCredentials } from '../crypto.js';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

async function ensureAccountsSchema() {
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

    // Ensure default user exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          is_active BOOLEAN NOT NULL DEFAULT true,
          password_hash TEXT,
          passcode_salt TEXT
      );
      INSERT INTO users (id, is_active)
      VALUES ('00000000-0000-0000-0000-000000000001', true)
      ON CONFLICT (id) DO NOTHING;
    `);

    // Ensure bank_accounts table and all columns exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bank_accounts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          bank_company VARCHAR(50) NOT NULL,
          encrypted_credentials TEXT NOT NULL,
          vault_key_version INT NOT NULL DEFAULT 1,
          display_name VARCHAR(100),
          account_number VARCHAR(50),
          balance NUMERIC(14, 2) DEFAULT 0.00,
          is_active BOOLEAN NOT NULL DEFAULT true,
          last_scraped_at TIMESTAMPTZ,
          last_scrape_error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS billing_day INT DEFAULT 10;
      ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS encrypted_credentials TEXT;
      ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS vault_key_version INT DEFAULT 1;
      ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);
      ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS account_number VARCHAR(50);
      ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS balance NUMERIC(14, 2) DEFAULT 0.00;
      ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    `);
  } catch (err) {
    console.warn('[Accounts] ensureAccountsSchema warning:', err.message);
  }
}

const createAccountSchema = z.object({
  bankCompany: z.string().min(1, 'bankCompany is required'),
  displayName: z.string().optional().nullable(),
  billingDay: z.coerce.number().int().min(1).max(31).optional().default(10),
  credentials: z.record(z.any()).optional().default({}),
});

const updateAccountSchema = z.object({
  displayName: z.string().optional(),
  billingDay: z.coerce.number().int().min(1).max(31).optional(),
  balance: z.coerce.number().optional(),
});

function formatLocalYMD(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getBillingDates(billingDay = 10) {
  const now = new Date();
  const curDay = now.getDate();
  const curMonth = now.getMonth();
  const curYear = now.getFullYear();

  const day = Math.min(Math.max(parseInt(billingDay, 10) || 10, 1), 28);

  let nextBillingDate, prevBillingDate;
  if (curDay < day) {
    nextBillingDate = new Date(curYear, curMonth, day);
    prevBillingDate = new Date(curYear, curMonth - 1, day);
  } else {
    nextBillingDate = new Date(curYear, curMonth + 1, day);
    prevBillingDate = new Date(curYear, curMonth, day);
  }

  const prevPrevBillingDate = new Date(prevBillingDate.getFullYear(), prevBillingDate.getMonth() - 1, day);

  return { nextBillingDate, prevBillingDate, prevPrevBillingDate };
}

export default async function accountsRoutes(fastify, options) {
  // GET /accounts - List active accounts for user
  fastify.get('/', async (request, reply) => {
    try {
      await ensureAccountsSchema();

      const result = await pool.query(
        `SELECT
           id,
           user_id AS "userId",
           bank_company AS "bankCompany",
           display_name AS "displayName",
           account_number AS "accountNumber",
           COALESCE(billing_day, 10)::INT AS "billingDay",
           COALESCE(balance, 0)::FLOAT AS balance,
           'ILS' AS currency,
           is_active AS "isActive",
           last_scraped_at AS "lastScrapedAt",
           last_scrape_error AS "lastScrapeError",
           CASE
             WHEN last_scrape_error IS NOT NULL THEN 'error'
             WHEN last_scraped_at IS NOT NULL THEN 'success'
             ELSE 'idle'
           END AS "scrapeStatus",
           CASE
             WHEN bank_company = 'wallet' THEN 'wallet'
             WHEN bank_company IN ('max', 'cal', 'isracard', 'amex') THEN 'credit'
             WHEN bank_company LIKE '%inv%' OR bank_company LIKE '%saving%' THEN 'savings'
             ELSE 'checking'
           END AS "accountType",
           created_at AS "createdAt"
         FROM bank_accounts
         WHERE user_id = $1 AND is_active = true
         ORDER BY created_at DESC`,
        [DEFAULT_USER_ID]
      );

      // Compute dynamic upcoming cycle charge, period spend, and matching bank debits
      const accounts = await Promise.all(
        result.rows.map(async (acc) => {
          if (acc.accountType === 'credit') {
            const { nextBillingDate, prevBillingDate, prevPrevBillingDate } = getBillingDates(acc.billingDay);
            const nextStr = formatLocalYMD(nextBillingDate);
            const prevStr = formatLocalYMD(prevBillingDate);
            const prevPrevStr = formatLocalYMD(prevPrevBillingDate);

            // 1. Upcoming Charge (transactions scheduled for next billing date or within upcoming cycle)
            const upcomingRes = await pool.query(
              `SELECT -COALESCE(SUM(amount), 0)::FLOAT AS "charge"
               FROM transactions
               WHERE account_id = $1
                 AND is_ignored = false
                 AND (
                   (processed_date IS NOT NULL AND processed_date > $3::date AND processed_date <= $2::date)
                   OR (processed_date = $2::date)
                   OR (date > $3::date AND date <= $2::date)
                 )`,
              [acc.id, nextStr, prevStr]
            );

            let upcomingCharge = upcomingRes.rows[0]?.charge || 0;
            // Fallback to scraped balance if transactions in this cycle sum to 0 but account balance is recorded
            if (upcomingCharge === 0 && Math.abs(acc.balance) > 0) {
              upcomingCharge = acc.balance;
            }

            // 2. Period Spend (total expenses spent between previous billing date and next billing date)
            const spendRes = await pool.query(
              `SELECT -COALESCE(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END), 0)::FLOAT AS "spend"
               FROM transactions
               WHERE account_id = $1
                 AND is_ignored = false
                 AND date > $2::date AND date <= $3::date`,
              [acc.id, prevStr, nextStr]
            );

            let periodSpend = spendRes.rows[0]?.spend || 0;
            if (periodSpend === 0) {
              const mSpendRes = await pool.query(
                `SELECT -COALESCE(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END), 0)::FLOAT AS "spend"
                 FROM transactions
                 WHERE account_id = $1
                   AND is_ignored = false
                   AND date >= DATE_TRUNC('month', CURRENT_DATE)`,
                [acc.id]
              );
              periodSpend = mSpendRes.rows[0]?.spend || 0;
            }

            // 3. Search for actual credit card bank debit in user's checking account
            const bankKeywords = {
              max: ['מקס', 'לאומי קארד', 'max'],
              isracard: ['ישראכרט', 'isracard'],
              cal: ['ויזה כאל', 'כאל', 'cal'],
              amex: ['אמריקן אקספרס', 'amex'],
            }[acc.bankCompany] || [acc.bankCompany];

            const keywordConditions = bankKeywords
              .map((_, i) => `(LOWER(t.merchant_name) LIKE '%' || $${i + 3} || '%' OR LOWER(t.description) LIKE '%' || $${i + 3} || '%')`)
              .join(' OR ');

            const debitRes = await pool.query(
              `SELECT t.date, ABS(t.amount)::FLOAT AS amount, t.description, t.merchant_name
               FROM transactions t
               JOIN bank_accounts b ON t.account_id = b.id
               WHERE b.user_id = $1
                 AND b.bank_company NOT IN ('max', 'cal', 'isracard', 'amex', 'wallet')
                 AND t.amount < 0
                 AND (${keywordConditions})
                 AND t.date >= ($2::date - INTERVAL '10 days')
                 AND t.date <= ($2::date + INTERVAL '15 days')
               ORDER BY t.date DESC
               LIMIT 1`,
              [DEFAULT_USER_ID, prevStr, ...bankKeywords]
            );

            const bankDebit = debitRes.rows[0]
              ? {
                  date: debitRes.rows[0].date,
                  amount: debitRes.rows[0].amount,
                  description: debitRes.rows[0].description || debitRes.rows[0].merchant_name,
                }
              : null;

            return {
              ...acc,
              balance: upcomingCharge,
              upcomingCharge,
              periodSpend,
              bankDebit,
              nextBillingDate: nextStr,
              prevBillingDate: prevStr,
            };
          }

          return {
            ...acc,
            upcomingCharge: acc.balance,
          };
        })
      );

      return reply.code(200).send(accounts);
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch accounts');
      return reply.code(500).send({ error: 'Internal Server Error', message: err.message });
    }
  });

  // POST /accounts - Create a new account with encrypted credentials
  fastify.post('/', async (request, reply) => {
    const parseResult = createAccountSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'שגיאת אימות נתונים',
        details: parseResult.error.issues,
      });
    }

    const { bankCompany, credentials, displayName, billingDay } = parseResult.data;

    // Validate credentials for non-wallet institutions
    if (bankCompany !== 'wallet' && (!credentials || Object.keys(credentials).length === 0)) {
      return reply.code(400).send({
        error: 'יש להזין את פרטי ההתחברות עבור המוסד שנבחר',
      });
    }

    try {
      await ensureAccountsSchema();

      // ── Encrypt credentials with AES-256-GCM ──
      const credsToEncrypt = (credentials && Object.keys(credentials).length > 0)
        ? credentials
        : { type: bankCompany };
      const ciphertext = encryptCredentials(credsToEncrypt);

      let result;
      try {
        result = await pool.query(
          `INSERT INTO bank_accounts (user_id, bank_company, encrypted_credentials, display_name, billing_day, is_active, balance, created_at)
           VALUES ($1, $2, $3, $4, $5, true, 0.00, NOW())
           RETURNING id, user_id AS "userId", bank_company AS "bankCompany", display_name AS "displayName", billing_day AS "billingDay", is_active AS "isActive", created_at AS "createdAt"`,
          [DEFAULT_USER_ID, bankCompany, ciphertext, displayName || null, billingDay || 10]
        );
      } catch (insertErr) {
        fastify.log.warn({ err: insertErr.message }, 'First account insert attempt failed, retrying after ensureAccountsSchema');
        await ensureAccountsSchema();
        result = await pool.query(
          `INSERT INTO bank_accounts (user_id, bank_company, encrypted_credentials, display_name, billing_day, is_active, balance, created_at)
           VALUES ($1, $2, $3, $4, $5, true, 0.00, NOW())
           RETURNING id, user_id AS "userId", bank_company AS "bankCompany", display_name AS "displayName", billing_day AS "billingDay", is_active AS "isActive", created_at AS "createdAt"`,
          [DEFAULT_USER_ID, bankCompany, ciphertext, displayName || null, billingDay || 10]
        );
      }

      fastify.log.info({ accountId: result.rows[0].id, bankCompany }, 'Bank account created and credentials encrypted');
      return reply.code(201).send(result.rows[0]);
    } catch (err) {
      fastify.log.error(err, 'Failed to create account');
      return reply.code(400).send({
        error: 'שגיאה ביצירת החשבון: ' + (err.message || 'שגיאת מערכת'),
        message: err.message,
      });
    }
  });

  // PATCH /accounts/:id - Update account displayName and billingDay
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params;
    const parseResult = updateAccountSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Validation Error',
        details: parseResult.error.issues,
      });
    }

    const { displayName, billingDay, balance } = parseResult.data;
    try {
      const result = await pool.query(
        `UPDATE bank_accounts
         SET display_name = COALESCE($1, display_name),
             billing_day = COALESCE($2, billing_day),
             balance = COALESCE($3, balance)
         WHERE id = $4 AND user_id = $5
         RETURNING id, user_id, bank_company, display_name, billing_day AS "billingDay", balance, is_active`,
        [
          displayName !== undefined ? displayName : null,
          billingDay !== undefined ? billingDay : null,
          balance !== undefined ? balance : null,
          id,
          DEFAULT_USER_ID,
        ]
      );

      if (result.rowCount === 0) {
        return reply.code(404).send({ error: 'Not Found', message: 'Account not found' });
      }

      fastify.log.info({ accountId: id, displayName, billingDay }, 'Account updated successfully');
      return reply.code(200).send({
        message: 'Account updated successfully',
        account: result.rows[0],
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to update account');
      return reply.code(500).send({ error: 'Internal Server Error', message: err.message });
    }
  });

  // DELETE /accounts/:id - Soft delete account (is_active = false)
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const result = await pool.query(
        `UPDATE bank_accounts
         SET is_active = false
         WHERE id = $1 AND user_id = $2
         RETURNING id, user_id, bank_company, display_name, is_active`,
        [id, DEFAULT_USER_ID]
      );

      if (result.rowCount === 0) {
        return reply.code(404).send({ error: 'Not Found', message: 'Account not found' });
      }

      return reply.code(200).send({
        message: 'Account deactivated successfully',
        account: result.rows[0],
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to delete account');
      return reply.code(500).send({ error: 'Internal Server Error', message: err.message });
    }
  });
}
