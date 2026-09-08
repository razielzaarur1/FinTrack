import http from 'node:http';
import { logger } from './logger.js';
import { scrapeAccount, scrapeAllAccounts } from './scrape-single.js';

const PORT = parseInt(process.env.PORT || '3002', 10);
const HOST = '0.0.0.0';

let isJobRunning = false;

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Health check endpoint
  if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/')) {
    return sendJson(res, 200, {
      status: 'healthy',
      service: 'scraper-worker',
      isJobRunning,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  }

  // Trigger scrape endpoint
  if (req.method === 'POST' && url.pathname === '/scrape') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', async () => {
      let parsed = {};
      try {
        if (body.trim()) {
          parsed = JSON.parse(body);
        }
      } catch (err) {
        return sendJson(res, 400, { error: 'Invalid JSON body' });
      }

      const accountId = parsed.accountId || null;
      const daysBack = parsed.daysBack || 30;
      const startDate = parsed.startDate || null;

      logger.info({ accountId, isJobRunning }, 'Received scrape trigger request');

      if (isJobRunning) {
        return sendJson(res, 429, {
          status: 'busy',
          message: 'סריקה קודמת עדיין רצה ברקע. אנא המתן לסיומה.',
        });
      }

      const jobId = `job_${Date.now()}`;

      // Acknowledge immediately to HTTP client
      sendJson(res, 200, {
        status: 'accepted',
        jobId,
        accountId: accountId || 'all',
        message: 'סריקת החשבון הופעלה בהצלחה ברקע',
      });

      // Execute scrape task asynchronously
      isJobRunning = true;
      (async () => {
        try {
          if (accountId) {
            logger.info({ jobId, accountId, daysBack }, 'Running single account scrape in background...');
            await scrapeAccount({ accountId, daysBack, startDate });
          } else {
            logger.info({ jobId, daysBack }, 'Running all accounts scrape in background...');
            await scrapeAllAccounts({ daysBack, startDate });
          }
        } catch (taskErr) {
          logger.error({ jobId, err: taskErr.message }, 'Background scrape job encountered an error');
        } finally {
          isJobRunning = false;
          logger.info({ jobId }, 'Background scrape job finished');
        }
      })();
    });

    return;
  }

  // 404 Not Found
  return sendJson(res, 404, { error: 'Not Found' });
});

server.listen(PORT, HOST, () => {
  logger.info(`Scraper Microservice server listening on http://${HOST}:${PORT}`);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down scraper server...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down scraper server...');
  server.close(() => process.exit(0));
});
