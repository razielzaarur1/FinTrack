-- Migration 07: Prepaid Card, Include in Expenses, and Wallet Support
-- Adds settings columns to bank_accounts

ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS include_in_expenses BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS is_prepaid BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS prepaid_mode VARCHAR(50) NOT NULL DEFAULT 'link_offset';
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(6, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS show_balance BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS initial_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS enable_memo_amount_parsing BOOLEAN DEFAULT NULL;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS memo_parsing_scope VARCHAR(50) DEFAULT NULL;

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bank_accounts TO api_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bank_accounts TO finance_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE transactions TO api_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE transactions TO finance_admin;
