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
        // Run core DDL and extensions
        await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

        // 1. Users table & Passcode columns
        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              is_active BOOLEAN NOT NULL DEFAULT true,
              password_hash TEXT,
              passcode_salt TEXT
          );
          ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS passcode_salt TEXT;

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

          -- 11. User Category Learning Rules
          CREATE TABLE IF NOT EXISTS user_category_rules (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              merchant_pattern VARCHAR(255) NOT NULL,
              category VARCHAR(100) NOT NULL,
              sub_category VARCHAR(100),
              match_type VARCHAR(20) NOT NULL DEFAULT 'exact',
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT uq_user_merchant_pattern UNIQUE (user_id, merchant_pattern)
          );

          -- 12. Alterations & Migrations
          ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS billing_day INT DEFAULT 10;
          ALTER TABLE transactions ADD COLUMN IF NOT EXISTS processed_date DATE;
          ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_manual_category BOOLEAN NOT NULL DEFAULT false;
          ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_reviewed BOOLEAN NOT NULL DEFAULT false;
          ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN NOT NULL DEFAULT false;
          ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES categories(id) ON DELETE CASCADE;
          ALTER TABLE categories ADD COLUMN IF NOT EXISTS custom_svg TEXT;

          CREATE INDEX IF NOT EXISTS idx_transactions_processed_date ON transactions(processed_date);
          CREATE INDEX IF NOT EXISTS idx_transactions_reviewed ON transactions(is_reviewed);
          CREATE INDEX IF NOT EXISTS idx_user_category_rules_user_pattern ON user_category_rules(user_id, merchant_pattern);

          -- Clean up old legacy flat categories and migrate any transactions
          UPDATE transactions SET category = 'סופר ומכולת' WHERE category IN ('מכולת', 'food', 'groceries');
          UPDATE transactions SET category = 'מסעדות ופאבים' WHERE category IN ('מסעדות', 'dining');
          UPDATE transactions SET category = 'משק בית' WHERE category IN ('דיור', 'housing', 'חשבונות', 'utilities');
          UPDATE transactions SET category = 'רכב ותחבורה' WHERE category IN ('תחבורה', 'transportation');
          UPDATE transactions SET category = 'בריאות וטיפוח' WHERE category IN ('בריאות', 'healthcare');
          UPDATE transactions SET category = 'עושים קניות' WHERE category IN ('קניות', 'shopping');
          UPDATE transactions SET category = 'פנאי ותרבות' WHERE category IN ('בידור', 'entertainment');
          UPDATE transactions SET category = 'משפחה והשכלה' WHERE category IN ('חינוך', 'education');
          UPDATE transactions SET category = 'ביטוח דירה' WHERE category IN ('ביטוח', 'insurance');
          UPDATE transactions SET category = 'אלקטרוניקה' WHERE category IN ('טכנולוגיה', 'technology');
          UPDATE transactions SET category = 'הכנסות שונות' WHERE category IN ('מנויים', 'העברה', 'זיכוי', 'other_income');
          UPDATE transactions SET category = 'דיווידנדים ורווחים' WHERE category IN ('השקעות', 'investments');
          UPDATE transactions SET category = 'ללא סיווג' WHERE category IN ('אחר', 'other_expense', 'cash');

          -- Delete flat legacy categories that have no subcategories and are not valid income categories
          DELETE FROM categories 
          WHERE parent_id IS NULL 
            AND id NOT IN (SELECT DISTINCT parent_id FROM categories WHERE parent_id IS NOT NULL)
            AND name NOT IN ('משכורת', 'קצבה או מלגה', 'הכנסה מנכס', 'הכנסה מעסק', 'דיווידנדים ורווחים', 'הכנסות שונות');

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

          -- Populate processed_date from raw_data or date
          UPDATE transactions 
          SET processed_date = (raw_data->>'processedDate')::date
          WHERE processed_date IS NULL AND raw_data->>'processedDate' IS NOT NULL;

          UPDATE transactions 
          SET processed_date = date
          WHERE processed_date IS NULL;

          -- Ensure default virtual wallet account exists for user
          INSERT INTO bank_accounts (
            id, user_id, bank_company, encrypted_credentials, display_name, account_number, balance, is_active
          ) VALUES (
            '00000000-0000-0000-0000-000000000002',
            '00000000-0000-0000-0000-000000000001',
            'wallet',
            'none',
            'ארנק מזומנים',
            'CASH-01',
            0.00,
            true
          ) ON CONFLICT (id) DO NOTHING;
        `);

        // ── Seed MoneyApp Categories Hierarchy (11 main, 60+ subcategories) ──
        const moneyAppCats = [
            // Incomes
            { name: 'משכורת', nameEn: 'Salary', type: 'income', color: '#10b981', icon: 'Wallet', subs: [] },
            { name: 'קצבה או מלגה', nameEn: 'Allowance', type: 'income', color: '#10b981', icon: 'Landmark', subs: [] },
            { name: 'הכנסה מנכס', nameEn: 'Property Income', type: 'income', color: '#10b981', icon: 'Home', subs: [] },
            { name: 'הכנסה מעסק', nameEn: 'Business Income', type: 'income', color: '#10b981', icon: 'Briefcase', subs: [] },
            { name: 'דיווידנדים ורווחים', nameEn: 'Dividends', type: 'income', color: '#10b981', icon: 'TrendingUp', subs: [] },
            { name: 'הכנסות שונות', nameEn: 'Misc Income', type: 'income', color: '#10b981', icon: 'MoreHorizontal', subs: [] },
            // Expenses
            {
              name: 'משק בית', nameEn: 'Household', type: 'expense', color: '#6366f1', icon: 'Home',
              subs: [
                { name: 'טלפון ואינטרנט', icon: 'Tv' },
                { name: 'משכנתא', icon: 'Key' },
                { name: 'דמי שכירות', icon: 'Home' },
                { name: 'ארנונה', icon: 'Landmark' },
                { name: 'ועד בית', icon: 'Users' },
                { name: 'מים', icon: 'Droplet' },
                { name: 'גז והסקה', icon: 'Flame' },
                { name: 'חשמל', icon: 'Zap' },
                { name: 'ביטוח דירה', icon: 'Shield' },
                { name: 'אחזקת בית', icon: 'Hammer' },
                { name: 'ניקיון וכביסה', icon: 'Sparkles' },
                { name: 'גינון ונוי', icon: 'Flower' },
                { name: 'משק בית - שונות', icon: 'MoreHorizontal' },
              ]
            },
            {
              name: 'עושים קניות', nameEn: 'Shopping', type: 'expense', color: '#ec4899', icon: 'ShoppingBag',
              subs: [
                { name: 'סופר ומכולת', icon: 'ShoppingBag' },
                { name: 'ריהוט לבית', icon: 'Sofa' },
                { name: 'אלקטרוניקה', icon: 'Monitor' },
                { name: 'בגדים והנעלה', icon: 'Shirt' },
                { name: 'תכשיטים ושעונים', icon: 'Watch' },
                { name: 'טבק ועישון', icon: 'Wind' },
                { name: 'קניות - שונות', icon: 'MoreHorizontal' },
              ]
            },
            {
              name: 'רכב ותחבורה', nameEn: 'Transport', type: 'expense', color: '#f97316', icon: 'Car',
              subs: [
                { name: 'דלק וטעינה', icon: 'Fuel' },
                { name: 'השכרת רכב', icon: 'Car' },
                { name: 'תחבורה ציבורית', icon: 'Bus' },
                { name: 'חנייה', icon: 'Map' },
                { name: 'קנסות', icon: 'ScrollText' },
                { name: 'מוסך ואחזקה', icon: 'Wrench' },
                { name: 'כבישי אגרה', icon: 'Route' },
                { name: 'ביטוח רכב', icon: 'Shield' },
                { name: 'תחבורה - שונות', icon: 'MoreHorizontal' },
              ]
            },
            {
              name: 'בריאות וטיפוח', nameEn: 'Health', type: 'expense', color: '#f43f5e', icon: 'Heart',
              subs: [
                { name: 'רפואה משלימה', icon: 'Activity' },
                { name: 'ייעוץ וטיפול', icon: 'Stethoscope' },
                { name: 'ביטוחי בריאות', icon: 'HeartPulse' },
                { name: 'רפואת שיניים', icon: 'Activity' },
                { name: 'אופטיקה', icon: 'Eye' },
                { name: 'בתי מרקחת', icon: 'Pill' },
                { name: 'טיפולי יופי', icon: 'Scissors' },
                { name: 'כושר', icon: 'Dumbbell' },
                { name: 'בריאות - שונות', icon: 'MoreHorizontal' },
              ]
            },
            {
              name: 'משפחה והשכלה', nameEn: 'Family & Education', type: 'expense', color: '#14b8a6', icon: 'Users',
              subs: [
                { name: 'גן ובית ספר', icon: 'Baby' },
                { name: 'השכלה גבוהה', icon: 'GraduationCap' },
                { name: 'חוגים וקייטנות', icon: 'Tent' },
                { name: 'בייביסיטר', icon: 'User' },
                { name: 'משחקים ודמי כיס', icon: 'Gamepad2' },
                { name: 'מוצרים לגיל הרך', icon: 'Package' },
                { name: 'תמיכה ומזונות', icon: 'HandHeart' },
                { name: 'חיות מחמד', icon: 'Dog' },
                { name: 'משפחה - שונות', icon: 'MoreHorizontal' },
              ]
            },
            {
              name: 'פנאי ותרבות', nameEn: 'Leisure & Culture', type: 'expense', color: '#a855f7', icon: 'Ticket',
              subs: [
                { name: 'הופעות וקולנוע', icon: 'Ticket' },
                { name: 'מתנות ואירועים', icon: 'Gift' },
                { name: 'מוזיקה וקריאה', icon: 'Music' },
                { name: 'סדנאות', icon: 'BookOpen' },
                { name: 'תחביבים וספורט', icon: 'Bike' },
                { name: 'אירועי ספורט', icon: 'Trophy' },
                { name: 'פנאי - שונות', icon: 'MoreHorizontal' },
              ]
            },
            {
              name: 'אוכלים בחוץ', nameEn: 'Dining Out', type: 'expense', color: '#eab308', icon: 'Utensils',
              subs: [
                { name: 'מזון מהיר ומשלוחים', icon: 'Pizza' },
                { name: 'מסעדות ופאבים', icon: 'Coffee' },
                { name: 'אוכלים בחוץ - שונות', icon: 'Utensils' },
              ]
            },
            {
              name: 'חופשות וטיולים', nameEn: 'Travel & Vacation', type: 'expense', color: '#0ea5e9', icon: 'Plane',
              subs: [
                { name: 'טיסות', icon: 'Plane' },
                { name: 'אטרקציות', icon: 'Map' },
                { name: 'לינה', icon: 'Bed' },
                { name: 'חופשות - שונות', icon: 'MoreHorizontal' },
              ]
            },
            {
              name: 'שירותים עיסקיים', nameEn: 'Business Services', type: 'expense', color: '#64748b', icon: 'Briefcase',
              subs: [
                { name: 'דואר ומשלוחים', icon: 'Mail' },
                { name: 'הנה"ח ומשפטי', icon: 'FileText' },
                { name: 'שיווק ופרסום', icon: 'Printer' },
                { name: 'ייעוץ והשתלמויות', icon: 'Lightbulb' },
                { name: 'עסקי - שונות', icon: 'MoreHorizontal' },
              ]
            },
            {
              name: 'שירותים פיננסיים', nameEn: 'Financial Services', type: 'expense', color: '#0891b2', icon: 'Landmark',
              subs: [
                { name: 'פירעון הלוואה', icon: 'Percent' },
                { name: 'עמלות', icon: 'TrendingDown' },
                { name: 'תשלומי ריביות', icon: 'TrendingDown' },
                { name: 'פיננסי - שונות', icon: 'MoreHorizontal' },
              ]
            },
            {
              name: 'שונות', nameEn: 'Misc', type: 'expense', color: '#6b7280', icon: 'MoreHorizontal',
              subs: [
                { name: 'מיסים ורשויות', icon: 'Landmark' },
                { name: 'דת ותרומות', icon: 'HandHeart' },
                { name: 'הימורים', icon: 'Trophy' },
                { name: 'ללא סיווג', icon: 'MoreHorizontal' },
                { name: 'שונות', icon: 'MoreHorizontal' },
              ]
            },
          ];

          for (const mainCat of moneyAppCats) {
            const insertMainRes = await client.query(
              `INSERT INTO categories (user_id, name, name_en, type, color, icon, is_system, sort_order)
               VALUES ($1, $2, $3, $4, $5, $6, true, 0)
               ON CONFLICT (user_id, name) DO UPDATE 
                 SET color = EXCLUDED.color, icon = EXCLUDED.icon, name_en = EXCLUDED.name_en
               RETURNING id`,
              ['00000000-0000-0000-0000-000000000001', mainCat.name, mainCat.nameEn, mainCat.type, mainCat.color, mainCat.icon]
            );
            const parentId = insertMainRes.rows[0]?.id;

            if (parentId && mainCat.subs && mainCat.subs.length > 0) {
              for (const sub of mainCat.subs) {
                await client.query(
                  `INSERT INTO categories (user_id, name, name_en, type, color, icon, parent_id, is_system, sort_order)
                   VALUES ($1, $2, $2, $3, $4, $5, $6, true, 0)
                   ON CONFLICT (user_id, name) DO UPDATE
                     SET parent_id = EXCLUDED.parent_id, icon = EXCLUDED.icon, color = EXCLUDED.color`,
                  ['00000000-0000-0000-0000-000000000001', sub.name, mainCat.type, mainCat.color, sub.icon, parentId]
                );
              }
            }
          }

          // ── Auto-split multiple cards under the same login in transactions ──
          const accountsWithCards = await client.query(`
            SELECT t.account_id, 
                   COALESCE(NULLIF(t.raw_data->>'accountNumber', ''), NULLIF(t.raw_data->>'card', '')) AS card_num,
                   COUNT(*) AS count
            FROM transactions t
            JOIN bank_accounts b ON t.account_id = b.id
            WHERE b.bank_company IN ('max', 'cal', 'isracard', 'amex')
              AND (t.raw_data->>'accountNumber' IS NOT NULL OR t.raw_data->>'card' IS NOT NULL)
            GROUP BY t.account_id, card_num
          `);

          const accountCardsMap = {};
          for (const row of accountsWithCards.rows) {
            if (!row.card_num) continue;
            if (!accountCardsMap[row.account_id]) accountCardsMap[row.account_id] = [];
            accountCardsMap[row.account_id].push(row.card_num);
          }

          for (const [accId, cardNums] of Object.entries(accountCardsMap)) {
            if (cardNums.length > 1) {
              const accInfo = await client.query(`SELECT * FROM bank_accounts WHERE id = $1`, [accId]);
              if (accInfo.rows.length === 0) continue;
              const parent = accInfo.rows[0];

              // Assign first card to parent
              const firstCardLast4 = String(cardNums[0]).slice(-4);
              await client.query(`UPDATE bank_accounts SET account_number = $1 WHERE id = $2`, [firstCardLast4, accId]);

              // For each other card, ensure a separate row exists and move transactions
              for (let i = 1; i < cardNums.length; i++) {
                const otherCardLast4 = String(cardNums[i]).slice(-4);
                let childId;
                const childRes = await client.query(
                  `SELECT id FROM bank_accounts WHERE user_id = $1 AND bank_company = $2 AND account_number = $3 AND is_active = true`,
                  [parent.user_id, parent.bank_company, otherCardLast4]
                );

                if (childRes.rows.length > 0) {
                  childId = childRes.rows[0].id;
                } else {
                  const childDisplayName = `${parent.display_name || parent.bank_company} (כרטיס ${otherCardLast4})`;
                  const insertChild = await client.query(
                    `INSERT INTO bank_accounts (
                       user_id, bank_company, encrypted_credentials, display_name, account_number, balance, billing_day, is_active, last_scraped_at
                     ) VALUES ($1, $2, $3, $4, $5, 0, $6, true, NOW()) RETURNING id`,
                    [parent.user_id, parent.bank_company, parent.encrypted_credentials, childDisplayName, otherCardLast4, parent.billing_day || 10]
                  );
                  childId = insertChild.rows[0].id;
                }

                // Reassign transactions of this card to the child account
                await client.query(
                  `UPDATE transactions 
                   SET account_id = $1 
                   WHERE account_id = $2 
                     AND (raw_data->>'accountNumber' = $3 OR raw_data->>'card' = $3 OR raw_data->>'accountNumber' LIKE '%' || $4)`,
                  [childId, accId, cardNums[i], otherCardLast4]
                );
              }
            }
          }

        console.log('[PostgreSQL] Database schema verified and ready.');
        client.release();
        return;
      } catch (queryErr) {
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
