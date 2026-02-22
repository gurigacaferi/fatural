-- ============================================================================
-- FATURAL – Incremental Migration
-- Applies only what is missing from the target schema.
-- Safe to run multiple times (all statements are idempotent).
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- Patch existing tables with new columns (ALTER TABLE IF NOT EXISTS column)
-- ============================================================================

-- companies: add new columns if missing
ALTER TABLE companies ADD COLUMN IF NOT EXISTS phone          VARCHAR(50);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS address        TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS city           VARCHAR(100);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS country        VARCHAR(100) DEFAULT 'Kosovo';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS monthly_scans_used   INT DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS monthly_scan_limit   INT DEFAULT 100;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_active      BOOLEAN DEFAULT TRUE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE companies ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_companies_tax_number ON companies (tax_number);
CREATE INDEX IF NOT EXISTS idx_companies_is_active  ON companies (is_active);

-- users: add new columns if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id    UUID REFERENCES companies(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role          VARCHAR(20) DEFAULT 'employee';
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name     VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret   TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled  BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS scan_count    INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active     BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by    UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_users_company_id ON users (company_id);
CREATE INDEX IF NOT EXISTS idx_users_email      ON users (email);

-- bills: add new columns if missing
ALTER TABLE bills ADD COLUMN IF NOT EXISTS user_id            UUID;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS batch_id           UUID;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS original_filename  VARCHAR(500);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS storage_path       TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS file_size_bytes    BIGINT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS mime_type          VARCHAR(100);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS vendor_name        VARCHAR(255);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS vendor_tax_number  VARCHAR(100);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS bill_number        VARCHAR(100);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS bill_date          DATE;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS total_amount       NUMERIC(12,2);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS currency           VARCHAR(10) DEFAULT 'EUR';
ALTER TABLE bills ADD COLUMN IF NOT EXISTS vat_amount         NUMERIC(12,2);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS confidence_score   NUMERIC(5,4);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS page_count         INT DEFAULT 1;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS is_duplicate       BOOLEAN DEFAULT FALSE;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS duplicate_of_id    UUID;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS similarity_score   NUMERIC(5,4);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS error_message      TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS embedding          vector(768);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS fingerprint        TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS processed_at       TIMESTAMPTZ;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS created_at         TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE bills ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_bills_company_id            ON bills (company_id);
CREATE INDEX IF NOT EXISTS idx_bills_user_id               ON bills (user_id);
CREATE INDEX IF NOT EXISTS idx_bills_batch_id              ON bills (batch_id);
CREATE INDEX IF NOT EXISTS idx_bills_status                ON bills (status);
CREATE INDEX IF NOT EXISTS idx_bills_bill_date             ON bills (bill_date);
CREATE INDEX IF NOT EXISTS idx_bills_vendor_tax_number     ON bills (vendor_tax_number);
CREATE INDEX IF NOT EXISTS idx_bills_bill_number           ON bills (bill_number);
CREATE INDEX IF NOT EXISTS idx_bills_company_status        ON bills (company_id, status);

-- audit_logs: add new columns if missing
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS company_id  UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_id     UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS action      VARCHAR(100);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details     JSONB;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address  INET;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent  TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_audit_company_id  ON audit_logs (company_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at  ON audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action      ON audit_logs (action);

-- ============================================================================
-- New tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS invitations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID NOT NULL REFERENCES companies(id),
    created_by    UUID NOT NULL,
    email         VARCHAR(255),
    code          VARCHAR(100) UNIQUE NOT NULL,
    role          VARCHAR(20) DEFAULT 'employee',
    used_at       TIMESTAMPTZ,
    expires_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_code       ON invitations (code);
CREATE INDEX IF NOT EXISTS idx_invitations_company_id ON invitations (company_id);

-- ============================================================================

CREATE TABLE IF NOT EXISTS expense_batches (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   UUID NOT NULL REFERENCES companies(id),
    user_id      UUID NOT NULL,
    name         VARCHAR(255),
    description  TEXT,
    bill_count   INT DEFAULT 0,
    total_amount NUMERIC(12,2) DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batches_company_id ON expense_batches (company_id);
CREATE INDEX IF NOT EXISTS idx_batches_user_id    ON expense_batches (user_id);

-- ============================================================================

CREATE TABLE IF NOT EXISTS expenses (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        UUID NOT NULL REFERENCES companies(id),
    user_id           UUID NOT NULL,
    bill_id           UUID REFERENCES bills(id),
    batch_id          UUID REFERENCES expense_batches(id),

    -- Core fields
    name              VARCHAR(500) NOT NULL,
    category          VARCHAR(100),
    amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
    date              DATE,
    merchant          VARCHAR(255),

    -- Kosovo-specific VAT & tax fields
    vat_code          VARCHAR(50),
    tvsh_percentage   NUMERIC(5,2) DEFAULT 0,
    nui               VARCHAR(100),          -- Numri Unik i Identifikimit
    nr_fiskal         VARCHAR(100),          -- Numri Fiskal
    numri_i_tvsh_se   VARCHAR(100),          -- Nr TVSH-se
    sasia             NUMERIC(10,3),         -- Sasia (quantity)
    njesia            VARCHAR(50),           -- Njësia (unit)

    -- Extra metadata
    description       TEXT,
    page_number       INT DEFAULT 1,
    is_deleted        BOOLEAN DEFAULT FALSE,
    deleted_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_company_id ON expenses (company_id);
CREATE INDEX IF NOT EXISTS idx_expenses_user_id    ON expenses (user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_bill_id    ON expenses (bill_id);
CREATE INDEX IF NOT EXISTS idx_expenses_batch_id   ON expenses (batch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date       ON expenses (date);
CREATE INDEX IF NOT EXISTS idx_expenses_category   ON expenses (category);
CREATE INDEX IF NOT EXISTS idx_expenses_merchant   ON expenses (merchant);

-- ============================================================================

CREATE TABLE IF NOT EXISTS quickbooks_integrations (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id       UUID NOT NULL REFERENCES companies(id),
    user_id          UUID NOT NULL,
    realm_id         VARCHAR(255),
    access_token     TEXT,
    refresh_token    TEXT,
    token_expires_at TIMESTAMPTZ,
    is_active        BOOLEAN DEFAULT TRUE,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_qb_user_id ON quickbooks_integrations (user_id);

-- ============================================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL,
    token      TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token   ON refresh_tokens (token);

-- ============================================================================
-- Done
-- ============================================================================
