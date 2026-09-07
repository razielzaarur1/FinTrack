import { getAccountsForScraping } from '../db.js';

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
}
