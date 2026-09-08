import fs from 'node:fs';
import pg from 'pg';
import { createScraper, SCRAPER_EVENT_TYPES } from 'israeli-bank-scrapers';
import { logger } from './logger.js';
import { decryptCredentials } from './crypto.js';
import { requestOtp } from './notifier-client.js';

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

async function saveTransactions(pool, accountId, transactions, accountMeta = {}) {
  if (!transactions || transactions.length === 0) {
    logger.info({ accountId }, 'No transactions to save, updating account metadata...');
    const client = await pool.connect();
    try {
      const balance =
        accountMeta?.balance !== undefined && accountMeta?.balance !== null
          ? accountMeta.balance
          : null;
      const accountNumber = accountMeta?.accountNumber || null;
      await client.query(
        `UPDATE bank_accounts
         SET last_scraped_at = NOW(),
             last_scrape_error = NULL,
             balance = COALESCE($2, balance),
             account_number = COALESCE($3, account_number)
         WHERE id = $1`,
        [accountId, balance, accountNumber]
      );
    } catch (e) {
      logger.warn({ err: e.message, accountId }, 'Failed to update account meta on empty transactions');
    } finally {
      client.release();
    }
    return { inserted: 0, total: 0 };
  }

  let insertedCount = 0;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

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
          account_id,
          external_id,
          date,
          amount,
          currency,
          description,
          merchant_name,
          category,
          status,
          raw_data,
          is_notified,
          created_at
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

    const balance =
      accountMeta?.balance !== undefined && accountMeta?.balance !== null ? accountMeta.balance : null;
    const accountNumber = accountMeta?.accountNumber || null;

    await client.query(
      `UPDATE bank_accounts
       SET last_scraped_at = NOW(),
           last_scrape_error = NULL,
           balance = COALESCE($2, balance),
           account_number = COALESCE($3, account_number)
       WHERE id = $1`,
      [accountId, balance, accountNumber]
    );

    await client.query('COMMIT');
    logger.info(
      { accountId, total: transactions.length, inserted: insertedCount, balance, accountNumber },
      'Saved transactions and account state to database'
    );
    return { inserted: insertedCount, total: transactions.length };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err: err.message, accountId }, 'Failed to persist transactions in DB');
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

    const scraper = createScraper({
      companyId: targetBank,
      startDate: effectiveStartDate,
      combineInstallments: false,
      showBrowser: false,
      verbose: process.env.LOG_LEVEL === 'debug',
      executablePath: chromiumPath,
      args: puppeteerArgs,
    });

    // Handle OTP callback
    if (typeof scraper.onOtp === 'function') {
      scraper.onOtp(async (otpDetails) => {
        logger.info({ accountId, targetBank, otpDetails }, 'Bank requested OTP verification code');
        return await requestOtp({
          accountId,
          bank: targetBank,
          prompt: otpDetails?.message || `OTP code for ${targetBank}`,
        });
      });
    }

    if (typeof scraper.on === 'function' && SCRAPER_EVENT_TYPES?.OTP_REQUEST) {
      scraper.on(SCRAPER_EVENT_TYPES.OTP_REQUEST, async (data) => {
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
    const scrapeResult = await scraper.scrape(credentials);

    if (!scrapeResult.success) {
      const errorMsg = `Scraping failed: ${scrapeResult.errorType || 'UNKNOWN_ERROR'} - ${
        scrapeResult.errorMessage || ''
      }`;
      logger.error({ accountId, targetBank, errorType: scrapeResult.errorType }, errorMsg);
      await markScrapingFailed(dbPool, accountId, errorMsg);
      return { success: false, error: errorMsg };
    }

    // 6. Extract transactions
    const allTransactions = [];
    if (Array.isArray(scrapeResult.accounts)) {
      for (const acc of scrapeResult.accounts) {
        if (Array.isArray(acc.txns)) {
          allTransactions.push(...acc.txns);
        }
      }
    }

    logger.info(
      { accountId, targetBank, txCount: allTransactions.length },
      'Scraping successful. Persisting transactions to database...'
    );

    // 7. Extract metadata
    const primaryAccount =
      Array.isArray(scrapeResult.accounts) && scrapeResult.accounts.length > 0
        ? scrapeResult.accounts[0]
        : {};

    const accountMeta = {
      balance: typeof primaryAccount.balance === 'number' ? primaryAccount.balance : null,
      accountNumber: primaryAccount.accountNumber ? String(primaryAccount.accountNumber).slice(-4) : null,
    };

    // 8. Save transactions to DB
    const { inserted, total } = await saveTransactions(dbPool, accountId, allTransactions, accountMeta);

    logger.info({ accountId, targetBank, total, inserted }, 'Scrape job completed successfully');
    return { success: true, total, inserted, balance: accountMeta.balance };
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
export async function scrapeAllAccounts() {
  const dbPool = createDbPool();
  try {
    const res = await dbPool.query(
      `SELECT id, bank_company AS "bankCompany"
       FROM bank_accounts
       WHERE is_active = true
       ORDER BY created_at ASC`
    );

    const accounts = res.rows;
    logger.info({ count: accounts.length }, 'Starting scrapeAllAccounts job');

    const results = [];
    for (const acc of accounts) {
      logger.info({ accountId: acc.id, bank: acc.bankCompany }, 'Processing account');
      const result = await scrapeAccount({ accountId: acc.id, bank: acc.bankCompany });
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
