import fs from 'node:fs';
import pg from 'pg';

const { Pool } = pg;

function readSecret(filePath, envVarName) {
  if (filePath && fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8').trim();
      if (content) return content;
    } catch (_) {}
  }
  if (process.env[envVarName]) {
    return process.env[envVarName].trim();
  }
  return null;
}

const dbUser = process.env.DB_USER || process.env.POSTGRES_USER || 'finance_admin';
const dbPassword =
  readSecret(process.env.DB_PASSWORD_FILE || '/opt/finapp/secrets/api_db_password.txt', 'DB_PASSWORD') ||
  process.env.DB_PASSWORD ||
  process.env.POSTGRES_PASSWORD ||
  'postgres';

const dbHost = process.env.DB_HOST || 'postgres';
const dbPort = parseInt(process.env.DB_PORT || '5432', 10);
const dbName = process.env.DB_NAME || process.env.POSTGRES_DB || 'finance';

console.log(`[PostgreSQL] Configuring pool: user='${dbUser}', host='${dbHost}:${dbPort}', db='${dbName}'`);

export const pool = new Pool({
  host: dbHost,
  port: dbPort,
  user: dbUser,
  password: dbPassword,
  database: dbName,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
  options: '-c statement_timeout=15000',
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected error on idle client:', err.message);
});

/**
 * Ensures all required tables and seed records exist.
 * Runs automatically on startup with retry logic.
 */
