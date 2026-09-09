import crypto from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db.js';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

function hashPasscode(passcode, salt) {
  // scrypt is a memory-hard key derivation function, highly resistant to hardware brute-force
  return crypto.scryptSync(passcode, salt, 64).toString('hex');
}

function verifyPasscode(passcode, salt, storedHash) {
  try {
    const computedHash = hashPasscode(passcode, salt);
    const computedBuf = Buffer.from(computedHash, 'hex');
    const storedBuf = Buffer.from(storedHash, 'hex');
    if (computedBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(computedBuf, storedBuf);
  } catch (_) {
    return false;
  }
}

const setupSchema = z.object({
  passcode: z.string().min(4, 'Passcode must be at least 4 characters long').max(64),
});

const verifySchema = z.object({
  passcode: z.string().min(1, 'Passcode is required'),
});

const changeSchema = z.object({
  currentPasscode: z.string().min(1, 'Current passcode is required'),
  newPasscode: z.string().min(4, 'New passcode must be at least 4 characters long').max(64),
});

let authColumnsEnsured = false;
async function ensureAuthColumns() {
  if (authColumnsEnsured) return;
  try {
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS passcode_salt TEXT;
      INSERT INTO users (id, is_active)
      VALUES ('00000000-0000-0000-0000-000000000001', true)
      ON CONFLICT (id) DO NOTHING;
    `);
    authColumnsEnsured = true;
  } catch (e) {
    // Non-fatal, just log
    console.warn('[Auth] ensureAuthColumns notice:', e.message);
  }
}

export default async function authRoutes(fastify, options) {
  // GET /api/auth/status - Check if passcode is set up and if client has valid JWT
  fastify.get('/status', async (request, reply) => {
    try {
      if (!authColumnsEnsured) {
        await ensureAuthColumns();
      }

      const res = await pool.query(
        'SELECT password_hash FROM users WHERE id = $1',
        [DEFAULT_USER_ID]
      );

      const hasPasscode = Boolean(res.rows[0]?.password_hash);
      let authenticated = false;

      // Check if client provided valid JWT
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        try {
          const decoded = fastify.jwt.verify(token);
          if (decoded && decoded.userId) {
            authenticated = true;
          }
        } catch (_) {
          authenticated = false;
        }
      }

      return reply.code(200).send({
        hasPasscode,
        authenticated: hasPasscode ? authenticated : true, // If no passcode configured yet, treat as open for setup
        userId: DEFAULT_USER_ID,
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to check auth status');
      // Fail-safe: Never block user out on 500 when checking status
      return reply.code(200).send({
        hasPasscode: false,
        authenticated: true,
        userId: DEFAULT_USER_ID,
        warning: err.message,
      });
    }
  });

  // POST /api/auth/setup - First-time Master Passcode configuration
  fastify.post('/setup', async (request, reply) => {
    const parseResult = setupSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const { passcode } = parseResult.data;

    try {
      await ensureAuthColumns();

      // Check if already configured
      const existing = await pool.query(
        'SELECT password_hash FROM users WHERE id = $1',
        [DEFAULT_USER_ID]
      );

      if (existing.rows[0]?.password_hash) {
        return reply.code(400).send({
          error: 'קוד מאסטר כבר מוגדר במערכת. השתמש באימות או בשינוי קוד.',
        });
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const hash = hashPasscode(passcode, salt);

      await pool.query(
        `UPDATE users
         SET password_hash = $1, passcode_salt = $2
         WHERE id = $3`,
        [hash, salt, DEFAULT_USER_ID]
      );

      // Sign 30-day token
      const token = fastify.jwt.sign(
        { userId: DEFAULT_USER_ID, role: 'owner' },
        { expiresIn: '30d' }
      );

      return reply.code(200).send({
        success: true,
        token,
        message: 'Master passcode configured successfully',
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to setup master passcode');
      return reply.code(400).send({ error: 'שגיאה בהגדרת קוד המאסטר: ' + err.message });
    }
  });

  // POST /api/auth/verify - Validate Master Passcode and return JWT session
  fastify.post('/verify', async (request, reply) => {
    const parseResult = verifySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const { passcode } = parseResult.data;

    try {
      await ensureAuthColumns();

      const res = await pool.query(
        'SELECT password_hash, passcode_salt FROM users WHERE id = $1',
        [DEFAULT_USER_ID]
      );

      const user = res.rows[0];
      if (!user || !user.password_hash || !user.passcode_salt) {
        return reply.code(400).send({
          error: 'טרם הוגדר קוד גישה במערכת. אנא הגדר קוד ראשוני.',
        });
      }

      const isValid = verifyPasscode(passcode, user.passcode_salt, user.password_hash);
      if (!isValid) {
        return reply.code(401).send({
          error: 'קוד הגישה שגוי. אנא נסה שוב.',
        });
      }

      // Generate 30-day JWT session token
      const token = fastify.jwt.sign(
        { userId: DEFAULT_USER_ID, role: 'owner' },
        { expiresIn: '30d' }
      );

      return reply.code(200).send({
        success: true,
        token,
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to verify passcode');
      return reply.code(400).send({ error: 'שגיאה באימות קוד גישה: ' + (err.message || 'שגיאת שרת') });
    }
  });

  // POST /api/auth/change - Update existing passcode with verification
  fastify.post('/change', async (request, reply) => {
    const parseResult = changeSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Validation error',
        details: parseResult.error.flatten(),
      });
    }

    const { currentPasscode, newPasscode } = parseResult.data;

    try {
      const res = await pool.query(
        'SELECT password_hash, passcode_salt FROM users WHERE id = $1',
        [DEFAULT_USER_ID]
      );

      const user = res.rows[0];
      if (!user?.password_hash) {
        return reply.code(400).send({ error: 'No existing passcode to change.' });
      }

      const isValid = verifyPasscode(currentPasscode, user.passcode_salt, user.password_hash);
      if (!isValid) {
        return reply.code(401).send({ error: 'קוד הגישה הנוכחי שגוי.' });
      }

      const newSalt = crypto.randomBytes(16).toString('hex');
      const newHash = hashPasscode(newPasscode, newSalt);

      await pool.query(
        `UPDATE users
         SET password_hash = $1, passcode_salt = $2
         WHERE id = $3`,
        [newHash, newSalt, DEFAULT_USER_ID]
      );

      const token = fastify.jwt.sign(
        { userId: DEFAULT_USER_ID, role: 'owner' },
        { expiresIn: '30d' }
      );

      return reply.code(200).send({
        success: true,
        token,
        message: 'קוד הגישה עודכן בהצלחה',
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to change passcode');
      return reply.code(500).send({ error: 'Change passcode failed', message: err.message });
    }
  });
}
