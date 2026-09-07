-- Lumina social loops: Lume 2.0, Agora social e Radar "Dos meus".
-- Mantém o Radar editorial existente intacto e acrescenta uma camada social separada.

CREATE TABLE IF NOT EXISTS viral_lume_chains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('direct','collective')),
  title VARCHAR(80) NOT NULL DEFAULT '',
  active_until TIMESTAMPTZ NOT NULL,
  recap_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (recap_until >= active_until)
);

CREATE INDEX IF NOT EXISTS viral_lume_chains_active_idx
  ON viral_lume_chains (active_until DESC);
CREATE INDEX IF NOT EXISTS viral_lume_chains_recap_idx
  ON viral_lume_chains (recap_until DESC);

CREATE TABLE IF NOT EXISTS viral_lume_members (
  chain_id UUID NOT NULL REFERENCES viral_lume_chains(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id,user_id)
);

CREATE INDEX IF NOT EXISTS viral_lume_members_user_idx
  ON viral_lume_members (user_id,joined_at DESC);

CREATE TABLE IF NOT EXISTS viral_lume_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id UUID NOT NULL REFERENCES viral_lume_chains(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  effect TEXT NOT NULL DEFAULT 'normal' CHECK (effect IN ('normal','mirror','mono','vivid')),
  caption VARCHAR(180) NOT NULL DEFAULT '',
  provenance TEXT NOT NULL DEFAULT 'captured' CHECK (provenance IN ('captured','edited_ai','generated_ai')),
  reply_to_id UUID REFERENCES viral_lume_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS viral_lume_entries_chain_idx
  ON viral_lume_entries (chain_id,created_at);

CREATE TABLE IF NOT EXISTS viral_lume_views (
  entry_id UUID NOT NULL REFERENCES viral_lume_entries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id,user_id)
);

CREATE TABLE IF NOT EXISTS agora_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('coffee','sport','gaming','drinks','walk','cinema','food','music','study','custom')),
  title VARCHAR(100) NOT NULL,
  note VARCHAR(300) NOT NULL DEFAULT '',
  coarse_location VARCHAR(100) NOT NULL DEFAULT '',
  meeting_point VARCHAR(180) NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  capacity SMALLINT NOT NULL DEFAULT 8 CHECK (capacity BETWEEN 2 AND 30),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agora_intents_active_idx
  ON agora_intents (status,expires_at DESC);
CREATE INDEX IF NOT EXISTS agora_intents_author_idx
  ON agora_intents (author_id,created_at DESC);

CREATE TABLE IF NOT EXISTS agora_members (
  intent_id UUID NOT NULL REFERENCES agora_intents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (intent_id,user_id)
);

CREATE INDEX IF NOT EXISTS agora_members_user_idx
  ON agora_members (user_id,joined_at DESC);

CREATE TABLE IF NOT EXISTS agora_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id UUID NOT NULL REFERENCES agora_intents(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body VARCHAR(500) NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agora_messages_intent_idx
  ON agora_messages (intent_id,created_at);

CREATE TABLE IF NOT EXISTS radar_network_signals (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  radar_item_id UUID NOT NULL REFERENCES radar_items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('save','share')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,radar_item_id,kind)
);

CREATE INDEX IF NOT EXISTS radar_network_signals_item_idx
  ON radar_network_signals (radar_item_id,created_at DESC);
CREATE INDEX IF NOT EXISTS radar_network_signals_user_idx
  ON radar_network_signals (user_id,created_at DESC);
