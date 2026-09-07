-- PostgreSQL Database Migration Script for FinTrack v2
-- 04-v2-migration.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Alter transactions table to support custom user description, ignoring, and split indicators
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS user_description TEXT,
    ADD COLUMN IF NOT EXISTS is_ignored BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_split BOOLEAN NOT NULL DEFAULT false;

-- 2. Transaction Splits Table
CREATE TABLE IF NOT EXISTS transaction_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_splits_transaction_id ON transaction_splits(transaction_id);

-- 3. Transaction Links Table (Bidirectional Linking: charges, refunds, corrections)
CREATE TABLE IF NOT EXISTS transaction_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id_a UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    transaction_id_b UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    link_type VARCHAR(50) NOT NULL DEFAULT 'related',
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_transaction_pair UNIQUE (transaction_id_a, transaction_id_b),
    CONSTRAINT chk_different_transactions CHECK (transaction_id_a <> transaction_id_b)
);
CREATE INDEX IF NOT EXISTS idx_links_tx_a ON transaction_links(transaction_id_a);
CREATE INDEX IF NOT EXISTS idx_links_tx_b ON transaction_links(transaction_id_b);

-- 4. Transaction Notes Table
CREATE TABLE IF NOT EXISTS transaction_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notes_transaction_id ON transaction_notes(transaction_id);

-- 5. Categories Table with Income/Expense Separation
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
CREATE INDEX IF NOT EXISTS idx_categories_user_type ON categories(user_id, type);

-- 6. Seed Default System Categories (21 categories)
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
  ('00000000-0000-0000-0000-000000000001', 'מכשירים חשמליים', 'Electronics', 'expense', '#0ea5e9', 'zap', true, 12),
  ('00000000-0000-0000-0000-000000000001', 'ספורט', 'Sport', 'expense', '#84cc16', 'dumbbell', true, 13),
  ('00000000-0000-0000-0000-000000000001', 'נסיעות', 'Travel', 'expense', '#f43f5e', 'plane', true, 14),
  ('00000000-0000-0000-0000-000000000001', 'מתנות', 'Gifts', 'expense', '#fb923c', 'gift', true, 15),
  ('00000000-0000-0000-0000-000000000001', 'חשבונות', 'Bills', 'expense', '#94a3b8', 'file-text', true, 16),
  ('00000000-0000-0000-0000-000000000001', 'משכורת', 'Salary', 'income', '#22c55e', 'briefcase', true, 17),
  ('00000000-0000-0000-0000-000000000001', 'העברה', 'Transfer', 'income', '#4ade80', 'arrow-left-right', true, 18),
  ('00000000-0000-0000-0000-000000000001', 'זיכוי', 'Refund', 'income', '#86efac', 'undo', true, 19),
  ('00000000-0000-0000-0000-000000000001', 'השקעות', 'Investments', 'income', '#fbbf24', 'trending-up', true, 20),
  ('00000000-0000-0000-0000-000000000001', 'אחר', 'Other', 'both', '#94a3b8', 'more-horizontal', true, 99)
ON CONFLICT (user_id, name) DO NOTHING;

-- 7. Grant Permissions to api_user
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE transaction_splits TO api_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE transaction_links TO api_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE transaction_notes TO api_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE categories TO api_user;
GRANT UPDATE (is_notified, category, user_description, is_ignored, is_split) ON TABLE transactions TO api_user;
