import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';
import israeliBankScrapersPkg from 'israeli-bank-scrapers';
import { logger } from './logger.js';
import { decryptCredentials } from './crypto.js';
import { requestOtp } from './notifier-client.js';
import { classifyScrapedTx } from './classifier.js';

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
export function calculateEffectiveBalance(card, bankCompany, billingDay = 10) {
  const isCredit = isCreditInstitution(bankCompany);
  if (!isCredit) {
    return typeof card?.balance === 'number' ? card.balance : 0.0;
  }

  // Credit card: compute net upcoming monthly billing amount
  const txns = Array.isArray(card?.txns) ? card.txns : [];
  if (txns.length > 0) {
    const now = new Date();
    const curDay = now.getDate();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();

    const day = Math.min(Math.max(parseInt(billingDay, 10) || 10, 1), 28);
    let cycleStart, cycleEnd;
    if (curDay <= day) {
      cycleEnd = new Date(curYear, curMonth, day, 23, 59, 59, 999);
      cycleStart = new Date(curYear, curMonth - 1, day, 0, 0, 0, 0);
    } else {
      cycleEnd = new Date(curYear, curMonth + 1, day, 23, 59, 59, 999);
      cycleStart = new Date(curYear, curMonth, day, 0, 0, 0, 0);
    }

    const startOfToday = new Date(curYear, curMonth, curDay, 0, 0, 0, 0);

    let netCharges = 0;
    let cycleTxCount = 0;

    for (const tx of txns) {
      const txDate = tx.date ? new Date(tx.date) : null;
      const processedDate = tx.processedDate ? new Date(tx.processedDate) : null;

      // Only count upcoming charges (processedDate >= today or pending or date in current unbilled cycle)
      const isUpcomingProcessed = processedDate && processedDate >= startOfToday;
      const isUnbilledTx = !processedDate && txDate && txDate >= cycleStart && txDate <= cycleEnd;

      if (isUpcomingProcessed || isUnbilledTx || tx.status === 'pending') {
        const amt =
          typeof tx.chargedAmount === 'number'
            ? tx.chargedAmount
            : typeof tx.originalAmount === 'number'
            ? tx.originalAmount
            : parseFloat(tx.chargedAmount || tx.originalAmount) || 0;

        // In israeli-bank-scrapers: expenses are negative, credits are positive
        netCharges += -amt;
        cycleTxCount++;
      }
    }

    if (cycleTxCount > 0) {
      return Math.round(netCharges * 100) / 100;
    }
  }

  return typeof card?.balance === 'number' ? card.balance : 0.0;
}

/**
 * Collapses spaced-out Hebrew characters commonly returned in card statement PDFs/tables.
 */
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
 * Extracts 4-digit card number reliably from card metadata or internal transactions.
 */
export function extractCardLast4(card, cardTxns = []) {
  // 1. From card.accountNumber
  if (card?.accountNumber) {
    const digits = String(card.accountNumber).replace(/\D/g, '');
    if (digits.length >= 4) {
      return digits.slice(-4);
    }
  }

  // 2. From transactions inside this card
  if (Array.isArray(cardTxns)) {
    for (const tx of cardTxns) {
      const candidates = [tx.chargedCard, tx.cardLastDigits, tx.accountNumber];
      for (const cand of candidates) {
        if (cand) {
          const digits = String(cand).replace(/\D/g, '');
          if (digits.length >= 4) {
            return digits.slice(-4);
          }
        }
      }
    }
  }

  return null;
}

/**
 * Generates a globally unique, deterministic external_id for each transaction.
 * Solves the critical duplicate insertion problem by prioritizing bank-provided identifiers
 * and using deterministic composite hashing instead of volatile array order.
 */
