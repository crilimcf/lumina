CREATE TABLE IF NOT EXISTS native_push_tokens (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ios','android')),
  device_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS native_push_tokens_user_idx
  ON native_push_tokens(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS native_push_deliveries (
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  token text NOT NULL REFERENCES native_push_tokens(token) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  status integer,
  error text,
  PRIMARY KEY (notification_id, token)
);

CREATE INDEX IF NOT EXISTS native_push_deliveries_pending_idx
  ON native_push_deliveries(attempted_at DESC)
  WHERE delivered_at IS NULL;
