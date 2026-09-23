-- Social accounts linked to content projects + encrypted credential vault (MVP)
CREATE TABLE IF NOT EXISTS social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES content_projects(id) ON DELETE CASCADE,
  platform VARCHAR(40) NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'NEEDS_CREDENTIALS',
  external_account_id VARCHAR(320),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_accounts_project
  ON social_accounts (project_id);

CREATE INDEX IF NOT EXISTS idx_social_accounts_project_platform
  ON social_accounts (project_id, platform);

CREATE TABLE IF NOT EXISTS social_account_secrets (
  social_account_id UUID PRIMARY KEY REFERENCES social_accounts(id) ON DELETE CASCADE,
  encrypted_payload TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
