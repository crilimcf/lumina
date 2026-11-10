-- Billing foundation. No provider credentials or subscription entitlement are granted by this migration.
CREATE TABLE IF NOT EXISTS creator_billing_accounts (
  creator_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stripe_account_id TEXT NOT NULL UNIQUE CHECK (stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
  country CHAR(2) NOT NULL DEFAULT 'PT',
  charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  details_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS creator_billing_customers (
  subscriber_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL UNIQUE CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS creator_checkout_sessions (
  session_id TEXT PRIMARY KEY CHECK (session_id ~ '^cs_[A-Za-z0-9_]+$'),
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscriber_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES creator_plans(id) ON DELETE RESTRICT,
  stripe_subscription_id TEXT UNIQUE,
  checkout_url TEXT NOT NULL CHECK (checkout_url ~ '^https://checkout[.]stripe[.]com/'),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (creator_id <> subscriber_id)
);
CREATE INDEX IF NOT EXISTS creator_checkout_sessions_pending_idx
  ON creator_checkout_sessions(subscriber_id, creator_id, expires_at DESC) WHERE status='pending';
CREATE INDEX IF NOT EXISTS creator_checkout_sessions_subscriber_idx ON creator_checkout_sessions(subscriber_id, created_at DESC);
CREATE INDEX IF NOT EXISTS creator_checkout_sessions_creator_idx ON creator_checkout_sessions(creator_id, status);

CREATE TABLE IF NOT EXISTS creator_stripe_webhook_events (
  event_id TEXT PRIMARY KEY CHECK (event_id ~ '^evt_[A-Za-z0-9]+$'),
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
