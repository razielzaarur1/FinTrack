import fs from 'node:fs';
import pg from 'pg';
import israeliBankScrapersPkg from 'israeli-bank-scrapers';
import { logger } from './logger.js';
import { decryptCredentials } from './crypto.js';
import { requestOtp } from './notifier-client.js';

// Support both ESM and CJS exports from israeli-bank-scrapers
const scrapersModule =
  (israeliBankScrapersPkg && israeliBankScrapersPkg.default)
    ? israeliBankScrapersPkg.default
    : israeliBankScrapersPkg;

const createScraper =
  scrapersModule?.createScraper ||
  (typeof scrapersModule === 'function' ? scrapersModule : null) ||
  israeliBankScrapersPkg?.createScraper;

const SCRAPER_EVENT_TYPES =
  scrapersModule?.SCRAPER_EVENT_TYPES ||
  scrapersModule?.SCRAPER_EVENTS ||
  israeliBankScrapersPkg?.SCRAPER_EVENT_TYPES ||
  israeliBankScrapersPkg?.SCRAPER_EVENTS ||
  {};

const { Pool } = pg;

function getDbPassword() {
  const passwordFile = process.env.DB_PASSWORD_FILE || '/run/secrets/scraper_db_password';
  if (passwordFile && fs.existsSync(passwordFile)) {
    try {
      const content = fs.readFileSync(passwordFile, 'utf8').trim();
      if (content) return content;
    } catch (err) {
      logger.warn({ err, passwordFile }, 'Failed to read DB password file');
    }
  }
  return process.env.DB_PASSWORD || 'postgres';
}

export function createDbPool() {
  return new Pool({
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'finance',
    user: process.env.DB_USER || 'finance_admin',
    password: getDbPassword(),
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
  });
}

const CREDIT_INSTITUTIONS = new Set([
  'max',
  'visacal',
  'cal',
  'isracard',
  'amex',
  'americanexpress',
  'beyhadbishvilha',
  'behatsdaa',
]);

export function isCreditInstitution(bankCompany) {
  if (!bankCompany) return false;
  return CREDIT_INSTITUTIONS.has(String(bankCompany).toLowerCase());
}

/**
 * Calculates effective account balance.
 * For credit cards with 0/null reported balance, sums the current month's transactions
 * to represent the expected monthly billing charge.
 */
export function calculateEffectiveBalance(card, bankCompany) {
  const isCredit = isCreditInstitution(bankCompany);

  // If the scraper reported a non-zero balance:
  if (typeof card?.balance === 'number' && card.balance !== 0) {
    return isCredit ? Math.abs(card.balance) : card.balance;
  }

  // If balance is 0 or null for credit cards, compute monthly billing amount
  const txns = Array.isArray(card?.txns) ? card.txns : [];
  if (txns.length > 0 && isCredit) {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();

    let monthlyCharges = 0;
    for (const tx of txns) {
      const txDate = tx.date ? new Date(tx.date) : null;
      // Include transactions from current calendar month or pending status
      if (
        (txDate && txDate.getFullYear() === curYear && txDate.getMonth() === curMonth) ||
        tx.status === 'pending'
      ) {
        const amt =
          typeof tx.chargedAmount === 'number'
            ? tx.chargedAmount
            : typeof tx.originalAmount === 'number'
            ? tx.originalAmount
            : parseFloat(tx.chargedAmount || tx.originalAmount) || 0;
        monthlyCharges += Math.abs(amt);
      }
    }

    if (monthlyCharges > 0) {
      return Math.round(monthlyCharges * 100) / 100;
    }
  }

  return typeof card?.balance === 'number' ? card.balance : 0.0;
}

async function saveTransactionsList(client, accountId, transactions) {
  if (!transactions || transactions.length === 0) {
    return { inserted: 0, total: 0 };
  }

  let insertedCount = 0;
  for (const tx of transactions) {
    const externalId =
      tx.identifier || tx.id || `${tx.date}_${tx.chargedAmount || tx.originalAmount}_${tx.description}`;
    const currency = tx.originalCurrency || tx.chargedCurrency || 'ILS';
    const txDate = tx.date ? new Date(tx.date) : new Date();
    const amount =
      typeof tx.chargedAmount === 'number'
        ? tx.chargedAmount
        : typeof tx.originalAmount === 'number'
        ? tx.originalAmount
        : parseFloat(tx.chargedAmount || tx.originalAmount) || 0;
    const description = tx.description || '';
    const merchantName = tx.memo || tx.description || null;
    const category = tx.category || null;
    const status = tx.status || 'completed';
    const rawData = JSON.stringify(tx);

    const insertQuery = `
      INSERT INTO transactions (
        account_id, external_id, date, amount, currency, description,
        merchant_name, category, status, raw_data, is_notified, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, NOW())
      ON CONFLICT (account_id, external_id) DO NOTHING
      RETURNING id;
    `;

    const res = await client.query(insertQuery, [
      accountId,
      externalId,
      txDate,
      amount,
      currency,
      description,
      merchantName,
      category,
      status,
      rawData,
    ]);

    if (res.rowCount > 0) {
      insertedCount++;
    }
  }

  return { inserted: insertedCount, total: transactions.length };
}

