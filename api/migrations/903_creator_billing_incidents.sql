-- Refund/dispute events can arrive after an invoice is paid: keep
-- a durable hold so replayed subscription.updated events cannot restore access.
ALTER TABLE creator_memberships
  ADD COLUMN IF NOT EXISTS last_paid_invoice_id TEXT
    CHECK (last_paid_invoice_id IS NULL OR last_paid_invoice_id ~ '^in_[A-Za-z0-9]+$');

CREATE TABLE IF NOT EXISTS creator_billing_incidents (
  event_id TEXT PRIMARY KEY CHECK (event_id ~ '^evt_[A-Za-z0-9]+$'),
  provider_subscription_id TEXT NOT NULL CHECK (provider_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  invoice_id TEXT NOT NULL CHECK (invoice_id ~ '^in_[A-Za-z0-9]+$'),
  charge_id TEXT CHECK (charge_id IS NULL OR charge_id ~ '^ch_[A-Za-z0-9]+$'),
  reason TEXT NOT NULL CHECK (reason IN ('refund','dispute')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creator_billing_incidents_sub_invoice_idx
  ON creator_billing_incidents(provider_subscription_id, invoice_id);