export function generateTransactionExternalId(accountId, tx, occurrenceIndex = 0) {
  let dateStr = 'unknown_date';
  if (tx.date) {
    try {
      const d = new Date(tx.date);
      if (!isNaN(d.getTime())) {
        dateStr = d.toISOString().slice(0, 10);
      }
    } catch (e) {
      dateStr = String(tx.date).slice(0, 10);
    }
  }

  let processedDateStr = '';
  if (tx.processedDate) {
    try {
      const pd = new Date(tx.processedDate);
      if (!isNaN(pd.getTime())) {
        processedDateStr = pd.toISOString().slice(0, 10);
      }
    } catch (e) {
      processedDateStr = String(tx.processedDate).slice(0, 10);
    }
  }

  const chargedNum = typeof tx.chargedAmount === 'number' ? tx.chargedAmount : parseFloat(tx.chargedAmount);
  const origNum = typeof tx.originalAmount === 'number' ? tx.originalAmount : parseFloat(tx.originalAmount);
  let amount = 0;
  if (!isNaN(chargedNum) && chargedNum !== 0) {
    amount = chargedNum;
  } else if (!isNaN(origNum) && origNum !== 0) {
    amount = origNum;
  } else if (!isNaN(chargedNum)) {
    amount = chargedNum;
  } else if (!isNaN(origNum)) {
    amount = origNum;
  }

  const merchantName = cleanSpacedHebrew((tx.description || tx.memo || '').trim());
  const description = cleanSpacedHebrew((tx.memo && tx.memo !== tx.description ? tx.memo : tx.description || '').trim());

  // Priority 1: Bank/Credit-Card unique external identifier (deal/voucher reference)
  const rawId = tx.identifier != null ? String(tx.identifier).trim() : (tx.id != null ? String(tx.id).trim() : '');
  if (rawId && rawId !== '0' && rawId !== 'undefined' && rawId !== 'null') {
    return `${dateStr}_${rawId}`;
  }

  // Priority 2: Deterministic SHA-256 composite hash
  const occPart = occurrenceIndex > 0 ? `_#${occurrenceIndex}` : '';
  const hashPayload = `${accountId}_${dateStr}_${Number(amount).toFixed(2)}_${merchantName}_${description}_${processedDateStr}${occPart}`;
  const hash = crypto.createHash('sha256').update(hashPayload).digest('hex').slice(0, 24);
  return `tx_${dateStr}_${hash}`;
}