/**
 * Persists all scraped accounts and cards.
 * Automatically separates multiple credit cards under a single login into distinct
 * bank_accounts entries with their own transactions and monthly charge balances.
 */
async function persistScrapedAccounts(pool, primaryAccountId, scrapedAccounts, targetBank) {
  const client = await pool.connect();
  try {
    const accRes = await client.query(
      `SELECT user_id, bank_company, encrypted_credentials, display_name
       FROM bank_accounts
       WHERE id = $1`,
      [primaryAccountId]
    );

    if (accRes.rows.length === 0) {
      throw new Error(`Primary account ${primaryAccountId} not found in database`);
    }

    const { user_id, bank_company, encrypted_credentials, display_name } = accRes.rows[0];
    const results = [];
    const accountsToProcess = scrapedAccounts.length > 0 ? scrapedAccounts : [{ txns: [], balance: null }];

    await client.query('BEGIN');

    for (let i = 0; i < accountsToProcess.length; i++) {
      const card = accountsToProcess[i];
      const rawCardNum = card.accountNumber ? String(card.accountNumber).trim() : '';
      const cardLast4 = rawCardNum ? rawCardNum.slice(-4) : (i === 0 ? null : `000${i}`);
      const effectiveBalance = calculateEffectiveBalance(card, targetBank || bank_company);
      const cardTxns = Array.isArray(card.txns) ? card.txns : [];

      let targetDbAccountId;

      if (i === 0) {
        // Primary account row
        targetDbAccountId = primaryAccountId;
        await client.query(
          `UPDATE bank_accounts
           SET account_number = COALESCE($2, account_number),
               balance = $3,
               last_scraped_at = NOW(),
               last_scrape_error = NULL
           WHERE id = $1`,
          [targetDbAccountId, cardLast4, effectiveBalance]
        );
      } else {
        // Secondary card under the same login credentials
        const existingRes = await client.query(
          `SELECT id FROM bank_accounts
           WHERE user_id = $1 AND bank_company = $2 AND account_number = $3 AND is_active = true`,
          [user_id, bank_company, cardLast4]
        );

        if (existingRes.rows.length > 0) {
          targetDbAccountId = existingRes.rows[0].id;
          await client.query(
            `UPDATE bank_accounts
             SET balance = $2,
                 last_scraped_at = NOW(),
                 last_scrape_error = NULL
             WHERE id = $1`,
            [targetDbAccountId, effectiveBalance]
          );
        } else {
          // Create new record for this secondary card
          const baseName = display_name || bank_company;
          const secondaryDisplayName = cardLast4 ? `${baseName} (כרטיס ${cardLast4})` : `${baseName} (כרטיס נוסף)`;
          const insertRes = await client.query(
            `INSERT INTO bank_accounts (
               user_id, bank_company, encrypted_credentials, display_name, account_number, balance, is_active, last_scraped_at
             ) VALUES (
               $1, $2, $3, $4, $5, $6, true, NOW()
             ) RETURNING id`,
            [user_id, bank_company, encrypted_credentials, secondaryDisplayName, cardLast4, effectiveBalance]
          );
          targetDbAccountId = insertRes.rows[0].id;
          logger.info({ targetDbAccountId, cardLast4, secondaryDisplayName }, 'Created separate account row for secondary card');
        }

        // Clean up any transactions of this secondary card that might have previously been inserted under primaryAccountId
        if (cardTxns.length > 0) {
          const externalIds = cardTxns.map(
            (tx) => tx.identifier || tx.id || `${tx.date}_${tx.chargedAmount || tx.originalAmount}_${tx.description}`
          );
          await client.query(
            `DELETE FROM transactions
             WHERE account_id = $1 AND external_id = ANY($2::text[])`,
            [primaryAccountId, externalIds]
          );
        }
      }

      // Save transactions for targetDbAccountId
      const saveRes = await saveTransactionsList(client, targetDbAccountId, cardTxns);
      results.push({
        accountId: targetDbAccountId,
        cardLast4,
        inserted: saveRes.inserted,
        total: cardTxns.length,
        balance: effectiveBalance,
      });
    }

    await client.query('COMMIT');
    logger.info(
      { primaryAccountId, cardsCount: results.length, targetBank },
      'Successfully persisted all accounts and cards'
    );
    return results;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err: err.message, primaryAccountId }, 'Failed to persist scraped accounts in DB');
    throw err;
  } finally {
    client.release();
  }
}

