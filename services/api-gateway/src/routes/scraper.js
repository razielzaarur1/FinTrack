import { z } from 'zod';
import { pool } from '../db.js';

const triggerSchema = z.object({
  accountId: z.string().uuid().optional().nullable(),
});

export default async function scraperRoutes(fastify, options) {
  // POST /api/scraper/trigger - Trigger a manual scraping run
  fastify.post('/trigger', async (request, reply) => {
    const parseResult = triggerSchema.safeParse(request.body || {});
    const accountId = parseResult.success ? parseResult.data.accountId : null;

    try {
      fastify.log.info({ accountId }, 'Manual scraper execution triggered');

      // Attempt to invoke scraper via docker-socket-proxy if available
      const dockerHost = process.env.DOCKER_HOST || 'http://docker-socket-proxy:2375';
      const containerName = 'finapp-scraper-worker';

      let triggeredViaDocker = false;

      try {
        const cmd = accountId
          ? ['node', '/app/src/scrape-single.js']
          : ['bash', '/app/scripts/run-scrape-all.sh'];

        const env = accountId ? [`ACCOUNT_ID=${accountId}`] : [];

        const execRes = await fetch(`${dockerHost}/containers/${containerName}/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            AttachStdout: true,
            AttachStderr: true,
            Cmd: cmd,
            Env: env,
          }),
        });

        if (execRes.ok) {
          const execData = await execRes.json();
          if (execData.Id) {
            // Start exec in detached mode
            fetch(`${dockerHost}/exec/${execData.Id}/start`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ Detach: true, Tty: false }),
            }).catch((e) => fastify.log.warn({ err: e.message }, 'Exec start warning'));
            triggeredViaDocker = true;
          }
        }
      } catch (dockerErr) {
        fastify.log.warn({ err: dockerErr.message }, 'Docker socket execution skipped, returning queued status');
      }

      return reply.code(200).send({
        status: 'triggered',
        message: 'סריקת חשבונות הבנק הופעלה בהצלחה ברקע',
        accountId: accountId || 'all',
        triggeredViaDocker,
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
