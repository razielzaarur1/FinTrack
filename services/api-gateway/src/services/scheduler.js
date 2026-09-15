import { pool } from '../db.js';
import { processPendingNotifications } from './notifications.js';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';
const SCRAPER_URL = (process.env.SCRAPER_URL || 'http://scraper-worker:3002').replace(/\/$/, '');

// Safety floor: Minimum 3 hours interval between automated scraping runs
// to protect user accounts from bot detection, rate limits, and bank lockouts.
export const MIN_SCRAPE_INTERVAL_HOURS = 3;

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
  return CREDIT_INSTITUTIONS.has(String(bankCompany).toLowerCase().trim());
}

/**
 * Checks if current time is within safe scraping/OTP hours (08:00 - 22:00 Israel time)
 */
export function isWithinAllowedScrapeHours() {
  const tz = process.env.TIMEZONE || 'Asia/Jerusalem';
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    });
    const currentHour = parseInt(formatter.format(new Date()), 10);
    return currentHour >= 8 && currentHour < 22;
  } catch (_) {
    const fallbackHour = new Date().getHours();
    return fallbackHour >= 8 && fallbackHour < 22;
  }
}

class AutoScrapeScheduler {
  constructor() {
    this.intervalHandle = null;
    this.isJobRunning = false;
    this.logger = console;
  }

  start(logger = console) {
    this.logger = logger;
    if (this.intervalHandle) return;

    logger.info?.('[AutoScrapeScheduler] Background scheduler initialized (checking every 60s).');

    // Run tick check every 60 seconds
    this.intervalHandle = setInterval(() => {
      this.checkAndRunScrapes().catch((err) => {
        this.logger.error?.(`[AutoScrapeScheduler] Unexpected error in scheduler tick: ${err.message}`);
      });
    }, 60 * 1000);

    // Initial check 10 seconds after boot
    setTimeout(() => {
      this.checkAndRunScrapes().catch(() => {});
    }, 10 * 1000);
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.logger.info?.('[AutoScrapeScheduler] Scheduler stopped.');
    }
  }

  async checkAndRunScrapes() {
    if (this.isJobRunning) return;

    // 1. Fetch system settings
    let settings = {};
    try {
      const res = await pool.query(
        `SELECT settings FROM system_settings WHERE user_id = $1`,
        [DEFAULT_USER_ID]
      );
      settings = res.rows[0]?.settings || {};
    } catch (err) {
      return;
    }

    const autoScrapeEnabled = settings.autoScrapeEnabled !== false;
    if (!autoScrapeEnabled) {
      return;
    }

    // Check operating hours (08:00 - 22:00)
    if (!isWithinAllowedScrapeHours()) {
      return;
    }

    // Extract intervals with strict safety limits (minimum 3 hours)
    const rawCreditHours = parseFloat(settings.scrapeIntervalCreditCardsHours ?? 4);
    const rawBankHours = parseFloat(settings.scrapeIntervalBanksHours ?? 8);

    const creditIntervalHours = Math.max(MIN_SCRAPE_INTERVAL_HOURS, isNaN(rawCreditHours) ? 4 : rawCreditHours);
    const bankIntervalHours = Math.max(MIN_SCRAPE_INTERVAL_HOURS, isNaN(rawBankHours) ? 8 : rawBankHours);

    const creditIntervalMs = creditIntervalHours * 3600 * 1000;
    const bankIntervalMs = bankIntervalHours * 3600 * 1000;

    // 2. Query active bank accounts
    let accounts = [];
    try {
      const accRes = await pool.query(
        `SELECT id, bank_company, display_name, last_scraped_at
         FROM bank_accounts
         WHERE user_id = $1 AND is_active = true
         ORDER BY last_scraped_at ASC NULLS FIRST`,
        [DEFAULT_USER_ID]
      );
      accounts = accRes.rows;
    } catch (err) {
      this.logger.error?.(`[AutoScrapeScheduler] Failed to query accounts: ${err.message}`);
      return;
    }

    const now = Date.now();
    const dueAccounts = [];

    for (const acc of accounts) {
      const isCredit = isCreditInstitution(acc.bank_company);
      const requiredIntervalMs = isCredit ? creditIntervalMs : bankIntervalMs;

      if (!acc.last_scraped_at) {
        dueAccounts.push(acc);
      } else {
        const lastScrapedTime = new Date(acc.last_scraped_at).getTime();
        if (now - lastScrapedTime >= requiredIntervalMs) {
          dueAccounts.push(acc);
        }
      }
    }

    if (dueAccounts.length === 0) {
      return;
    }

    // 3. Process due accounts sequentially
    this.isJobRunning = true;
    try {
      this.logger.info?.(`[AutoScrapeScheduler] Found ${dueAccounts.length} accounts due for scheduled refresh.`);

      for (const acc of dueAccounts) {
        this.logger.info?.(
          `[AutoScrapeScheduler] Triggering scrape for account ${acc.id} (${acc.display_name || acc.bank_company})...`
        );

        try {
          const scrapeRes = await fetch(`${SCRAPER_URL}/scrape`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId: acc.id }),
            signal: AbortSignal.timeout(10000),
          });

          if (scrapeRes.ok) {
            this.logger.info?.(`[AutoScrapeScheduler] Scrape started for ${acc.id}.`);
          } else {
            const errText = await scrapeRes.text();
            this.logger.warn?.(`[AutoScrapeScheduler] Scraper responded with ${scrapeRes.status}: ${errText}`);
          }
        } catch (postErr) {
          this.logger.warn?.(`[AutoScrapeScheduler] Scraper request failed for ${acc.id}: ${postErr.message}`);
        }

        // Wait 15 seconds before triggering next account to avoid slamming microservices
        await new Promise((r) => setTimeout(r, 15000));
      }
    } finally {
      this.isJobRunning = false;
    }
  }
}

export const autoScrapeScheduler = new AutoScrapeScheduler();
export default autoScrapeScheduler;