async function markScrapingFailed(pool, accountId, errorMessage) {
  try {
    await pool.query(
      `UPDATE bank_accounts
       SET last_scraped_at = NOW(),
           last_scrape_error = $2
       WHERE id = $1`,
      [accountId, errorMessage]
    );
  } catch (err) {
    logger.error({ err: err.message, accountId }, 'Failed to update bank_account error status in DB');
  }
}

/**
 * Scrapes a single account by ID or provided credentials.
 */
export async function scrapeAccount({ accountId, bank, encryptedCreds, daysBack = 30, startDate = null }) {
  const dbPool = createDbPool();

  try {
    let targetBank = bank;
    let targetCredsCipher = encryptedCreds;

    // 1. Fetch from DB if not provided
    if (!targetBank || !targetCredsCipher) {
      logger.info({ accountId }, 'Fetching account credentials from database...');
      const res = await dbPool.query(
        `SELECT bank_company AS "bankCompany", encrypted_credentials AS "encryptedCredentials"
         FROM bank_accounts
         WHERE id = $1 AND is_active = true`,
        [accountId]
      );

      if (res.rows.length === 0) {
        throw new Error(`Account ${accountId} not found or inactive`);
      }

      targetBank = res.rows[0].bankCompany;
      targetCredsCipher = res.rows[0].encryptedCredentials;
    }

    logger.info({ accountId, targetBank }, `Starting scrape process for ${targetBank}`);

    // 2. Decrypt credentials using AES-256-GCM
    const credentials = decryptCredentials(targetCredsCipher);
    if (!credentials || typeof credentials !== 'object') {
      throw new Error('Decrypted credentials payload is not a valid object');
    }

    // 3. Determine start date
    let effectiveStartDate;
    if (startDate) {
      effectiveStartDate = new Date(startDate);
    } else {
      effectiveStartDate = new Date();
      effectiveStartDate.setDate(effectiveStartDate.getDate() - parseInt(daysBack, 10));
    }

    // 4. Configure Puppeteer arguments
    const chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
    const proxyServer = process.env.PROXY_SERVER || null;

    const puppeteerArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
    ];

    if (proxyServer) {
      puppeteerArgs.push(`--proxy-server=${proxyServer}`);
    }

    logger.info(
      { accountId, targetBank, startDate: effectiveStartDate.toISOString(), chromiumPath },
      'Initializing israeli-bank-scrapers...'
    );

    if (typeof createScraper !== 'function') {
      throw new Error(
        `Failed to initialize scraper: createScraper is not a function (resolved type: ${typeof createScraper})`
      );
    }

    const scraper = createScraper({
      companyId: targetBank,
      startDate: effectiveStartDate,
      combineInstallments: false,
      showBrowser: false,
      verbose: true,
      executablePath: chromiumPath,
      args: puppeteerArgs,
    });

    // Handle progress reporting
    if (typeof scraper?.onProgress === 'function') {
      try {
        scraper.onProgress((companyId, payload) => {
          logger.info(
            { accountId, targetBank: companyId, stage: payload?.type },
            `[Scraper Progress] ${payload?.type || JSON.stringify(payload)}`
          );
        });
      } catch (e) {
        logger.warn({ err: e.message }, 'Failed to attach onProgress listener');
      }
    }

    // Handle OTP callback
    if (typeof scraper?.onOtp === 'function') {
      scraper.onOtp(async (otpDetails) => {
        logger.info({ accountId, targetBank, otpDetails }, 'Bank requested OTP verification code');
        return await requestOtp({
          accountId,
          bank: targetBank,
          prompt: otpDetails?.message || `OTP code for ${targetBank}`,
        });
      });
    }

    const otpEventType = SCRAPER_EVENT_TYPES?.OTP_REQUEST || scrapersModule?.SCRAPER_EVENTS?.OTP_REQUEST || 'OTP_REQUEST';
    if (typeof scraper?.on === 'function' && otpEventType) {
      scraper.on(otpEventType, async (data) => {
        logger.info({ accountId, targetBank, data }, 'Received OTP_REQUEST event');
        return await requestOtp({
          accountId,
          bank: targetBank,
          prompt: data?.message || `OTP code for ${targetBank}`,
        });
      });
    }

    // 5. Execute scraping
    logger.info({ accountId, targetBank }, 'Executing scraper.scrape()...');
    let scrapeResult;
    try {
      scrapeResult = await scraper.scrape(credentials);
    } catch (scrapeErr) {
      logger.error(
        { accountId, targetBank, err: scrapeErr.message, stack: scrapeErr.stack },
        'scraper.scrape() threw an unexpected exception'
      );
      await markScrapingFailed(dbPool, accountId, scrapeErr.message);
      return { success: false, error: scrapeErr.message };
    }

    logger.info(
      {
        accountId,
        targetBank,
        success: scrapeResult?.success,
        errorType: scrapeResult?.errorType,
        errorMessage: scrapeResult?.errorMessage,
      },
      'Scraper execution returned result'
    );

    if (!scrapeResult.success) {
      const errorMsg = `Scraping failed: ${scrapeResult.errorType || 'UNKNOWN_ERROR'} - ${
        scrapeResult.errorMessage || ''
      }`;
      logger.error({ accountId, targetBank, errorType: scrapeResult.errorType }, errorMsg);
      await markScrapingFailed(dbPool, accountId, errorMsg);
      return { success: false, error: errorMsg };
    }

    // 6. Persist all scraped accounts and cards separately
    logger.info(
      { accountId, targetBank, cardsCount: scrapeResult.accounts?.length || 0 },
      'Persisting scraped accounts and separating cards into distinct records...'
    );

    const cardResults = await persistScrapedAccounts(
      dbPool,
      accountId,
      scrapeResult.accounts || [],
      targetBank
    );

    const totalTxns = cardResults.reduce((sum, r) => sum + r.total, 0);
    const totalInserted = cardResults.reduce((sum, r) => sum + r.inserted, 0);

    logger.info(
      { accountId, targetBank, cardsCount: cardResults.length, totalTxns, totalInserted },
      'Scrape job completed successfully for all cards'
    );

    return {
      success: true,
      cardsCount: cardResults.length,
      total: totalTxns,
      inserted: totalInserted,
      cards: cardResults,
    };
  } catch (err) {
    logger.error({ err: err.message, accountId }, 'Unhandled exception during scrapeAccount');
    await markScrapingFailed(dbPool, accountId, err.message);
    return { success: false, error: err.message };
  } finally {
    await dbPool.end();
  }
}

