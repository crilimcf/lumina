-- Lumina Creators: foundation only. No payments are captured or entitlements granted here.
CREATE TABLE IF NOT EXISTS creator_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(80) NOT NULL CHECK (char_length(trim(title)) BETWEEN 3 AND 80),
  description VARCHAR(500) NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL CHECK (price_cents BETWEEN 100 AND 100000),
  currency CHAR(3) NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  billing_period TEXT NOT NULL CHECK (billing_period IN ('month','year')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creator_plans_public_idx ON creator_plans(creator_id, status) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS creator_plans_owner_idx ON creator_plans(creator_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS creator_plans_one_active_period_idx ON creator_plans(creator_id, billing_period) WHERE status IN ('draft','published');

CREATE TABLE IF NOT EXISTS creator_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscriber_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES creator_plans(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (provider = 'stripe'),
  provider_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','past_due','cancelled','expired')),
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (creator_id <> subscriber_id),
  CHECK (status <> 'active' OR (provider_subscription_id IS NOT NULL AND current_period_end IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS creator_memberships_one_active_idx ON creator_memberships(creator_id, subscriber_id) WHERE status IN ('pending','active','past_due');
CREATE INDEX IF NOT EXISTS creator_memberships_subscriber_idx ON creator_memberships(subscriber_id, status);

CREATE TABLE IF NOT EXISTS creator_member_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL CHECK (char_length(trim(title)) BETWEEN 3 AND 160),
  body TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 10000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS creator_member_content_feed_idx ON creator_member_content(creator_id, published_at DESC) WHERE status = 'published';
