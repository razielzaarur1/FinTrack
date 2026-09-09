import { z } from 'zod';
import { pool } from '../db.js';
import { encryptCredentials, decryptCredentials } from '../crypto.js';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

// One-time non-blocking initialization check
let isInitialized = false;
async function preflightCheck() {
  if (isInitialized) return;
  try {
    // Fast idempotent user existence guarantee
    await pool.query(
      `INSERT INTO users (id, is_active)
       VALUES ($1, true)
       ON CONFLICT (id) DO NOTHING`,
      [DEFAULT_USER_ID]
    );
    isInitialized = true;
  } catch (err) {
    console.warn('[Accounts Preflight] User check non-critical warning:', err.message);
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
  // Pre-flight setup on route register
  preflightCheck().catch(() => {});

  // ──────────────────────────────────────────────────────────────────────────
  // GET /accounts/diagnostics - Comprehensive Live Health & Telemetry Check
  // ──────────────────────────────────────────────────────────────────────────
  fastify.get('/diagnostics', async (request, reply) => {
    const report = {
      timestamp: new Date().toISOString(),
      overallStatus: 'ok',
      checks: {},
    };

    // Check 1: PostgreSQL Ping & Latency
    const dbStart = Date.now();
    try {
      const pingRes = await pool.query('SELECT 1 AS ping, NOW() AS server_time, current_database() AS db_name');
      report.checks.database = {
        status: 'ok',
        latencyMs: Date.now() - dbStart,
        databaseName: pingRes.rows[0]?.db_name,
        serverTime: pingRes.rows[0]?.server_time,
      };
    } catch (err) {
      report.overallStatus = 'error';
      report.checks.database = {
        status: 'error',
        error: err.message,
        code: err.code,
      };
    }

    // Check 2: Default User Presence
    try {
      const userRes = await pool.query(
        'SELECT id, is_active FROM users WHERE id = $1',
        [DEFAULT_USER_ID]
      );
      report.checks.defaultUser = {
        status: userRes.rows.length > 0 ? 'ok' : 'missing',
        userId: DEFAULT_USER_ID,
      };
      if (userRes.rows.length === 0) {
        // Provision immediately
        await pool.query(
          'INSERT INTO users (id, is_active) VALUES ($1, true) ON CONFLICT (id) DO NOTHING',
          [DEFAULT_USER_ID]
        );
        report.checks.defaultUser.status = 'provisioned_now';
      }
    } catch (err) {
      report.overallStatus = 'error';
      report.checks.defaultUser = {
        status: 'error',
        error: err.message,
      };
    }

    // Check 3: bank_accounts Table & Columns Verification
    try {
      const colsRes = await pool.query(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_name = 'bank_accounts'
         ORDER BY ordinal_position`
      );
      const cols = colsRes.rows.map((r) => r.column_name);
      const requiredCols = ['id', 'user_id', 'bank_company', 'encrypted_credentials', 'billing_day', 'is_active', 'balance'];
      const missingCols = requiredCols.filter((c) => !cols.includes(c));

      report.checks.bankAccountsTable = {
        status: missingCols.length === 0 ? 'ok' : 'incomplete_schema',
        columnsPresent: cols,
        missingColumns: missingCols,
      };
      if (missingCols.length > 0) report.overallStatus = 'error';
    } catch (err) {
      report.overallStatus = 'error';
      report.checks.bankAccountsTable = {
        status: 'error',
        error: err.message,
      };
    }

    // Check 4: AES-256-GCM Native Crypto Engine Self-Test (Round-Trip)
    try {
      const testPayload = { test: true, timestamp: Date.now(), rand: Math.random() };
      const encrypted = encryptCredentials(testPayload);
      const decrypted = decryptCredentials(encrypted);

      const isValid = decrypted && decrypted.test === true && decrypted.rand === testPayload.rand;
      report.checks.cryptoEngine = {
        status: isValid ? 'ok' : 'mismatch',
        cipherFormat: encrypted.startsWith('enc:v1:') ? 'v1_authenticated_gcm' : 'legacy',
      };
      if (!isValid) report.overallStatus = 'error';
    } catch (err) {
      report.overallStatus = 'error';
      report.checks.cryptoEngine = {
        status: 'error',
        error: err.message,
      };
    }

    // Check 5: Scraper Service Reachability
    const scraperUrl = process.env.SCRAPER_URL || 'http://scraper-worker:3002';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const scrapePing = await fetch(`${scraperUrl}/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      report.checks.scraperService = {
        status: scrapePing.ok ? 'ok' : `http_${scrapePing.status}`,
        target: scraperUrl,
      };
    } catch (err) {
      report.checks.scraperService = {
        status: 'unreachable_or_offline',
        target: scraperUrl,
        notice: 'Non-fatal: Account creation remains operational without active scraper',
      };
    }

    const statusCode = report.overallStatus === 'ok' ? 200 : 503;
    return reply.status(statusCode).send(report);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /accounts - List active accounts for user
  // ──────────────────────────────────────────────────────────────────────────
  fastify.get('/', async (request, reply) => {
    try {
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
             WHEN bank_company IN ('max', 'cal', 'visaCal', 'isracard', 'amex') THEN 'credit'
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
            const { nextBillingDate, prevBillingDate } = getBillingDates(acc.billingDay);
            const nextStr = formatLocalYMD(nextBillingDate);
            const prevStr = formatLocalYMD(prevBillingDate);

            let upcomingCharge = 0;
            try {
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
              upcomingCharge = upcomingRes.rows[0]?.charge || 0;
            } catch (_) {
              upcomingCharge = 0;
            }
            if (upcomingCharge === 0 && Math.abs(acc.balance) > 0) {
              upcomingCharge = acc.balance;
            }

            let periodSpend = 0;
            try {
              const spendRes = await pool.query(
                `SELECT -COALESCE(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END), 0)::FLOAT AS "spend"
                 FROM transactions
                 WHERE account_id = $1
                   AND is_ignored = false
                   AND date > $2::date AND date <= $3::date`,
                [acc.id, prevStr, nextStr]
              );
              periodSpend = spendRes.rows[0]?.spend || 0;
            } catch (_) {
              periodSpend = 0;
            }

            let bankDebit = null;
            try {
              const bankKeywords = {
                max: ['מקס', 'לאומי קארד', 'max'],
                isracard: ['ישראכרט', 'isracard'],
                cal: ['ויזה כאל', 'כאל', 'cal'],
                visaCal: ['ויזה כאל', 'כאל', 'cal'],
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
                   AND b.bank_company NOT IN ('max', 'cal', 'visaCal', 'isracard', 'amex', 'wallet')
                   AND t.amount < 0
                   AND (${keywordConditions})
                   AND t.date >= ($2::date - INTERVAL '10 days')
                   AND t.date <= ($2::date + INTERVAL '15 days')
                 ORDER BY t.date DESC
                 LIMIT 1`,
                [DEFAULT_USER_ID, prevStr, ...bankKeywords]
              );

              bankDebit = debitRes.rows[0]
                ? {
                    date: debitRes.rows[0].date,
                    amount: debitRes.rows[0].amount,
                    description: debitRes.rows[0].description || debitRes.rows[0].merchant_name,
                  }
                : null;
            } catch (_) {
              bankDebit = null;
            }

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
      try {
        const fallbackRes = await pool.query(
          `SELECT id, user_id AS "userId", bank_company AS "bankCompany", display_name AS "displayName", balance, is_active AS "isActive"
           FROM bank_accounts
           WHERE user_id = $1 AND is_active = true`,
          [DEFAULT_USER_ID]
        );
        return reply.code(200).send(fallbackRes.rows);
      } catch (_) {
        return reply.code(200).send([]);
      }
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // POST /accounts - Controlled 6-Stage Account Creation Pipeline
  // ──────────────────────────────────────────────────────────────────────────
  fastify.post('/', async (request, reply) => {
    // ── STAGE 1: INPUT VALIDATION ───────────────────────────────────────────
    const parseResult = createAccountSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        stage: 'STAGE_1_INPUT_VALIDATION',
        error: 'שגיאת אימות נתונים: שדות חסרים או לא תקינים',
        details: parseResult.error.issues,
      });
    }

    const { bankCompany, credentials, displayName, billingDay } = parseResult.data;

    // Validate credentials for non-wallet institutions
    if (bankCompany !== 'wallet') {
      const hasCreds = credentials && typeof credentials === 'object' && Object.keys(credentials).length > 0;
      if (!hasCreds) {
        return reply.status(400).send({
          success: false,
          stage: 'STAGE_1_INPUT_VALIDATION',
          error: 'יש להזין את פרטי ההתחברות עבור המוסד שנבחר',
          details: { bankCompany, fieldsProvided: Object.keys(credentials || {}) },
        });
      }
    }

    // ── STAGE 2: DATABASE CONNECTIVITY CHECK ────────────────────────────────
    try {
      await pool.query('SELECT 1');
    } catch (dbPingErr) {
      fastify.log.error({ err: dbPingErr }, 'Database connectivity pre-flight failed');
      return reply.status(503).send({
        success: false,
        stage: 'STAGE_2_DB_PREFLIGHT',
        error: 'מסד הנתונים אינו זמין כרגע. אנא נסה שוב בעוד מספר רגעים.',
        details: dbPingErr.message,
        sqlCode: dbPingErr.code,
      });
    }

    // ── STAGE 3: USER VERIFICATION & AUTO-PROVISIONING ───────────────────────
    try {
      await pool.query(
        `INSERT INTO users (id, is_active)
         VALUES ($1, true)
         ON CONFLICT (id) DO NOTHING`,
        [DEFAULT_USER_ID]
      );
    } catch (userErr) {
      fastify.log.error({ err: userErr }, 'User check/provisioning failed');
      return reply.status(500).send({
        success: false,
        stage: 'STAGE_3_USER_PROVISION',
        error: 'שגיאה בווידוא משתמש המערכת',
        details: userErr.message,
        sqlCode: userErr.code,
      });
    }

    // ── STAGE 4: AES-256-GCM CREDENTIAL ENCRYPTION & SELF-TEST ──────────────
    let ciphertext;
    try {
      const credsToEncrypt = (credentials && Object.keys(credentials).length > 0)
        ? credentials
        : { type: bankCompany };

      ciphertext = encryptCredentials(credsToEncrypt);

      // Verify encryption integrity by immediately decrypting
      const decryptedVerification = decryptCredentials(ciphertext);
      if (!decryptedVerification) {
        throw new Error('Encryption self-test verification returned empty result');
      }
    } catch (cryptoErr) {
      fastify.log.error({ err: cryptoErr }, 'Credential encryption failed');
      return reply.status(500).send({
        success: false,
        stage: 'STAGE_4_ENCRYPTION_ENGINE',
        error: 'שגיאה במנוע ההצפנה המאובטח AES-256-GCM',
        details: cryptoErr.message,
      });
    }

    // ── STAGE 5: DATABASE INSERTION ─────────────────────────────────────────
    let newAccount;
    try {
      const insertResult = await pool.query(
        `INSERT INTO bank_accounts (
           user_id,
           bank_company,
           encrypted_credentials,
           vault_key_version,
           display_name,
           billing_day,
           balance,
           is_active,
           created_at
         )
         VALUES ($1, $2, $3, 1, $4, $5, 0.00, true, NOW())
         RETURNING
           id,
           user_id AS "userId",
           bank_company AS "bankCompany",
           display_name AS "displayName",
           billing_day AS "billingDay",
           balance,
           is_active AS "isActive",
           created_at AS "createdAt"`,
        [
          DEFAULT_USER_ID,
          bankCompany,
          ciphertext,
          displayName ? displayName.trim() : null,
          billingDay || 10,
        ]
      );

      if (!insertResult.rows || insertResult.rows.length === 0) {
        throw new Error('Insert completed but no record returned');
      }

      newAccount = insertResult.rows[0];
    } catch (insertErr) {
      fastify.log.error(
        {
          err: insertErr,
          bankCompany,
          sqlCode: insertErr.code,
          sqlDetail: insertErr.detail,
          sqlConstraint: insertErr.constraint,
        },
        'Account insertion into database failed'
      );

      return reply.status(500).send({
        success: false,
        stage: 'STAGE_5_DB_INSERT',
        error: `שגיאה בשמירת החשבון במסד הנתונים: ${insertErr.message}`,
        details: insertErr.message,
        sqlCode: insertErr.code,
        sqlDetail: insertErr.detail,
        sqlTable: insertErr.table,
        sqlConstraint: insertErr.constraint,
      });
    }

    // ── STAGE 6: ASYNC SCRAPER TRIGGER (NON-BLOCKING) ───────────────────────
    if (bankCompany !== 'wallet') {
      const scraperUrl = process.env.SCRAPER_URL || 'http://scraper-worker:3002';
      setTimeout(async () => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);
          await fetch(`${scraperUrl}/scrape/${newAccount.id}`, {
            method: 'POST',
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          fastify.log.info({ accountId: newAccount.id }, 'Initial scrape trigger initiated asynchronously');
        } catch (scraperErr) {
          fastify.log.warn(
            { accountId: newAccount.id, err: scraperErr.message },
            'Initial scrape trigger background dispatch caught (non-critical)'
          );
        }
      }, 300);
    }

    // ── STAGE 7: SUCCESS RESPONSE ───────────────────────────────────────────
    fastify.log.info({ accountId: newAccount.id, bankCompany }, 'Account successfully created');
    return reply.status(201).send({
      success: true,
      stage: 'STAGE_7_COMPLETE',
      ...newAccount,
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PATCH /accounts/:id - Update account displayName, billingDay, balance
  // ──────────────────────────────────────────────────────────────────────────
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params;
    const parseResult = updateAccountSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        stage: 'VALIDATION',
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
        return reply.status(404).send({ success: false, error: 'Account not found' });
      }

      fastify.log.info({ accountId: id, displayName, billingDay }, 'Account updated successfully');
      return reply.status(200).send({
        success: true,
        message: 'Account updated successfully',
        account: result.rows[0],
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to update account');
      return reply.status(500).send({
        success: false,
        stage: 'DB_UPDATE',
        error: err.message,
        sqlCode: err.code,
      });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE /accounts/:id - Soft delete account (is_active = false)
  // ──────────────────────────────────────────────────────────────────────────
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
        return reply.status(404).send({ success: false, error: 'Account not found' });
      }

      return reply.status(200).send({
        success: true,
        message: 'Account deactivated successfully',
        account: result.rows[0],
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to delete account');
      return reply.status(500).send({
        success: false,
        stage: 'DB_DELETE',
        error: err.message,
        sqlCode: err.code,
      });
    }
  });
}