async function saveTransactionsList(client, accountId, transactions, userId = '00000000-0000-0000-0000-000000000001') {
  if (!transactions || transactions.length === 0) {
    return { inserted: 0, total: 0 };
  }

  // Sort transactions deterministically so occurrence indices for same-day duplicates are stable across scrapes
  const sortedTransactions = [...transactions].sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    if (da !== db) return da - db;
    const aa = parseFloat(a.chargedAmount || a.originalAmount || 0);
    const ab = parseFloat(b.chargedAmount || b.originalAmount || 0);
    if (aa !== ab) return aa - ab;
    const descA = a.description || a.memo || '';
    const descB = b.description || b.memo || '';
    return descA.localeCompare(descB);
  });

  let insertedCount = 0;
  const occurrenceMap = new Map();

  for (const tx of sortedTransactions) {
    const txDate = tx.date ? new Date(tx.date) : new Date();
    const processedDate = tx.processedDate ? new Date(tx.processedDate) : txDate;
    const dateStr = !isNaN(txDate.getTime()) ? txDate.toISOString().slice(0, 10) : 'unknown_date';

    const chargedNum = typeof tx.chargedAmount === 'number' ? tx.chargedAmount : parseFloat(tx.chargedAmount);
    const origNum = typeof tx.originalAmount === 'number' ? tx.originalAmount : parseFloat(tx.originalAmount);
    
    let amount = 0;
    if (!isNaN(chargedNum) && chargedNum !== 0) {
      amount = chargedNum;
    } else if (!isNaN(origNum) && origNum !== 0) {
      amount = origNum;
    } else if (!isNaN(chargedNum)) {
      amount = chargedNum;
    } else if (!isNaN(origNum)) {
      amount = origNum;
    }
    
    const merchantName = cleanSpacedHebrew((tx.description || tx.memo || '').trim()) || 'בית עסק';
    const description = cleanSpacedHebrew((tx.memo && tx.memo !== tx.description ? tx.memo : tx.description) || '');
    const currency = tx.originalCurrency || tx.chargedCurrency || 'ILS';

    // Track occurrences of identical transactions on the same day to maintain uniqueness
    const occKey = `${dateStr}_${Number(amount).toFixed(2)}_${merchantName}_${description}`;
    const occIndex = occurrenceMap.get(occKey) || 0;
    occurrenceMap.set(occKey, occIndex + 1);

    const externalId = generateTransactionExternalId(accountId, tx, occIndex);

    // Auto-classify using the 3-tier hierarchy: User rules -> Scraper Category -> Israeli Merchant KB
    const category = await classifyScrapedTx(client, {
      userId,
      merchantName,
      description,
      rawCategory: tx.category,
      amount,
    });

    const status = tx.status || 'completed';
    const rawData = JSON.stringify(tx);

    const insertQuery = `
      INSERT INTO transactions (
        account_id, external_id, date, processed_date, amount, currency, description,
        merchant_name, category, status, raw_data, is_notified, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, NOW())
      ON CONFLICT (account_id, external_id) DO UPDATE SET
        amount = CASE WHEN transactions.amount = 0 OR transactions.amount IS NULL THEN EXCLUDED.amount ELSE transactions.amount END,
        date = EXCLUDED.date,
        description = EXCLUDED.description,
        merchant_name = EXCLUDED.merchant_name,
        category = COALESCE(transactions.category, EXCLUDED.category),
        status = EXCLUDED.status,
        processed_date = COALESCE(EXCLUDED.processed_date, transactions.processed_date),
        raw_data = EXCLUDED.raw_data
      RETURNING id;
    `;

    const res = await client.query(insertQuery, [
      accountId,
      externalId,
      txDate,
      processedDate,
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

  return { inserted: insertedCount, total: sortedTransactions.length };
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
      `SELECT user_id, bank_company, encrypted_credentials, display_name, account_number, COALESCE(billing_day, 10)::INT AS billing_day
       FROM bank_accounts
       WHERE id = $1`,
      [primaryAccountId]
    );

    if (accRes.rows.length === 0) {
      throw new Error(`Primary account ${primaryAccountId} not found in database`);
    }

    const { user_id, bank_company, encrypted_credentials, display_name, account_number: primaryAccountNum, billing_day } = accRes.rows[0];
    const results = [];
    const accountsToProcess = scrapedAccounts.length > 0 ? scrapedAccounts : [{ txns: [], balance: null }];

    // Fetch all existing active accounts for this user and institution to enable smart matching
    const existingAccountsRes = await client.query(
      `SELECT id, display_name, account_number, is_active FROM bank_accounts
       WHERE user_id = $1 AND bank_company = $2
       ORDER BY created_at ASC`,
      [user_id, bank_company]
    );
    const existingAccounts = existingAccountsRes.rows;

    await client.query('BEGIN');

    const usedAccountIds = new Set();

    for (let i = 0; i < accountsToProcess.length; i++) {
      const card = accountsToProcess[i];
      const cardTxns = Array.isArray(card.txns) ? card.txns : [];
      const extracted4 = extractCardLast4(card, cardTxns);
      const effectiveBalance = calculateEffectiveBalance(card, targetBank || bank_company, billing_day || 10);

      let targetDbAccountId = null;
      let cardLast4 = extracted4;

      // 1. Try to match an existing active account with the exact same last 4 digits
      if (cardLast4) {
        const exactMatch = existingAccounts.find(
          (a) => a.account_number && a.account_number.slice(-4) === cardLast4 && !usedAccountIds.has(a.id)
        );
        if (exactMatch) {
          if (exactMatch.is_active === false) {
            logger.info({ cardLast4, bank_company }, 'Card was previously deactivated by user, skipping re-insertion');
            continue;
          }
          targetDbAccountId = exactMatch.id;
        }
      }

      // 2. If no card-number match yet, check primary account ONLY if:
      // - primaryAccountId is unused
      // - AND primaryAccount has matching cardLast4 OR primaryAccount has NO card number / dummy '0000'
      if (!targetDbAccountId && !usedAccountIds.has(primaryAccountId)) {
        const primaryAcc = existingAccounts.find((a) => a.id === primaryAccountId);
        const primaryDigits = primaryAcc?.account_number ? String(primaryAcc.account_number).replace(/\D/g, '') : '';
        const isPrimaryUnset = !primaryDigits || primaryDigits === '0000' || primaryDigits === '0';

        if (isPrimaryUnset || (cardLast4 && primaryDigits.slice(-4) === cardLast4)) {
          targetDbAccountId = primaryAccountId;
          if (!cardLast4 && primaryDigits && !isPrimaryUnset) {
            cardLast4 = primaryDigits.slice(-4);
          }
        }
      }

      // 3. If still no match, check if any unused account without card number exists
      if (!targetDbAccountId) {
        const unassignedAcc = existingAccounts.find(
          (a) => (!a.account_number || a.account_number === '' || a.account_number === '0000') && !usedAccountIds.has(a.id) && a.is_active === true
        );
        if (unassignedAcc) {
          targetDbAccountId = unassignedAcc.id;
        }
      }

      if (targetDbAccountId) {
        usedAccountIds.add(targetDbAccountId);
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
        // Create new record for this secondary card
        const rawBase = (display_name || bank_company || '').replace(/\s*\((כרטיס|card).*?\)/gi, '').trim();
        const cleanBase = rawBase || bank_company;
        const secondaryDisplayName = cardLast4 ? `${cleanBase} (כרטיס ${cardLast4})` : `${cleanBase} (כרטיס נוסף)`;
        const insertRes = await client.query(
          `INSERT INTO bank_accounts (
             user_id, bank_company, encrypted_credentials, display_name, account_number, balance, billing_day, is_active, last_scraped_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, true, NOW()
           ) RETURNING id`,
          [user_id, bank_company, encrypted_credentials, secondaryDisplayName, cardLast4, effectiveBalance, billing_day || 10]
        );
        targetDbAccountId = insertRes.rows[0].id;
        usedAccountIds.add(targetDbAccountId);
        logger.info({ targetDbAccountId, cardLast4, secondaryDisplayName }, 'Created separate account row for secondary card');
      }

      // Clean up legacy corrupted row-number external IDs from previous scraper versions
      await client.query(
        `DELETE FROM transactions
         WHERE account_id = $1 AND (external_id ~ '^[0-9]{1,4}$' OR external_id LIKE 'undefined_%')`,
        [targetDbAccountId]
      );

      // Save transactions for targetDbAccountId with auto-classification
      const saveRes = await saveTransactionsList(client, targetDbAccountId, cardTxns, user_id);

      // Deduplicate any exact identical transactions in this account that might have been created by older versions
      await client.query(
        `DELETE FROM transactions t1
         USING transactions t2
         WHERE t1.id > t2.id
           AND t1.account_id = t2.account_id
           AND t1.account_id = $1
           AND t1.date = t2.date
           AND t1.amount = t2.amount
           AND COALESCE(t1.merchant_name, '') = COALESCE(t2.merchant_name, '')
           AND COALESCE(t1.description, '') = COALESCE(t2.description, '')
           AND (t1.is_split = false OR t1.is_split IS NULL)
           AND (t2.is_split = false OR t2.is_split IS NULL)`,
        [targetDbAccountId]
      );

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

    // 3. Determine start date & fetch system_settings if default
    let effectiveDaysBack = daysBack ? parseInt(daysBack, 10) : 30;
    if (isNaN(effectiveDaysBack) || effectiveDaysBack === 30) {
      try {
        const setRes = await dbPool.query(
          `SELECT settings FROM system_settings WHERE user_id = '00000000-0000-0000-0000-000000000001'`
        );
        if (setRes.rows[0]?.settings?.scrapeDaysBack) {
          effectiveDaysBack = parseInt(setRes.rows[0].settings.scrapeDaysBack, 10) || effectiveDaysBack;
        }
      } catch (e) {
        // ignore
      }
    }

    let effectiveStartDate;
    if (startDate) {
      effectiveStartDate = new Date(startDate);
    } else {
      effectiveStartDate = new Date();
      effectiveStartDate.setDate(effectiveStartDate.getDate() - effectiveDaysBack);
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
      `SELECT DISTINCT ON (user_id, bank_company, encrypted_credentials)
         id, bank_company AS "bankCompany"
       FROM bank_accounts
       WHERE is_active = true
       ORDER BY user_id, bank_company, encrypted_credentials, created_at ASC`
    );

    const accounts = res.rows;
    logger.info({ count: accounts.length, daysBack }, 'Starting scrapeAllAccounts job with deduplicated logins');

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
