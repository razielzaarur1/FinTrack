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
      return reply.code(500).send({ error: 'Internal Server Error' });
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
      return reply.code(500).send({ error: 'Internal Server Error' });
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

    // Safety limit enforcement: Minimum 3 hours interval between scrape runs
    if (settings.scrapeIntervalCreditCardsHours !== undefined) {
      const val = parseFloat(settings.scrapeIntervalCreditCardsHours);
      settings.scrapeIntervalCreditCardsHours = Math.max(3, isNaN(val) ? 4 : val);
    }
    if (settings.scrapeIntervalBanksHours !== undefined) {
      const val = parseFloat(settings.scrapeIntervalBanksHours);
      settings.scrapeIntervalBanksHours = Math.max(3, isNaN(val) ? 8 : val);
    }
    if (settings.notifyMaxAgeDays !== undefined) {
      const val = parseInt(settings.notifyMaxAgeDays, 10);
      settings.notifyMaxAgeDays = Math.max(1, isNaN(val) ? 7 : val);
    }
    if (settings.monthStartDay !== undefined) {
      const val = parseInt(settings.monthStartDay, 10);
      settings.monthStartDay = isNaN(val) ? 10 : Math.min(31, Math.max(1, val));
    }

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

      // Dynamically push updated Telegram config to Notifier service
      try {
        await fetch(`${NOTIFIER_URL.replace(/\/$/, '')}/api/telegram/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            botToken: settings.telegramBotToken || '',
            chatId: settings.telegramChatId || null,
            tmaBaseUrl: settings.tmaBaseUrl || null,
          }),
          signal: AbortSignal.timeout(5000),
        });
      } catch (notifErr) {
        fastify.log.warn(`Failed to push updated telegram config to notifier: ${notifErr.message}`);
      }

      return reply.code(200).send(result.rows[0]);
    } catch (err) {
      fastify.log.error(err, 'Failed to update system settings');
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  // GET /telegram/status - Get Telegram Bot live connection status
  fastify.get('/telegram/status', async (request, reply) => {
    try {
      const res = await fetch(`${NOTIFIER_URL.replace(/\/$/, '')}/api/telegram/status`, {
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const data = await res.json();
        return reply.code(200).send(data);
      }
      return reply.code(200).send({ configured: false, active: false });
    } catch (err) {
      return reply.code(200).send({ configured: false, active: false, error: err.message });
    }
  });

  // POST /telegram/test - Dispatch a test message to Telegram
  fastify.post('/telegram/test', async (request, reply) => {
    try {
      const settingsRes = await pool.query(
        `SELECT settings FROM system_settings WHERE user_id = $1`,
        [DEFAULT_USER_ID]
      );
      const settings = settingsRes.rows[0]?.settings || {};
      const chatId = request.body?.chatId || settings.telegramChatId;

      const res = await fetch(`${NOTIFIER_URL.replace(/\/$/, '')}/api/notify/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId }),
        signal: AbortSignal.timeout(8000),
      });

      const responseText = await res.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { message: responseText };
      }

      if (!res.ok) {
        return reply.code(res.status).send(data);
      }
      return reply.code(200).send(data);
    } catch (err) {
      return reply.code(500).send({ error: err.message });
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

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE /transactions - Delete ALL transactions, splits, links, notes
  // ──────────────────────────────────────────────────────────────────────────
  fastify.delete('/transactions', async (request, reply) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Delete all splits, links, notes
      await client.query('DELETE FROM transaction_splits');
      await client.query('DELETE FROM transaction_links');
      await client.query('DELETE FROM transaction_notes');

      // 2. Delete all transactions
      const txResult = await client.query('DELETE FROM transactions');

      // 3. Reset balances & scraping status on bank_accounts
      await client.query(
        `UPDATE bank_accounts
         SET balance = 0.00,
             last_scraped_at = NULL,
             last_scrape_error = NULL
         WHERE user_id = $1`,
        [DEFAULT_USER_ID]
      );

      await client.query('COMMIT');

      return reply.status(200).send({
        success: true,
        message: 'All transactions deleted successfully',
        deletedTransactionsCount: txResult.rowCount,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      fastify.log.error(err, 'Failed to delete all transactions');
      return reply.status(500).send({
        success: false,
        stage: 'DB_DELETE_ALL_TRANSACTIONS',
        error: err.message,
      });
    } finally {
      client.release();
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE /data - Factory Reset: Delete ALL accounts, transactions, rules, budgets, goals
  // ──────────────────────────────────────────────────────────────────────────
  fastify.delete('/data', async (request, reply) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Delete all transaction sub-records and transactions
      await client.query('DELETE FROM transaction_splits');
      await client.query('DELETE FROM transaction_links');
      await client.query('DELETE FROM transaction_notes');
      await client.query('DELETE FROM transactions');

      // 2. Delete all bank accounts
      await client.query('DELETE FROM bank_accounts WHERE user_id = $1', [DEFAULT_USER_ID]);

      // 3. Delete all category rules learned by user
      await client.query('DELETE FROM user_category_rules WHERE user_id = $1', [DEFAULT_USER_ID]);

      // 4. Delete budgets and goals
      await client.query('DELETE FROM budgets WHERE user_id = $1', [DEFAULT_USER_ID]);
      await client.query('DELETE FROM goals WHERE user_id = $1', [DEFAULT_USER_ID]);

      // 5. Delete custom categories created by user (preserve system categories)
      await client.query('DELETE FROM categories WHERE user_id = $1 AND is_system = false', [DEFAULT_USER_ID]);

      // 6. Reset system settings
      await client.query(
        `UPDATE system_settings SET settings = '{}'::jsonb WHERE user_id = $1`,
        [DEFAULT_USER_ID]
      );

      await client.query('COMMIT');

      return reply.status(200).send({
        success: true,
        message: 'All system data wiped and reset successfully',
      });
    } catch (err) {
      await client.query('ROLLBACK');
      fastify.log.error(err, 'Failed to wipe system data');
      return reply.status(500).send({
        success: false,
        stage: 'DB_WIPE_ALL_DATA',
        error: err.message,
      });
    } finally {
      client.release();
    }
  });
}
