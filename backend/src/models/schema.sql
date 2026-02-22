-- ============================================================================
-- FATURAL - Full Database Schema
-- PostgreSQL + pgvector
-- Multi-tenant Kosovo Accounting Platform
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "vector";         -- pgvector for duplicate detection

-- ============================================================================
-- 1. COMPANIES (Multi-tenant root)
-- ============================================================================
CREATE TABLE companies (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(255) NOT NULL,
    tax_number          VARCHAR(100) UNIQUE NOT NULL,  -- Kosovo NUI
    email               VARCHAR(255) NOT NULL,
    phone               VARCHAR(50),
    address             TEXT,

    -- Subscription & limits
    is_active           BOOLEAN NOT NULL DEFAULT true,
    subscription_tier   VARCHAR(50) NOT NULL DEFAULT 'free',  -- free | pro | enterprise
    monthly_scan_limit  INTEGER NOT NULL DEFAULT 100,
    monthly_scans_used  INTEGER NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_companies_tax_number ON companies (tax_number);
CREATE INDEX idx_companies_is_active  ON companies (is_active);

-- ============================================================================
-- 2. USERS (Scoped to a company)
-- ============================================================================
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

    email               VARCHAR(255) UNIQUE NOT NULL,
    hashed_password     VARCHAR(255) NOT NULL,
    first_name          VARCHAR(255),
    last_name           VARCHAR(255),
    role                VARCHAR(50) NOT NULL DEFAULT 'user',  -- admin | user | viewer

    is_active           BOOLEAN NOT NULL DEFAULT true,

    -- Two-Factor Authentication
    two_factor_enabled  BOOLEAN NOT NULL DEFAULT false,
    two_factor_secret   VARCHAR(255),

    -- User preferences (CSV export columns, etc.)
    csv_export_columns  JSONB,  -- e.g. ["date","merchant","amount",...]

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login          TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_company_id ON users (company_id);
CREATE INDEX idx_users_email      ON users (email);

-- ============================================================================
-- 3. INVITATIONS (Admin-generated invite codes)
-- ============================================================================
CREATE TABLE invitations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    created_by      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    email           VARCHAR(255) NOT NULL,
    code            VARCHAR(64) UNIQUE NOT NULL,
    is_used         BOOLEAN NOT NULL DEFAULT false,
    used_by         UUID REFERENCES users(id),

    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invitations_code       ON invitations (code);
CREATE INDEX idx_invitations_company_id ON invitations (company_id);

-- ============================================================================
-- 4. EXPENSE BATCHES (Groups of receipts/expenses)
-- ============================================================================
CREATE TABLE expense_batches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    name            VARCHAR(255) NOT NULL DEFAULT 'Default Batch',
    description     TEXT,
    total_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
    status          VARCHAR(50) NOT NULL DEFAULT 'open',  -- open | closed

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_batches_company_id ON expense_batches (company_id);
CREATE INDEX idx_batches_user_id    ON expense_batches (user_id);

-- ============================================================================
-- 5. BILLS / RECEIPTS (Scanned documents)
-- ============================================================================
CREATE TABLE bills (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    batch_id            UUID REFERENCES expense_batches(id) ON DELETE SET NULL,

    -- File storage
    original_filename   VARCHAR(255) NOT NULL,
    storage_path        VARCHAR(500) NOT NULL,  -- GCS path
    file_size_bytes     INTEGER,
    mime_type           VARCHAR(100),

    -- AI Extraction (top-level data from Gemini)
    vendor_name         VARCHAR(255),
    vendor_tax_number   VARCHAR(100),            -- Kosovo NUI
    bill_number         VARCHAR(100),
    bill_date           DATE,
    total_amount        NUMERIC(12,2),
    subtotal            NUMERIC(12,2),
    vat_8_amount        NUMERIC(12,2),
    vat_18_amount       NUMERIC(12,2),
    total_vat           NUMERIC(12,2),
    currency            VARCHAR(10) NOT NULL DEFAULT 'EUR',
    payment_method      VARCHAR(50),

    -- Raw extraction JSON
    raw_extraction      JSONB,

    -- Duplicate detection using pgvector (768-dim embedding)
    visual_fingerprint  vector(768),

    -- Processing status
    status              VARCHAR(50) NOT NULL DEFAULT 'pending',
        -- pending | queued | processing | processed | failed | duplicate

    error_message       TEXT,
    confidence_score    REAL,

    -- Duplicate tracking
    is_duplicate        BOOLEAN NOT NULL DEFAULT false,
    duplicate_of_id     UUID REFERENCES bills(id),
    similarity_score    REAL,

    -- Timestamps
    processed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Multi-tenant isolation
CREATE INDEX idx_bills_company_id            ON bills (company_id);
CREATE INDEX idx_bills_user_id               ON bills (user_id);
CREATE INDEX idx_bills_batch_id              ON bills (batch_id);
CREATE INDEX idx_bills_status                ON bills (status);
CREATE INDEX idx_bills_bill_date             ON bills (bill_date);
CREATE INDEX idx_bills_vendor_tax_number     ON bills (vendor_tax_number);
CREATE INDEX idx_bills_bill_number           ON bills (bill_number);
CREATE INDEX idx_bills_company_status        ON bills (company_id, status);

-- HNSW index for fast approximate nearest-neighbour on embeddings
CREATE INDEX idx_bills_fingerprint_hnsw ON bills
    USING hnsw (visual_fingerprint vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- 6. EXPENSES (Individual line items - the core accounting table)
--    Has ALL Kosovo-specific fields from the old app
-- ============================================================================
CREATE TABLE expenses (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bill_id             UUID REFERENCES bills(id) ON DELETE SET NULL,
    batch_id            UUID REFERENCES expense_batches(id) ON DELETE SET NULL,

    -- Core fields
    name                VARCHAR(255) NOT NULL,              -- Item description
    category            VARCHAR(255) NOT NULL,              -- Albanian sub-category code
    amount              NUMERIC(12,2) NOT NULL,
    date                DATE NOT NULL,
    merchant            VARCHAR(255),

    -- Kosovo VAT
    vat_code            VARCHAR(255),                       -- One of the 15 Kosovo VAT codes
    tvsh_percentage     REAL NOT NULL DEFAULT 0,            -- VAT percentage (0, 8, 18)

    -- Kosovo identifiers
    nui                 VARCHAR(100),                       -- Numri Unik Identifikues
    nr_fiskal           VARCHAR(100),                       -- Fiscal receipt number
    numri_i_tvsh_se     VARCHAR(100),                       -- VAT registration number

    -- Quantity & unit
    sasia               REAL DEFAULT 1,                     -- Quantity
    njesia              VARCHAR(50) DEFAULT 'cope',         -- Unit (cope, kg, L, etc.)

    -- Extra
    description         TEXT,
    page_number         INTEGER DEFAULT 1,                  -- Which page of the receipt

    -- QuickBooks sync
    quickbooks_id       VARCHAR(100),                       -- ID in QuickBooks
    quickbooks_synced   BOOLEAN NOT NULL DEFAULT false,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_company_id ON expenses (company_id);
CREATE INDEX idx_expenses_user_id    ON expenses (user_id);
CREATE INDEX idx_expenses_bill_id    ON expenses (bill_id);
CREATE INDEX idx_expenses_batch_id   ON expenses (batch_id);
CREATE INDEX idx_expenses_date       ON expenses (date);
CREATE INDEX idx_expenses_category   ON expenses (category);
CREATE INDEX idx_expenses_merchant   ON expenses (merchant);

-- ============================================================================
-- 7. QUICKBOOKS INTEGRATIONS (Per-user OAuth tokens)
-- ============================================================================
CREATE TABLE quickbooks_integrations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    realm_id        VARCHAR(100) NOT NULL,      -- QuickBooks company ID
    access_token    TEXT NOT NULL,
    refresh_token   TEXT NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_qb_user_id ON quickbooks_integrations (user_id);

-- ============================================================================
-- 8. AUDIT LOGS
-- ============================================================================
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),

    action          VARCHAR(100) NOT NULL,       -- bill_uploaded, expense_deleted, etc.
    resource_type   VARCHAR(50),                 -- bill, expense, user
    resource_id     UUID,
    details         JSONB,
    ip_address      VARCHAR(50),
    user_agent      VARCHAR(500),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_company_id  ON audit_logs (company_id);
CREATE INDEX idx_audit_created_at  ON audit_logs (created_at);
CREATE INDEX idx_audit_action      ON audit_logs (action);

-- ============================================================================
-- 9. REFRESH TOKENS (for JWT rotation)
-- ============================================================================
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       VARCHAR(500) UNIQUE NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_token   ON refresh_tokens (token);

-- ============================================================================
-- HELPER: Auto-update updated_at columns
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_companies_updated_at       BEFORE UPDATE ON companies       FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_users_updated_at           BEFORE UPDATE ON users           FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_batches_updated_at         BEFORE UPDATE ON expense_batches FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_bills_updated_at           BEFORE UPDATE ON bills           FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_expenses_updated_at        BEFORE UPDATE ON expenses        FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_qb_updated_at             BEFORE UPDATE ON quickbooks_integrations FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
