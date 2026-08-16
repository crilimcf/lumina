ALTER TABLE push_tokens
  ADD COLUMN IF NOT EXISTS device_id TEXT,
  ADD COLUMN IF NOT EXISTS device_name TEXT,
  ADD COLUMN IF NOT EXISTS os_version TEXT,
  ADD COLUMN IF NOT EXISTS push_environment TEXT NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$ BEGIN
  ALTER TABLE push_tokens ADD CONSTRAINT push_tokens_environment_check
    CHECK (push_environment IN ('production','sandbox'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS push_tokens_user_updated_idx
  ON push_tokens(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS mobile_auth_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_challenge TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  exchange_code_hash TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  completed_at TIMESTAMPTZ,
  exchanged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mobile_auth_handoffs_expiry_idx
  ON mobile_auth_handoffs(expires_at);

CREATE TABLE IF NOT EXISTS mobile_browser_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mobile_browser_sessions_expiry_idx
  ON mobile_browser_sessions(expires_at);
