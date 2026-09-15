import { pool, getAccountsForScraping } from '../db.js';
import { processPendingNotifications } from '../services/notifications.js';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

export default async function internalRoutes(fastify, options) {
  // GET /accounts-for-scraping - Internal endpoint for scraper engine (no JWT auth required)
  fastify.get('/accounts-for-scraping', async (request, reply) => {
    try {
      const accounts = await getAccountsForScraping();
      return reply.code(200).send(accounts);
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch accounts for scraping');
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: err.message,
      });
    }
  });

  // GET /notifier-config - Internal endpoint for Notifier service to pull Telegram config at boot
  fastify.get('/notifier-config', async (request, reply) => {
    try {
      const res = await pool.query(
        `SELECT settings FROM system_settings WHERE user_id = $1`,
        [DEFAULT_USER_ID]
      );
      const settings = res.rows[0]?.settings || {};
      return reply.code(200).send({
        telegramBotToken: settings.telegramBotToken || null,
        telegramChatId: settings.telegramChatId || null,
        tmaBaseUrl: settings.tmaBaseUrl || null,
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch notifier config');
      return reply.code(500).send({ error: err.message });
    }
  });

  // POST /on-scrape-completed - Internal webhook called by scraper upon finishing a scrape job
  fastify.post('/on-scrape-completed', async (request, reply) => {
    try {
      fastify.log.info('Scraper reported job completion; triggering real-time notification engine...');
      // Execute asynchronously or synchronously
      const result = await processPendingNotifications(fastify.log);
      return reply.code(200).send({ success: true, result });
    } catch (err) {
      fastify.log.error(err, 'Failed to process notifications after scrape completion');
      return reply.code(500).send({ error: err.message });
    }
  });
}
