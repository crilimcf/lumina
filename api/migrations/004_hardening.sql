-- Lumina · migração 4
-- O que faltava depois da auditoria.

-- ─────────────────────────── autenticação em dois passos

ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled_at TIMESTAMPTZ;

-- Códigos de emergência, guardados em hash. Quem perde o telemóvel precisa
-- de uma forma de entrar que não passe pelo telemóvel.
CREATE TABLE IF NOT EXISTS recovery_codes (
  code_hash  TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recovery_codes_user_idx ON recovery_codes(user_id);

-- ─────────────────────────── tentativas de entrada
-- O limite por janela de tempo não chega: um atacante paciente passa por baixo.
-- Isto conta por conta e trava progressivamente.

CREATE TABLE IF NOT EXISTS login_attempts (
  id         BIGSERIAL PRIMARY KEY,
  email      CITEXT NOT NULL,
  ip         INET,
  success    BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts(email, created_at DESC);

-- ─────────────────────────── uploads

-- Só entra no conteúdo depois de confirmado. Ficheiros que ninguém confirma
-- são lixo e vão fora.
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS rejected_reason TEXT;
CREATE INDEX IF NOT EXISTS uploads_pending_idx ON uploads(created_at) WHERE confirmed_at IS NULL;

-- ─────────────────────────── sessões visíveis
-- Para a pessoa poder ver e fechar sessões. Não guardamos o token, só a sua
-- impressão digital.

CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT UNIQUE NOT NULL,
  user_agent  TEXT,
  ip          INET,
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id, last_seen DESC);

INSERT INTO schema_migrations (version) VALUES (4) ON CONFLICT DO NOTHING;
