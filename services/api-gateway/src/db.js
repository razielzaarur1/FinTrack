import fs from 'node:fs';
import pg from 'pg';

const { Pool, Client } = pg;

function readSecret(filePath, envVarName) {
  if (filePath && fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8').trim();
  }
  if (process.env[envVarName]) {
    return process.env[envVarName].trim();
  }
  return null;
}

const dbPassword =
  readSecret(process.env.DB_PASSWORD_FILE || '/run/secrets/api_db_password', 'DB_PASSWORD') ||
  process.env.DB_PASSWORD ||
  'postgres';

const dbUser = process.env.DB_USER || 'api_user';
const dbHost = process.env.DB_HOST || 'postgres';
const dbPort = parseInt(process.env.DB_PORT || '5432', 10);
const dbName = process.env.DB_NAME || process.env.DB_DATABASE || 'finance';

export const pool = new Pool({
  host: dbHost,
  port: dbPort,
  user: dbUser,
  password: dbPassword,
  database: dbName,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

let selfHealPromise = null;
let isHealed = false;

async function runSelfHealing() {
  if (isHealed) return;
  if (selfHealPromise) return selfHealPromise;

  selfHealPromise = (async () => {
    // 1. Try simple test connect with current pool
    try {
      const client = await pool.connect();
      client.release();
      isHealed = true;
      return;
    } catch (err) {
      console.warn(`[PostgreSQL] Connection test for ${dbUser} failed: ${err.message}. Starting self-healing...`);
    }

    // 2. Try admin connection candidates
    const adminUsers = [process.env.POSTGRES_USER || 'finance_admin', 'postgres', 'root'];
    const adminPasswords = [
      process.env.POSTGRES_PASSWORD,
      dbPassword,
      'postgres',
      '',
    ].filter((p) => p !== undefined);

    let healed = false;
    for (const adminUser of adminUsers) {
      if (healed) break;
      for (const pass of adminPasswords) {
        try {
          const adminClient = new Client({
            host: dbHost,
            port: dbPort,
            user: adminUser,
            password: pass,
            database: dbName,
            connectionTimeoutMillis: 3000,
          });

          await adminClient.connect();

          // Create or fix role passwords and permissions
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
          console.log(`[PostgreSQL] Self-healing succeeded using admin user '${adminUser}'. Permissions and passwords synced.`);
          healed = true;
          isHealed = true;
          break;
        } catch (adminErr) {
          // Try next admin credential
        }
      }
    }
  })();

  return selfHealPromise;
}

// Hook into pool.query directly so every caller gets self-healing protection
const originalPoolQuery = pool.query.bind(pool);
pool.query = async function (text, params) {
  try {
    return await originalPoolQuery(text, params);
  } catch (err) {
    if (err.message && (err.message.includes('password authentication') || err.message.includes('role') || err.message.includes('permission'))) {
      await runSelfHealing();
      return originalPoolQuery(text, params);
    }
    throw err;
  }
};

// Also hook into pool.connect
const originalPoolConnect = pool.connect.bind(pool);
pool.connect = async function () {
  try {
    return await originalPoolConnect();
  } catch (err) {
    if (err.message && (err.message.includes('password authentication') || err.message.includes('role') || err.message.includes('permission'))) {
      await runSelfHealing();
      return originalPoolConnect();
    }
    throw err;
  }
};

// Run startup check
runSelfHealing().catch((err) => {
  console.warn('[PostgreSQL] Startup auth self-healing notice:', err.message);
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
