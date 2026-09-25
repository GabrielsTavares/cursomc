-- Phase 1 Foundation: identity + workspace + content projects
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(320) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS content_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  owner_user_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(200) NOT NULL,
  project_type VARCHAR(40) NOT NULL DEFAULT 'CREATOR',
  enabled_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
  locale_default VARCHAR(16) NOT NULL DEFAULT 'pt-BR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_projects_owner
  ON content_projects (owner_user_id);

CREATE INDEX IF NOT EXISTS idx_content_projects_workspace
  ON content_projects (workspace_id);