async function ensureSchema() {
  const maxRetries = 10;
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    try {
      console.log(`[PostgreSQL] Checking and initializing database schema (attempt ${attempt}/${maxRetries})...`);
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        await client.query(`
          CREATE EXTENSION IF NOT EXISTS "pgcrypto";

          -- 1. Users table
          CREATE TABLE IF NOT EXISTS users (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              is_active BOOLEAN NOT NULL DEFAULT true
          );

          -- Ensure default user exists
          INSERT INTO users (id, is_active)
          VALUES ('00000000-0000-0000-0000-000000000001', true)
          ON CONFLICT (id) DO NOTHING;

          -- 2. Bank Accounts table
          CREATE TABLE IF NOT EXISTS bank_accounts (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              bank_company VARCHAR(50) NOT NULL,
              encrypted_credentials TEXT NOT NULL,
              vault_key_version INT NOT NULL DEFAULT 1,
              display_name VARCHAR(100),
              account_number VARCHAR(50),
              balance NUMERIC(14, 2) DEFAULT 0.00,
              is_active BOOLEAN NOT NULL DEFAULT true,
              last_scraped_at TIMESTAMPTZ,
              last_scrape_error TEXT,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          -- 3. Transactions table
          CREATE TABLE IF NOT EXISTS transactions (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
              external_id VARCHAR(255) NOT NULL,
              date DATE NOT NULL,
              amount NUMERIC(12, 2) NOT NULL,
              currency VARCHAR(10) NOT NULL DEFAULT 'ILS',
              description TEXT,
              merchant_name TEXT,
              category VARCHAR(100),
              status VARCHAR(50) NOT NULL DEFAULT 'completed',
              raw_data JSONB,
              is_notified BOOLEAN NOT NULL DEFAULT false,
              user_description TEXT,
              is_ignored BOOLEAN NOT NULL DEFAULT false,
              is_split BOOLEAN NOT NULL DEFAULT false,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT uq_account_external UNIQUE (account_id, external_id)
          );

          -- 4. Transaction Splits
          CREATE TABLE IF NOT EXISTS transaction_splits (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
              amount NUMERIC(12, 2) NOT NULL,
              category VARCHAR(100) NOT NULL,
              description TEXT,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          -- 5. Transaction Links
          CREATE TABLE IF NOT EXISTS transaction_links (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              transaction_id_a UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
              transaction_id_b UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
              link_type VARCHAR(50) NOT NULL DEFAULT 'related',
              note TEXT,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT uq_transaction_pair UNIQUE (transaction_id_a, transaction_id_b)
          );

          -- 6. Transaction Notes
          CREATE TABLE IF NOT EXISTS transaction_notes (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
              note TEXT NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          -- 7. Categories
          CREATE TABLE IF NOT EXISTS categories (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              name VARCHAR(100) NOT NULL,
              name_en VARCHAR(100),
              type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense', 'both')),
              color VARCHAR(7) NOT NULL DEFAULT '#6366f1',
              icon VARCHAR(50) DEFAULT 'tag',
              is_system BOOLEAN NOT NULL DEFAULT false,
              sort_order INT NOT NULL DEFAULT 0,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT uq_categories_user_name UNIQUE (user_id, name)
          );

          -- Seed categories
          INSERT INTO categories (user_id, name, name_en, type, color, icon, is_system, sort_order)
          VALUES
            ('00000000-0000-0000-0000-000000000001', 'מכולת', 'Groceries', 'expense', '#10b981', 'shopping-cart', true, 1),
            ('00000000-0000-0000-0000-000000000001', 'מסעדות', 'Dining', 'expense', '#f59e0b', 'utensils', true, 2),
            ('00000000-0000-0000-0000-000000000001', 'דיור', 'Housing', 'expense', '#3b82f6', 'home', true, 3),
            ('00000000-0000-0000-0000-000000000001', 'תחבורה', 'Transport', 'expense', '#8b5cf6', 'car', true, 4),
            ('00000000-0000-0000-0000-000000000001', 'בריאות', 'Health', 'expense', '#ef4444', 'heart-pulse', true, 5),
            ('00000000-0000-0000-0000-000000000001', 'קניות', 'Shopping', 'expense', '#ec4899', 'bag', true, 6),
            ('00000000-0000-0000-0000-000000000001', 'בידור', 'Entertainment', 'expense', '#f97316', 'gamepad-2', true, 7),
            ('00000000-0000-0000-0000-000000000001', 'חינוך', 'Education', 'expense', '#06b6d4', 'graduation-cap', true, 8),
            ('00000000-0000-0000-0000-000000000001', 'ביטוח', 'Insurance', 'expense', '#64748b', 'shield', true, 9),
            ('00000000-0000-0000-0000-000000000001', 'טכנולוגיה', 'Technology', 'expense', '#6366f1', 'laptop', true, 10),
            ('00000000-0000-0000-0000-000000000001', 'מנויים', 'Subscriptions', 'expense', '#a855f7', 'repeat', true, 11),
            ('00000000-0000-0000-0000-000000000001', 'חשבונות', 'Bills', 'expense', '#94a3b8', 'file-text', true, 12),
            ('00000000-0000-0000-0000-000000000001', 'משכורת', 'Salary', 'income', '#22c55e', 'briefcase', true, 13),
            ('00000000-0000-0000-0000-000000000001', 'העברה', 'Transfer', 'income', '#4ade80', 'arrow-left-right', true, 14),
            ('00000000-0000-0000-0000-000000000001', 'זיכוי', 'Refund', 'income', '#86efac', 'undo', true, 15),
            ('00000000-0000-0000-0000-000000000001', 'השקעות', 'Investments', 'income', '#fbbf24', 'trending-up', true, 16),
            ('00000000-0000-0000-0000-000000000001', 'אחר', 'Other', 'both', '#94a3b8', 'more-horizontal', true, 99)
          ON CONFLICT (user_id, name) DO NOTHING;

          -- 8. Budgets
          CREATE TABLE IF NOT EXISTS budgets (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              category VARCHAR(100) NOT NULL,
              monthly_limit NUMERIC(12, 2) NOT NULL,
              currency VARCHAR(10) NOT NULL DEFAULT 'ILS',
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT uq_budgets_user_category UNIQUE (user_id, category)
          );

          -- 9. Goals
          CREATE TABLE IF NOT EXISTS goals (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              title VARCHAR(255) NOT NULL,
              target_amount NUMERIC(12, 2) NOT NULL,
              current_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
              currency VARCHAR(10) NOT NULL DEFAULT 'ILS',
              target_date DATE,
              icon VARCHAR(50),
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          -- 10. System Settings
          CREATE TABLE IF NOT EXISTS system_settings (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              settings JSONB NOT NULL DEFAULT '{}'::jsonb,
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT uq_system_settings_user UNIQUE (user_id)
          );

          -- 11. Alterations & Migrations
          ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS billing_day INT DEFAULT 10;

          -- Correct past transactions where merchant_name was set to memo instead of actual store description
          UPDATE transactions 
          SET merchant_name = description,
              description = COALESCE(NULLIF(raw_data->>'memo', ''), description)
          WHERE raw_data->>'memo' IS NOT NULL 
            AND merchant_name = (raw_data->>'memo')
            AND description IS NOT NULL
            AND description <> (raw_data->>'memo');

          UPDATE transactions
          SET merchant_name = description
          WHERE (merchant_name IS NULL OR merchant_name = '') AND description IS NOT NULL;
        `);

        await client.query('COMMIT');
        console.log('[PostgreSQL] Database schema verified and ready.');
        client.release();
        return;
      } catch (queryErr) {
        await client.query('ROLLBACK');
        client.release();
        throw queryErr;
      }
    } catch (err) {
      console.warn(`[PostgreSQL] Connection/schema attempt ${attempt} failed: ${err.message}`);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        console.error('[PostgreSQL] Could not initialize database schema after all retries.');
      }
    }
  }
}

// Start schema initialization asynchronously in background on launch
ensureSchema().catch((err) => {
  console.error('[PostgreSQL] Unhandled error during ensureSchema:', err.message);
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
