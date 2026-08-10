-- Lumina · Web Push persistente para PWA instalada.
-- A chave VAPID privada fica apenas no backend/base de dados e nunca é enviada ao cliente.

CREATE TABLE IF NOT EXISTS app_secrets (
  name       TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh     TEXT,
  auth       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS web_push_subscriptions_user_idx
  ON web_push_subscriptions(user_id, updated_at DESC);
