CREATE TABLE IF NOT EXISTS episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES content_projects(id) ON DELETE CASCADE,
  title VARCHAR(300) NOT NULL,
  content_kind VARCHAR(40) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  locale VARCHAR(16) NOT NULL DEFAULT 'pt-BR',
  hook TEXT,
  description TEXT,
  target_duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_episodes_project_status_updated
  ON episodes (project_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES content_projects(id) ON DELETE CASCADE,
  episode_id UUID REFERENCES episodes(id) ON DELETE SET NULL,
  type VARCHAR(40) NOT NULL,
  storage_key VARCHAR(512) NOT NULL UNIQUE,
  mime VARCHAR(120) NOT NULL,
  size_bytes BIGINT NOT NULL,
  checksum VARCHAR(128),
  original_filename VARCHAR(320),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_assets_project_type
  ON media_assets (project_id, type);

CREATE INDEX IF NOT EXISTS idx_media_assets_episode
  ON media_assets (episode_id, sort_order);