/**
 * Scrapes all active bank accounts sequentially.
 */
export async function scrapeAllAccounts({ daysBack = 30, startDate = null } = {}) {
  const dbPool = createDbPool();
  try {
    const res = await dbPool.query(
      `SELECT id, bank_company AS "bankCompany"
       FROM bank_accounts
       WHERE is_active = true
       ORDER BY created_at ASC`
    );

    const accounts = res.rows;
    logger.info({ count: accounts.length, daysBack }, 'Starting scrapeAllAccounts job');

    const results = [];
    for (const acc of accounts) {
      logger.info({ accountId: acc.id, bank: acc.bankCompany }, 'Processing account');
      const result = await scrapeAccount({ accountId: acc.id, bank: acc.bankCompany, daysBack, startDate });
      results.push({ accountId: acc.id, bank: acc.bankCompany, result });
      // Small pause between accounts to avoid rate limits
      await new Promise((r) => setTimeout(r, 3000));
    }

    return results;
  } finally {
    await dbPool.end();
  }
}

// Standalone CLI execution if run directly via `node src/scrape-single.js`
if (process.argv[1] && process.argv[1].endsWith('scrape-single.js')) {
  const accountId = process.env.ACCOUNT_ID;
  const bank = process.env.BANK || process.env.COMPANY_ID;
  const encryptedCreds = process.env.ENCRYPTED_CREDS;

  if (accountId) {
    scrapeAccount({ accountId, bank, encryptedCreds })
      .then((res) => {
        logger.info(res, 'CLI scrape finished');
        process.exit(res.success ? 0 : 1);
      })
      .catch((err) => {
        logger.error(err, 'CLI scrape failed');
        process.exit(1);
      });
  } else {
    scrapeAllAccounts()
      .then((res) => {
        logger.info({ count: res.length }, 'All accounts scraped');
        process.exit(0);
      })
      .catch((err) => {
        logger.error(err, 'All accounts scraping failed');
        process.exit(1);
      });
  }
}

export default {
  scrapeAccount,
  scrapeAllAccounts,
};
