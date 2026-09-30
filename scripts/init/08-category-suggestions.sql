-- 08-category-suggestions.sql
-- Table for AI-driven category and subcategory recommendations

CREATE TABLE IF NOT EXISTS category_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    name_en VARCHAR(100),
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    type VARCHAR(10) NOT NULL DEFAULT 'expense',
    color VARCHAR(7) DEFAULT '#6366f1',
    icon VARCHAR(50) DEFAULT 'tag',
    reason TEXT,
    sample_transaction_ids JSONB DEFAULT '[]',
    sample_merchants JSONB DEFAULT '[]',
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'dismissed'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cat_suggestions_user_status ON category_suggestions(user_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE category_suggestions TO api_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE category_suggestions TO finance_admin;
