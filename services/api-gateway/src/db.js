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

let selfHealed = false;

async function ensureUserAuthenticated() {
  if (selfHealed) return;

  try {
    const client = await pool.connect();
    client.release();
    selfHealed = true;
  } catch (err) {
    if (err.message && err.message.includes('password authentication failed')) {
      console.warn(`[PostgreSQL] Password authentication failed for ${dbUser}. Attempting admin self-healing...`);
      try {
        const adminClient = new Client({
          host: dbHost,
          port: dbPort,
          user: process.env.POSTGRES_USER || 'finance_admin',
          password: process.env.POSTGRES_PASSWORD || 'postgres',
          database: dbName,
        });

        await adminClient.connect();
        await adminClient.query(`ALTER ROLE "${dbUser}" WITH PASSWORD '${dbPassword.replace(/'/g, "''")}';`);
        await adminClient.query(`GRANT USAGE ON SCHEMA public TO "${dbUser}";`);
        await adminClient.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${dbUser}";`);
        await adminClient.end();

        console.log(`[PostgreSQL] Self-healing succeeded: Password updated for ${dbUser}.`);
        selfHealed = true;
      } catch (adminErr) {
        console.error(`[PostgreSQL] Self-healing failed: ${adminErr.message}`);
      }
    }
  }
}

// Pre-emptively verify connection on startup
ensureUserAuthenticated().catch((err) => {
  console.warn('[PostgreSQL] Initial connection check warning:', err.message);
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected pool client error:', err.message);
});

export async function query(text, params) {
  await ensureUserAuthenticated();
  return pool.query(text, params);
}

export async function getAccountsForScraping() {
  await ensureUserAuthenticated();
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
