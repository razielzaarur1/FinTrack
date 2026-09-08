import { z } from 'zod';
import { pool } from '../db.js';

const triggerSchema = z.object({
  accountId: z.string().uuid().optional().nullable(),
});

export default async function scraperRoutes(fastify, options) {
  // POST /api/scraper/trigger - Trigger a manual scraping run via HTTP Microservice
  fastify.post('/trigger', async (request, reply) => {
    const parseResult = triggerSchema.safeParse(request.body || {});
    const accountId = parseResult.success ? parseResult.data.accountId : null;
    const scraperUrl = process.env.SCRAPER_URL || 'http://scraper:3002';

    try {
      fastify.log.info({ accountId, scraperUrl }, 'Manual scraper execution triggered via HTTP');

      let responseData = null;
      try {
        const scraperRes = await fetch(`${scraperUrl}/scrape`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId }),
          signal: AbortSignal.timeout(8000),
        });

        if (scraperRes.ok) {
          responseData = await scraperRes.json();
        } else {
          fastify.log.warn({ status: scraperRes.status }, 'Scraper service returned non-200');
        }
      } catch (httpErr) {
        fastify.log.warn({ err: httpErr.message }, 'Failed to reach scraper service via HTTP');
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
      const result = await pool.query(
        `SELECT
           id,
           bank_company AS "bankCompany",
           display_name AS "displayName",
           last_scraped_at AS "lastScrapedAt",
           last_scrape_error AS "lastScrapeError",
           CASE
             WHEN last_scrape_error IS NOT NULL THEN 'error'
             WHEN last_scraped_at IS NOT NULL THEN 'success'
             ELSE 'idle'
           END AS "status"
         FROM bank_accounts
         WHERE is_active = true
         ORDER BY last_scraped_at DESC NULLS LAST`
      );

      return reply.code(200).send({
        accounts: result.rows,
        lastGlobalSync: result.rows[0]?.lastScrapedAt || null,
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch scraper status');
      return reply.code(500).send({ error: 'Internal Server Error', message: err.message });
    }
  });
}
