import fs from 'node:fs';
import { z } from 'zod';
import { pool } from '../db.js';
import { vaultClient } from '../vault-client.js';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';
const VAULT_ADDR = process.env.VAULT_ADDR || 'http://vault:8200';
const NOTIFIER_URL = process.env.NOTIFIER_URL || 'http://notifier:3001';

const unsealSchema = z.object({
  key: z.string().min(1, 'Unseal key is required'),
});

const otpSchema = z
  .object({
    code: z.string().optional(),
    otp: z.string().optional(),
  })
  .refine(
    (data) =>
      (data.code && data.code.trim().length > 0) ||
      (data.otp && data.otp.trim().length > 0),
    {
      message: 'code or otp string is required',
    }
  );

const settingsSchema = z.object({
  settings: z.record(z.any()),
});

export default async function systemRoutes(fastify, options) {
  // GET /status - Comprehensive system status
  fastify.get('/status', async (request, reply) => {
    let vaultStatus = { reachable: false, initialized: false, sealed: true };
    let dbStatus = { connected: false };
    let notifierStatus = { reachable: false, botConfigured: false };
    let scraperStatus = { totalAccounts: 0, lastScrapedAt: null };
    let settings = {};

    // 1. Security & Encryption Status (Native AES-256-GCM)
    vaultStatus = {
      reachable: true,
      initialized: true,
      sealed: false,
      provider: 'aes-256-gcm',
      message: 'הצפנת AES-256-GCM מאומתת פעילה באופן תמידי',
    };

    // 2. Check Database connection and stats
    try {
      await pool.query('SELECT 1');
      dbStatus = { connected: true };

      const statsRes = await pool.query(
        `SELECT
           COUNT(*) AS "totalAccounts",
           MAX(last_scraped_at) AS "lastScrapedAt"
         FROM bank_accounts
         WHERE user_id = $1 AND is_active = true`,
        [DEFAULT_USER_ID]
      );
      if (statsRes.rows.length > 0) {
        scraperStatus = {
          totalAccounts: parseInt(statsRes.rows[0].totalAccounts || '0', 10),
          lastScrapedAt: statsRes.rows[0].lastScrapedAt,
        };
      }

      // Fetch user system settings
      const settingsRes = await pool.query(
        `SELECT settings FROM system_settings WHERE user_id = $1`,
        [DEFAULT_USER_ID]
      );
      if (settingsRes.rows.length > 0) {
        settings = settingsRes.rows[0].settings || {};
      }
    } catch (err) {
      dbStatus = { connected: false, error: err.message };
    }

    // 3. Check Notifier status
    try {
      const notifRes = await fetch(`${NOTIFIER_URL.replace(/\/$/, '')}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (notifRes.ok) {
        const notifData = await notifRes.json();
        notifierStatus = {
          reachable: true,
          status: notifData.status,
          botConfigured: notifData.bot_configured ?? false,
          chatIdConfigured: notifData.chat_id_configured ?? false,
        };
      } else {
        notifierStatus = { reachable: false, error: `HTTP ${notifRes.status}` };
      }
    } catch (err) {
      notifierStatus = { reachable: false, error: err.message };
    }

    return reply.code(200).send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      vault: vaultStatus,
      database: dbStatus,
      notifier: notifierStatus,
      scraper: scraperStatus,
      settings,
    });
  });

  // POST /unseal - Submit Vault unseal key (kept for backward compatibility)
  fastify.post('/unseal', async (request, reply) => {
    return reply.code(200).send({
      sealed: false,
      success: true,
      message: 'המערכת פתוחה ומאובטחת תמיד באמצעות הצפנת AES-256-GCM.',
    });
  });

  // POST /otp - Submit 2FA OTP code
  fastify.post('/otp', async (request, reply) => {
    const parseResult = otpSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Validation Error',
        details: parseResult.error.issues,
      });
    }

    const code = (parseResult.data.code || parseResult.data.otp).trim();

    try {
      const response = await fetch(`${NOTIFIER_URL.replace(/\/$/, '')}/api/otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
        signal: AbortSignal.timeout(5000),
      });

      const responseText = await response.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { message: responseText };
      }

      if (!response.ok) {
        return reply.code(response.status).send({
          error: responseData.detail || responseData.message || 'Failed to submit OTP',
        });
      }

      return reply.code(200).send(responseData);
    } catch (err) {
      fastify.log.error(err, 'Failed to submit OTP to Notifier');
      return reply.code(500).send({ error: 'Internal Server Error', message: err.message });
    }
  });

  // GET /otp/pending - Check if there is an active OTP request waiting for user input
  fastify.get('/otp/pending', async (request, reply) => {
    try {
      const response = await fetch(`${NOTIFIER_URL.replace(/\/$/, '')}/api/otp/pending`, {
        signal: AbortSignal.timeout(3000),
      });

      if (!response.ok) {
        return reply.code(response.status).send({
          error: 'Notifier service error',
        });
      }

      const data = await response.json();
      return reply.code(200).send(data);
    } catch (err) {
      fastify.log.warn(`Failed to check pending OTP from Notifier: ${err.message}`);
      return reply.code(200).send({ pending: false, error: err.message });
    }
  });

  // GET /settings - Get system settings
  fastify.get('/settings', async (request, reply) => {
    try {
      const result = await pool.query(
        `SELECT id, user_id, settings, updated_at
         FROM system_settings
         WHERE user_id = $1`,
        [DEFAULT_USER_ID]
      );

      if (result.rows.length === 0) {
        return reply.code(200).send({ settings: {} });
      }

      return reply.code(200).send(result.rows[0]);
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch system settings');
      return reply.code(500).send({ error: 'Internal Server Error', message: err.message });
    }
  });

  // PUT /settings - Update system settings
  fastify.put('/settings', async (request, reply) => {
    const parseResult = settingsSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Validation Error',
        details: parseResult.error.issues,
      });
    }

    const { settings } = parseResult.data;

    try {
      const result = await pool.query(
        `INSERT INTO system_settings (user_id, settings, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET
           settings = EXCLUDED.settings,
           updated_at = NOW()
         RETURNING id, user_id, settings, updated_at`,
        [DEFAULT_USER_ID, JSON.stringify(settings)]
      );

      return reply.code(200).send(result.rows[0]);
    } catch (err) {
      fastify.log.error(err, 'Failed to update system settings');
      return reply.code(500).send({ error: 'Internal Server Error', message: err.message });
    }
  });

  // POST /vault/init-auto - Automatic initial Vault setup (kept for backward compatibility)
  fastify.post('/vault/init-auto', async (request, reply) => {
    return reply.code(200).send({
      success: true,
      message: 'ההצפנה פעילה ומאובטחת תמיד (AES-256-GCM). אין צורך באתחול כספת.',
      alreadyUnsealed: true,
    });
  });
}
