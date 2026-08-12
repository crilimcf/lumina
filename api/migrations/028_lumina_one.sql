ALTER TABLE uploads
  DROP CONSTRAINT IF EXISTS uploads_purpose_check;

ALTER TABLE uploads
  ADD CONSTRAINT uploads_purpose_check
  CHECK (purpose IS NULL OR purpose IN ('legacy','post','moment','message','avatar','room','room_message','lume','capsule'));

CREATE TABLE IF NOT EXISTS lumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  effect TEXT NOT NULL DEFAULT 'normal' CHECK (effect IN ('normal','mirror','mono','vivid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_lumes_active_author ON lumes (author_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_lumes_expires ON lumes (expires_at);

CREATE TABLE IF NOT EXISTS lume_views (
  lume_id UUID NOT NULL REFERENCES lumes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lume_id, user_id)
);

CREATE TABLE IF NOT EXISTS lume_media_tickets (
  token_hash TEXT PRIMARY KEY,
  lume_id UUID NOT NULL REFERENCES lumes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lume_media_tickets_expiry ON lume_media_tickets (expires_at);

CREATE TABLE IF NOT EXISTS pulse_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  boost_topics TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  mute_topics TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  context_mode TEXT NOT NULL DEFAULT 'auto' CHECK (context_mode IN ('auto','casa','evento','viagem','jogo','foco')),
  local_region TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS capsules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 400),
  unlock_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS capsule_members (
  capsule_id UUID NOT NULL REFERENCES capsules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (capsule_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_capsule_members_user ON capsule_members (user_id, joined_at DESC);

CREATE TABLE IF NOT EXISTS capsule_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capsule_id UUID NOT NULL REFERENCES capsules(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 1200),
  media_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT capsule_item_has_content CHECK (NULLIF(btrim(body),'') IS NOT NULL OR media_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_capsule_items_capsule ON capsule_items (capsule_id, created_at);

CREATE TABLE IF NOT EXISTS together_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('post','radar','live')),
  source_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '' CHECK (char_length(title) <= 120),
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '4 hours')
);

CREATE INDEX IF NOT EXISTS idx_together_sessions_active ON together_sessions (expires_at DESC);

CREATE TABLE IF NOT EXISTS together_members (
  session_id UUID NOT NULL REFERENCES together_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_together_members_user ON together_members (user_id, joined_at DESC);
