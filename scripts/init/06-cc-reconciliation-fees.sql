-- Migration 06: CC Reconciliation Fees & Billing Columns
-- Ensures columns exist on existing production databases

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_cc_billing BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS original_currency VARCHAR(10);
CREATE INDEX IF NOT EXISTS idx_transactions_cc_billing ON transactions(is_cc_billing);

ALTER TABLE transaction_links ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE transaction_links ADD COLUMN IF NOT EXISTS fee_category VARCHAR(100) DEFAULT 'עמלות';
ALTER TABLE transaction_links ADD COLUMN IF NOT EXISTS is_fee_classified BOOLEAN DEFAULT false;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE transaction_links TO api_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE transaction_links TO finance_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE transactions TO api_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE transactions TO finance_admin;
