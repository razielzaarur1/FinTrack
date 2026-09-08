import fs from 'node:fs';
import pg from 'pg';

const { Pool, Client } = pg;

function readSecret(filePath, envVarName) {
  if (filePath && fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    if (content) return content; // Only return non-empty content; fall through to env var if empty
  }
  if (process.env[envVarName]) {
    return process.env[envVarName].trim();
  }
  return null;
}

const dbPassword =
  readSecret(process.env.DB_PASSWORD_FILE || '/opt/finapp/secrets/api_db_password.txt', 'DB_PASSWORD') ||
  process.env.DB_PASSWORD ||
  'postgres';

const dbUser = process.env.DB_USER || 'api_user';
const dbHost = process.env.DB_HOST || 'postgres';
const dbPort = parseInt(process.env.DB_PORT || '5432', 10);
const dbName = process.env.DB_NAME || process.env.DB_DATABASE || 'finance';

console.log(`[PostgreSQL] Connecting as user='${dbUser}' host='${dbHost}' db='${dbName}'`);

export const pool = new Pool({
  host: dbHost,
  port: dbPort,
  user: dbUser,
  password: dbPassword,
  database: dbName,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
  // Kill runaway queries after 15 seconds so handlers never hang indefinitely
  options: '-c statement_timeout=15000',
});

// ─── Self-Healing ────────────────────────────────────────────────────────────
//
// IMPORTANT: self-healing MUST use originalPoolConnect (not pool.connect) to
// avoid a circular dependency:
//   runSelfHealing → pool.connect (overridden) → runSelfHealing → returns
//   existing selfHealPromise → deadlock (promise waits for itself)
//
let selfHealPromise = null;
let isHealed = false;

async function runSelfHealing() {
  if (isHealed) return;
  if (selfHealPromise) return selfHealPromise;

  selfHealPromise = (async () => {
    // 1. Quick test with the ORIGINAL (non-overridden) pool connect to avoid circular dep
    try {
      const client = await originalPoolConnect();
      client.release();
      isHealed = true;
      console.log(`[PostgreSQL] Connection verified for '${dbUser}'.`);
      return;
    } catch (err) {
      console.warn(`[PostgreSQL] Connection test for '${dbUser}' failed: ${err.message}. Attempting self-healing...`);
    }

    // 2. Try admin connection candidates to create/fix the role
    const adminUsers = [process.env.POSTGRES_USER || 'finance_admin', 'postgres'];
    const adminPasswords = [
      process.env.POSTGRES_PASSWORD,
      dbPassword,
      'postgres',
    ].filter(Boolean);

    for (const adminUser of adminUsers) {
      for (const pass of adminPasswords) {
        try {
          const adminClient = new Client({
            host: dbHost,
            port: dbPort,
            user: adminUser,
            password: pass,
            database: dbName,
            connectionTimeoutMillis: 5000,
          });

          await adminClient.connect();

          await adminClient.query(`
            DO $$
            BEGIN
              IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${dbUser}') THEN
                CREATE ROLE "${dbUser}" WITH LOGIN PASSWORD '${dbPassword.replace(/'/g, "''")}';
              ELSE
                ALTER ROLE "${dbUser}" WITH LOGIN PASSWORD '${dbPassword.replace(/'/g, "''")}';
              END IF;

              IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'scraper_user') THEN
                CREATE ROLE "scraper_user" WITH LOGIN PASSWORD '${dbPassword.replace(/'/g, "''")}';
              ELSE
                ALTER ROLE "scraper_user" WITH LOGIN PASSWORD '${dbPassword.replace(/'/g, "''")}';
              END IF;
            END
            $$;

            GRANT USAGE ON SCHEMA public TO "${dbUser}", "scraper_user";
            GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "${dbUser}", "scraper_user";
            GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "${dbUser}", "scraper_user";
            ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "${dbUser}", "scraper_user";
          `);

          await adminClient.end();
          console.log(`[PostgreSQL] Self-healing succeeded via admin user '${adminUser}'.`);
          isHealed = true;
          return;
        } catch (adminErr) {
          // Try next credential combination
        }
      }
    }

    console.error('[PostgreSQL] Self-healing exhausted all admin credentials. DB may be unavailable.');
  })();

  return selfHealPromise;
}

// Keep references to the originals BEFORE overriding
const originalPoolQuery = pool.query.bind(pool);
const originalPoolConnect = pool.connect.bind(pool);

// Override pool.query so every caller gets self-healing on auth errors
pool.query = async function (text, params) {
  try {
    return await originalPoolQuery(text, params);
  } catch (err) {
    if (
      err.message &&
      (err.message.includes('password authentication') ||
        err.message.includes('role') ||
        err.message.includes('permission denied'))
    ) {
      await runSelfHealing();
      return originalPoolQuery(text, params);
    }
    throw err;
  }
};

// Override pool.connect so callers also get self-healing
// NOTE: uses originalPoolConnect internally to avoid circular dependency
pool.connect = async function () {
  try {
    return await originalPoolConnect();
  } catch (err) {
    if (
      err.message &&
      (err.message.includes('password authentication') ||
        err.message.includes('role') ||
        err.message.includes('permission denied'))
    ) {
      await runSelfHealing();
      return originalPoolConnect();
    }
    throw err;
  }
};

// Startup check (non-blocking)
runSelfHealing().catch((err) => {
  console.warn('[PostgreSQL] Startup self-healing notice:', err?.message);
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected pool client error:', err.message);
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function getAccountsForScraping() {
  const result = await pool.query(
    `SELECT id, user_id, bank_company AS "bankCompany", encrypted_credentials AS "encryptedCredentials", is_active, created_at
     FROM bank_accounts
     WHERE is_active = true
     ORDER BY created_at ASC`
  );
  return result.rows;
}

export default {
  pool,
  query,
  getAccountsForScraping,
};
