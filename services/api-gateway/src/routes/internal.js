import { pool, getAccountsForScraping } from '../db.js';
import { processPendingNotifications } from '../services/notifications.js';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Returns true when the request originates from a Docker-internal / loopback address.
 * All RFC-1918 ranges and ::1 / 127.x are considered internal.
 */
function isInternalOrigin(request) {
  const raw = request.ip || request.socket?.remoteAddress || '';
  // Strip IPv6 prefix if present (e.g. "::ffff:172.17.0.3" → "172.17.0.3")
  const ip = raw.replace(/^::ffff:/, '');
  return (
    ip === '::1' ||
    ip.startsWith('127.') ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    // Docker default bridge 172.16.0.0/12
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
}

export default async function internalRoutes(fastify, options) {
  // Global pre-handler: block any non-internal caller
  fastify.addHook('preHandler', async (request, reply) => {
    if (!isInternalOrigin(request)) {
      fastify.log.warn(
        { ip: request.ip, url: request.url },
        'Rejected external access attempt to /internal endpoint'
      );
      return reply.code(403).send({ error: 'Forbidden' });
    }
  });

  // GET /accounts-for-scraping - Internal endpoint for scraper engine (no JWT auth required)
  fastify.get('/accounts-for-scraping', async (request, reply) => {
    try {
      const accounts = await getAccountsForScraping();
      return reply.code(200).send(accounts);
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch accounts for scraping');
      return reply.code(500).send({ error: 'Internal Server Error' });
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
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  // POST /on-scrape-completed - Internal webhook called by scraper upon finishing a scrape job
  fastify.post('/on-scrape-completed', async (request, reply) => {
    try {
      fastify.log.info('Scraper reported job completion; triggering real-time notification engine...');
      const result = await processPendingNotifications(fastify.log);
      return reply.code(200).send({ success: true, result });
    } catch (err) {
      fastify.log.error(err, 'Failed to process notifications after scrape completion');
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });
}

