ALTER TABLE push_tokens
  ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en';

ALTER TABLE web_push_subscriptions
  ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en';

CREATE INDEX IF NOT EXISTS push_tokens_user_locale_idx
  ON push_tokens(user_id, locale, updated_at DESC);

CREATE INDEX IF NOT EXISTS web_push_subscriptions_user_locale_idx
  ON web_push_subscriptions(user_id, locale, updated_at DESC);
