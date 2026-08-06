-- Lumina · migração 3
-- Correções de segurança e RGPD encontradas em auditoria.

-- ─────────────────────────── invalidar sessões

-- Vai dentro do JWT. Quando muda, todos os tokens emitidos antes deixam de
-- servir. Sem isto, quem roubou uma password mantinha a sessão aberta mesmo
-- depois de a vítima a trocar — que é exatamente quando ela precisa de a fechar.
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INT NOT NULL DEFAULT 1;

-- ─────────────────────────── idade e consentimento

-- O RGPD fixa em 16 anos a idade de consentimento e deixa os Estados baixarem
-- até 13. Portugal manteve 16. Uma rede social sem verificação nenhuma não é
-- defensável.
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version TEXT;

-- ─────────────────────────── bloquear pessoas

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS blocks_blocked_idx ON blocks(blocked_id);

-- ─────────────────────────── registo de acessos administrativos
-- Quem viu o quê na moderação. Se houver uma queixa sobre uma decisão,
-- é isto que responde.

CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  actor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  target     TEXT,
  detail     JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_actor_idx ON audit_log(actor_id, created_at DESC);

INSERT INTO schema_migrations (version) VALUES (3) ON CONFLICT DO NOTHING;
