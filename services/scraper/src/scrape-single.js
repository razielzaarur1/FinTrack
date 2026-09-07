import fs from 'node:fs';
import pg from 'pg';
import { createScraper, SCRAPER_EVENT_TYPES } from 'israeli-bank-scrapers';
import { logger } from './logger.js';
import { getVaultClient, decryptCredentials } from './vault-client.js';
import { requestOtp } from './notifier-client.js';

const { Pool } = pg;

function getDbPassword() {
  const passwordFile = process.env.DB_PASSWORD_FILE || '/run/secrets/scraper_db_password';
  if (passwordFile && fs.existsSync(passwordFile)) {
    try {
      return fs.readFileSync(passwordFile, 'utf8').trim();
    } catch (err) {
      logger.warn({ err, passwordFile }, 'Failed to read DB password file');
    }
  }
  return process.env.DB_PASSWORD || 'postgres';
}

function createDbPool() {
  return new Pool({
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'finance',
    user: process.env.DB_USER || 'scraper_user',
    password: getDbPassword(),
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000
  });
}

async function saveTransactions(pool, accountId, transactions) {
  if (!transactions || transactions.length === 0) {
    logger.info({ accountId }, 'No transactions to save');
    return { inserted: 0, total: 0 };
  }

  let insertedCount = 0;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const tx of transactions) {
      const externalId = tx.identifier || tx.id || `${tx.date}_${tx.chargedAmount || tx.originalAmount}_${tx.description}`;
      const currency = tx.originalCurrency || tx.chargedCurrency || 'ILS';
      const txDate = tx.date ? new Date(tx.date) : new Date();
      const amount = typeof tx.chargedAmount === 'number' ? tx.chargedAmount : (typeof tx.originalAmount === 'number' ? tx.originalAmount : (parseFloat(tx.chargedAmount || tx.originalAmount) || 0));
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
        rawData
      ]);

      if (res.rowCount > 0) {
        insertedCount++;
      }
    }

    // Update bank_accounts last_scraped_at
    await client.query(`
      UPDATE bank_accounts
      SET last_scraped_at = NOW(),
          last_scrape_error = NULL
      WHERE id = $1
    `, [accountId]);

    await client.query('COMMIT');
    logger.info({ accountId, total: transactions.length, inserted: insertedCount }, 'Saved transactions to database');
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
    await pool.query(`
      UPDATE bank_accounts
      SET last_scraped_at = NOW(),
          last_scrape_error = $2
      WHERE id = $1
    `, [accountId, errorMessage]);
  } catch (err) {
    logger.error({ err: err.message, accountId }, 'Failed to update bank_account error status in DB');
  }
}

async function run() {
  const accountId = process.env.ACCOUNT_ID;
  const bank = process.env.BANK || process.env.COMPANY_ID;
  const encryptedCreds = process.env.ENCRYPTED_CREDS;

  if (!accountId || !bank || !encryptedCreds) {
    logger.error({ accountId, bank, hasCreds: !!encryptedCreds }, 'Missing required environment variables: ACCOUNT_ID, BANK, ENCRYPTED_CREDS');
    process.exit(1);
  }

  logger.info({ accountId, bank }, `Starting scrape task for account ${accountId} (${bank})`);

  const dbPool = createDbPool();

  try {
    // 1. Decrypt credentials using Vault
    logger.info({ accountId }, 'Authenticating with Vault and decrypting credentials...');
    const { token } = await getVaultClient();
    const credentials = await decryptCredentials(token, encryptedCreds);

    if (!credentials || typeof credentials !== 'object') {
      throw new Error('Decrypted credentials payload is not a valid object');
    }

    // 2. Determine start date for scraping
    let startDate;
    if (process.env.START_DATE) {
      startDate = new Date(process.env.START_DATE);
    } else {
      const daysBack = parseInt(process.env.DAYS_BACK || '30', 10);
      startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);
    }

    // 3. Configure scraper with Puppeteer args
    // NOTE: Strictly using specified args, NO --single-process, NO --no-sandbox
    const proxyServer = process.env.PROXY_SERVER || 'http://172.30.0.254:3128';
    const chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';

    logger.info({ accountId, bank, startDate: startDate.toISOString(), proxyServer }, 'Initializing scraper...');

    const scraperOptions = {
      companyId: bank,
      startDate: startDate,
      combineInstallments: false,
      showBrowser: false,
      verbose: process.env.LOG_LEVEL === 'debug',
      executablePath: chromiumPath,
      args: [
        `--proxy-server=${proxyServer}`,
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote'
      ]
    };

    const scraper = createScraper(scraperOptions);

    // Register OTP callback if supported by scraper instance
    if (typeof scraper.onOtp === 'function') {
      scraper.onOtp(async (otpDetails) => {
        logger.info({ accountId, bank, otpDetails }, 'Bank requested OTP verification code');
        return await requestOtp({
          accountId,
          bank,
          prompt: otpDetails?.message || `OTP code for ${bank}`
        });
      });
    }

    if (typeof scraper.on === 'function' && SCRAPER_EVENT_TYPES?.OTP_REQUEST) {
      scraper.on(SCRAPER_EVENT_TYPES.OTP_REQUEST, async (data) => {
        logger.info({ accountId, bank, data }, 'Received OTP_REQUEST event');
        return await requestOtp({
          accountId,
          bank,
          prompt: data?.message || `OTP code for ${bank}`
        });
      });
    }

    // 4. Execute scraping
    logger.info({ accountId, bank }, 'Running scraping process...');
    const scrapeResult = await scraper.scrape(credentials);

    if (!scrapeResult.success) {
      const errorMsg = `Scraping failed: ${scrapeResult.errorType || 'UNKNOWN_ERROR'} - ${scrapeResult.errorMessage || ''}`;
      logger.error({ accountId, bank, errorType: scrapeResult.errorType, errorMessage: scrapeResult.errorMessage }, errorMsg);
      await markScrapingFailed(dbPool, accountId, errorMsg);
      process.exit(1);
    }

    // 5. Extract transactions from all returned bank accounts
    const allTransactions = [];
    if (Array.isArray(scrapeResult.accounts)) {
      for (const acc of scrapeResult.accounts) {
        if (Array.isArray(acc.txns)) {
          allTransactions.push(...acc.txns);
        }
      }
    }

    logger.info({ accountId, bank, txCount: allTransactions.length }, 'Scraping successful. Persisting transactions...');

    // 6. Save to PostgreSQL
    const { inserted, total } = await saveTransactions(dbPool, accountId, allTransactions);

    logger.info({ accountId, bank, total, inserted }, 'Successfully completed scraping and saved transactions.');
    await dbPool.end();
    process.exit(0);
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack, accountId, bank }, 'Unhandled exception during scrape process');
    await markScrapingFailed(dbPool, accountId, err.message);
    await dbPool.end();
    process.exit(1);
  }
}

run();
