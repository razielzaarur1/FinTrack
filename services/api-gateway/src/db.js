import fs from 'node:fs';
import pg from 'pg';

const { Pool } = pg;

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
  'postgres';

export const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'api_user',
  password: dbPassword,
  database: process.env.DB_NAME || process.env.DB_DATABASE || 'finance',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
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

