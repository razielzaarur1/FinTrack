-- PostgreSQL Database Initialization Script for Financial Management App

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- 2. Bank Accounts Table
CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bank_company VARCHAR(50) NOT NULL,
    encrypted_credentials TEXT NOT NULL,
    vault_key_version INT NOT NULL DEFAULT 1,
    display_name VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_scraped_at TIMESTAMPTZ,
    last_scrape_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Transactions Table
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_account_external UNIQUE (account_id, external_id)
);

-- 4. Budgets Table
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

-- 5. Goals Table
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

-- 6. System Settings Table
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_system_settings_user UNIQUE (user_id)
);

-- Crucial: Insert default user
INSERT INTO users (id, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', true)
ON CONFLICT (id) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bank_accounts_user_id ON bank_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_is_notified ON transactions(is_notified) WHERE is_notified = false;
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_system_settings_user_id ON system_settings(user_id);

-- Database Roles & User Creation
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'api_user') THEN
        CREATE ROLE api_user WITH LOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'scraper_user') THEN
        CREATE ROLE scraper_user WITH LOGIN;
    END IF;
END
$$;

-- Schema Permissions
GRANT USAGE ON SCHEMA public TO api_user, scraper_user;

-- Grants for api_user
GRANT SELECT, INSERT, UPDATE ON TABLE users TO api_user;
GRANT SELECT, INSERT, UPDATE ON TABLE bank_accounts TO api_user;
GRANT SELECT ON TABLE transactions TO api_user;
GRANT UPDATE (is_notified, category) ON TABLE transactions TO api_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE budgets TO api_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE goals TO api_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE system_settings TO api_user;

-- Grants for scraper_user
GRANT SELECT ON TABLE bank_accounts TO scraper_user;
GRANT REFERENCES ON TABLE bank_accounts TO scraper_user;
GRANT SELECT, INSERT, UPDATE ON TABLE transactions TO scraper_user;
