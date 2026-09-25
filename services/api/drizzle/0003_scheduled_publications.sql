-- Scheduled publications (calendar + scheduler claim)
CREATE TABLE IF NOT EXISTS scheduled_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES content_projects(id) ON DELETE CASCADE,
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  platform VARCHAR(40) NOT NULL,
  social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  caption TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'SCHEDULED',
  external_post_id VARCHAR(320),
  error_message TEXT,
  checklist JSONB,
  publish_attempt_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_publications_project_scheduled
  ON scheduled_publications (project_id, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_scheduled_publications_due
  ON scheduled_publications (status, scheduled_at)
  WHERE status = 'SCHEDULED';

CREATE INDEX IF NOT EXISTS idx_scheduled_publications_episode
  ON scheduled_publications (episode_id);
