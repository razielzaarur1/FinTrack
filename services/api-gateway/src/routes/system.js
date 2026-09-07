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

    // 1. Check Vault status
    try {
      const response = await fetch(`${VAULT_ADDR.replace(/\/$/, '')}/v1/sys/seal-status`, {
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok || response.status === 429) {
        const data = await response.json();
        vaultStatus = {
          reachable: true,
          initialized: data.initialized ?? true,
          sealed: data.sealed ?? false,
          progress: data.progress ?? 0,
          threshold: data.t ?? 0,
        };
      } else {
        vaultStatus = { reachable: true, error: `HTTP ${response.status}` };
      }
    } catch (err) {
      vaultStatus = { reachable: false, error: err.message };
    }

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

  // POST /unseal - Submit Vault unseal key
  fastify.post('/unseal', async (request, reply) => {
    const parseResult = unsealSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Validation Error',
        details: parseResult.error.issues,
      });
    }

    const { key } = parseResult.data;

    try {
      const vaultUrl = `${VAULT_ADDR.replace(/\/$/, '')}/v1/sys/unseal`;

      // 1. Check current seal status
      const statusRes = await fetch(`${VAULT_ADDR.replace(/\/$/, '')}/v1/sys/seal-status`);
      const statusData = await statusRes.json();

      if (statusData && statusData.sealed === false) {
        try { await vaultClient.authenticate(); } catch (_) {}
        return reply.code(200).send({ sealed: false, message: 'הכספת כבר פתוחה (Unsealed).' });
      }

      // 2. If progress is 0 and key1 file exists in secrets dir, apply key1 first!
      const key1File = '/opt/finapp/secrets/vault_unseal_key1.txt';
      if (statusData.progress === 0 && fs.existsSync(key1File)) {
        try {
          const key1 = fs.readFileSync(key1File, 'utf8').trim();
          if (key1) {
            await fetch(vaultUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key: key1 }),
            });
          }
        } catch (e) {
          fastify.log.warn(`Failed to auto-apply Key 1 from file: ${e.message}`);
        }
      }

      // 3. Apply user provided key
      const response = await fetch(vaultUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
        signal: AbortSignal.timeout(5000),
      });

      const data = await response.json();

      // 4. If Vault is unsealed now, trigger AppRole authentication
      if (data && data.sealed === false) {
        try {
          await vaultClient.authenticate();
        } catch (authErr) {
          fastify.log.warn(`Vault unsealed, but API Gateway re-auth failed: ${authErr.message}`);
        }
      }

      return reply.code(response.status).send(data);
    } catch (err) {
      fastify.log.error(err, 'Failed to unseal Vault');
      return reply.code(500).send({ error: 'Internal Server Error', message: err.message });
    }
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

  // POST /vault/init-auto - Automatic initial Vault setup if uninitialized
  fastify.post('/vault/init-auto', async (request, reply) => {
    try {
      // 1. Check if initialized
      const initCheckRes = await fetch(`${VAULT_ADDR.replace(/\/$/, '')}/v1/sys/init`);
      const initCheckData = await initCheckRes.json();

      if (initCheckData.initialized) {
        try {
          const sealCheck = await fetch(`${VAULT_ADDR.replace(/\/$/, '')}/v1/sys/seal-status`);
          const sealData = await sealCheck.json();
          if (sealData.sealed === false) {
            // Vault is already up — make sure vaultClient has a token so encrypt calls work
            if (!vaultClient.vault.token) {
              const envToken = process.env.VAULT_TOKEN;
              if (envToken) {
                vaultClient.vault.token = envToken;
                vaultClient.initialized = true;
              }
            }
            return reply.code(200).send({
              success: true,
              message: 'הכספת כבר מאותחלת ופתוחה (Unsealed).',
              alreadyUnsealed: true,
            });
          }
        } catch (_) {}

        return reply.code(400).send({
          error: 'הכספת כבר אותחלה בעבר ונמצאת במצב נעול. הזן את Unseal Key 2, או אפס את ווליום ה-Vault אם אין ברשותך את המפתח.',
        });
      }

      // 2. Initialize Vault with 2-of-2 Shamir keys
      const initRes = await fetch(`${VAULT_ADDR.replace(/\/$/, '')}/v1/sys/init`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret_shares: 2,
          secret_threshold: 2,
        }),
      });

      if (!initRes.ok) {
        const errText = await initRes.text();
        return reply.code(initRes.status).send({ error: `Vault init failed: ${errText}` });
      }

      const initData = await initRes.json();
      const unsealKey1 = initData.keys_base64[0];
      const unsealKey2 = initData.keys_base64[1];
      const rootToken = initData.root_token;

      // 3. Unseal with Key 1 and Key 2
      await fetch(`${VAULT_ADDR.replace(/\/$/, '')}/v1/sys/unseal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: unsealKey1 }),
      });

      await fetch(`${VAULT_ADDR.replace(/\/$/, '')}/v1/sys/unseal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: unsealKey2 }),
      });

      // 4. Configure Transit Secrets Engine
      await fetch(`${VAULT_ADDR.replace(/\/$/, '')}/v1/sys/mounts/transit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vault-Token': rootToken,
        },
        body: JSON.stringify({ type: 'transit' }),
      });

      // 5. Create Transit Key
      await fetch(`${VAULT_ADDR.replace(/\/$/, '')}/v1/transit/keys/bank-credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vault-Token': rootToken,
        },
      });

      // 6. Set token in vaultClient so API Gateway can encrypt immediately
      vaultClient.vault.token = rootToken;
      vaultClient.initialized = true;

      // Persist root token to secrets volume if writable
      try {
        fs.writeFileSync('/opt/finapp/secrets/vault_root_token.txt', rootToken, 'utf8');
      } catch (_) {}

      return reply.code(200).send({
        success: true,
        message: 'הכספת אותחלה ונפתחה בהצלחה!',
        unsealKey1,
        unsealKey2,
        rootToken,
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to auto-init Vault');
      return reply.code(500).send({ error: 'Internal Server Error', message: err.message });
    }
  });
}
