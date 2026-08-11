-- Lumina · first-party error observability.
-- Stores only technical diagnostics; no post/message bodies or IP addresses.

CREATE TABLE app_errors (
  id              BIGSERIAL PRIMARY KEY,
  source          TEXT NOT NULL CHECK (source IN ('web','api')),
  kind            TEXT NOT NULL,
  message         TEXT NOT NULL,
  stack           TEXT,
  component_stack TEXT,
  path            TEXT,
  method          TEXT,
  release         TEXT,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  user_agent      TEXT,
  context         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX app_errors_created_idx ON app_errors(created_at DESC);
CREATE INDEX app_errors_source_created_idx ON app_errors(source, created_at DESC);
CREATE INDEX app_errors_user_created_idx ON app_errors(user_id, created_at DESC) WHERE user_id IS NOT NULL;
