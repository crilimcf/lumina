-- Lumina · migração 2
-- Peças que faltavam para poder ir para o ar a sério.

-- ─────────────────────────── recuperação de password

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,           -- guardamos o hash, nunca o token
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets(user_id);

-- ─────────────────────────── ficheiros

CREATE TABLE IF NOT EXISTS uploads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        TEXT UNIQUE NOT NULL,       -- caminho no armazenamento
  url        TEXT NOT NULL,
  mime       TEXT NOT NULL,
  bytes      INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS uploads_owner_idx ON uploads(owner_id);

-- ─────────────────────────── RGPD

-- Pedidos de apagamento. Damos uma janela de arrependimento antes de apagar.
CREATE TABLE IF NOT EXISTS deletion_requests (
  user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  execute_at   TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ
);

-- ─────────────────────────── notificações

CREATE TABLE IF NOT EXISTS push_tokens (
  token      TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform   TEXT NOT NULL CHECK (platform IN ('web','ios','android')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON push_tokens(user_id);

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}',
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, created_at DESC);

-- ─────────────────────────── registo de dias
-- Uma linha por dia em que a pessoa respondeu ao convite. Só cresce:
-- não há contador para zerar, ao contrário dos streaks.

CREATE TABLE IF NOT EXISTS answer_days (
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  local_date   DATE NOT NULL,
  PRIMARY KEY (user_id, community_id, local_date)
);
CREATE INDEX IF NOT EXISTS answer_days_user_idx ON answer_days(user_id, local_date DESC);

-- controlo de versão do esquema
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations (version) VALUES (1), (2) ON CONFLICT DO NOTHING;
