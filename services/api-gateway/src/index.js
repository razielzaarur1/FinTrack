import fs from 'node:fs';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';

import { pool } from './db.js';
import { vaultClient } from './vault-client.js';
import accountsRoutes from './routes/accounts.js';
import transactionsRoutes from './routes/transactions.js';
import internalRoutes from './routes/internal.js';

function readSecret(filePath, envVarName) {
  if (filePath && fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8').trim();
  }
  if (process.env[envVarName]) {
    return process.env[envVarName].trim();
  }
  return null;
}

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET =
  readSecret(process.env.JWT_SECRET_FILE || '/run/secrets/jwt_secret', 'JWT_SECRET') ||
  'development-insecure-jwt-secret-key-replace-in-prod';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

// Register Helmet for Security Headers
await fastify.register(helmet, {
  contentSecurityPolicy: process.env.NODE_ENV === 'production',
});

// Register Rate Limiting
await fastify.register(rateLimit, {
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  timeWindow: process.env.RATE_LIMIT_TIME_WINDOW || '1 minute',
});

// Register JWT Plugin
await fastify.register(jwt, {
  secret: JWT_SECRET,
});

// Authentication Decorator for protected routes
fastify.decorate('authenticate', async function (request, reply) {
  try {
    // If JWT verification is enabled
    if (process.env.ENABLE_JWT_AUTH === 'true') {
      await request.jwtVerify();
    }
  } catch (err) {
    return reply.code(401).send({ error: 'Unauthorized', message: err.message });
  }
});

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return reply.type('text/plain').code(200).send('OK');
});

// Register Application Routes
await fastify.register(accountsRoutes, { prefix: '/api/accounts' });
await fastify.register(transactionsRoutes, { prefix: '/api/transactions' });
await fastify.register(internalRoutes, { prefix: '/internal' });

// Graceful Shutdown Handler
const closeGracefully = async (signal) => {
  fastify.log.info(`Received ${signal}, starting graceful shutdown...`);

  try {
    vaultClient.close();
    await fastify.close();
    await pool.end();
    fastify.log.info('Graceful shutdown completed.');
    process.exit(0);
  } catch (err) {
    fastify.log.error(err, 'Error during graceful shutdown');
    process.exit(1);
  }
};

process.on('SIGINT', () => closeGracefully('SIGINT'));
process.on('SIGTERM', () => closeGracefully('SIGTERM'));

// Server Initialization
const start = async () => {
  try {
    // Try to authenticate Vault at startup (deferred if secrets not yet mounted in dev)
    try {
      await vaultClient.authenticate();
    } catch (vaultErr) {
      fastify.log.warn(`Vault initialization warning: ${vaultErr.message}`);
    }

    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`API Gateway server listening on http://${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error(err, 'Server failed to start');
    process.exit(1);
  }
};

start();
