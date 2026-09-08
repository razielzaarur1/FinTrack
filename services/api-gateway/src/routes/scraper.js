import { z } from 'zod';
import { pool } from '../db.js';

const triggerSchema = z.object({
  accountId: z.string().uuid().optional().nullable(),
  daysBack: z.number().int().positive().optional().nullable(),
});

export default async function scraperRoutes(fastify, options) {
  // POST /api/scraper/trigger - Trigger a manual scraping run via HTTP Microservice
  fastify.post('/trigger', async (request, reply) => {
    const parseResult = triggerSchema.safeParse(request.body || {});
    const accountId = parseResult.success ? parseResult.data.accountId : null;
    let daysBack = parseResult.success && parseResult.data.daysBack ? parseResult.data.daysBack : null;

    // If not passed in body, fetch user preference from system_settings
    if (!daysBack) {
      try {
        const settingsRes = await pool.query(
          `SELECT settings FROM system_settings WHERE user_id = '00000000-0000-0000-0000-000000000001'`
        );
        if (settingsRes.rows[0]?.settings?.scrapeDaysBack) {
          daysBack = parseInt(settingsRes.rows[0].settings.scrapeDaysBack, 10);
        }
      } catch (e) {
        fastify.log.warn({ err: e.message }, 'Failed to read scrapeDaysBack from system_settings');
      }
    }

    if (!daysBack || isNaN(daysBack)) {
      daysBack = 30;
    }

    const scraperUrl = process.env.SCRAPER_URL || 'http://scraper-worker:3002';

    try {
      fastify.log.info({ accountId, daysBack, scraperUrl }, 'Manual scraper execution triggered via HTTP');

      let responseData = null;
      const targetUrls = [
        scraperUrl,
        'http://finapp-scraper-worker:3002',
        'http://scraper-worker:3002',
      ].filter((v, i, a) => a.indexOf(v) === i);

      let lastError = null;
      let connected = false;

      for (const target of targetUrls) {
        try {
          const scraperRes = await fetch(`${target}/scrape`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId, daysBack }),
            signal: AbortSignal.timeout(8000),
          });

          if (!scraperRes.ok) {
            const errText = await scraperRes.text();
            return reply.code(scraperRes.status).send({
              error: `שירות הסריקה החזיר שגיאה: ${errText}`,
            });
          }

          responseData = await scraperRes.json();
          connected = true;
          break;
        } catch (httpErr) {
          lastError = httpErr;
          fastify.log.warn({ target, err: httpErr.message, code: httpErr.cause?.code }, 'Failed attempt to reach scraper');
        }
      }

      if (!connected) {
        const errDetail = lastError?.cause?.code || lastError?.message || 'Connection failed';
        return reply.code(502).send({
          error: `שירות הסריקה (finapp-scraper-worker) אינו זמין בפורט 3002 (${errDetail}). ודא ב-Portainer שהקונטיינר רץ ובדוק את הלוגים שלו.`,
        });
      }

      return reply.code(200).send({
        status: 'triggered',
        message: 'סריקת חשבונות הבנק הופעלה בהצלחה ברקע',
        accountId: accountId || 'all',
        details: responseData,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to trigger scraper');
      return reply.code(500).send({ error: 'Internal Server Error', message: err.message });
    }
  });

  // GET /api/scraper/status - Check status of recent scrape jobs
  fastify.get('/status', async (request, reply) => {
    try {
      let isJobRunning = false;
      const scraperUrl = process.env.SCRAPER_URL || 'http://scraper-worker:3002';
      try {
        const healthRes = await fetch(`${scraperUrl}/health`, { signal: AbortSignal.timeout(2000) });
        if (healthRes.ok) {
          const healthData = await healthRes.json();
          isJobRunning = Boolean(healthData.isJobRunning);
        }
      } catch (_) {}

      const result = await pool.query(
        `SELECT
           id,
           bank_company AS "bankCompany",
           display_name AS "displayName",
           account_number AS "accountNumber",
           balance,
           last_scraped_at AS "lastScrapedAt",
           last_scrape_error AS "lastScrapeError",
           CASE
             WHEN last_scrape_error IS NOT NULL THEN 'error'
             WHEN last_scraped_at IS NOT NULL THEN 'success'
             ELSE 'idle'
           END AS "status"
         FROM bank_accounts
         WHERE is_active = true
         ORDER BY created_at ASC`
      );

      return reply.code(200).send({
        isJobRunning,
        accounts: result.rows,
        lastGlobalSync: result.rows[0]?.lastScrapedAt || null,
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch scraper status');
      return reply.code(500).send({ error: 'Internal Server Error', message: err.message });
    }
  });
}
