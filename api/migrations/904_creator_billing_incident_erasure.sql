-- A refund can arrive before the first paid webhook creates the membership.
-- Therefore incidents must belong to the underlying account owners, not to
-- creator_memberships. Both owners are verified against a checkout or membership
-- before an incident is recorded. Cascading user deletion removes these records.
ALTER TABLE creator_billing_incidents
  ADD COLUMN creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN subscriber_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Backfill for installations that have already created incidents under 903.
UPDATE creator_billing_incidents i SET
  creator_id=m.creator_id,
  subscriber_id=m.subscriber_id
FROM creator_memberships m
WHERE i.provider_subscription_id=m.provider_subscription_id
  AND i.creator_id IS NULL;

UPDATE creator_billing_incidents i SET
  creator_id=cs.creator_id,
  subscriber_id=cs.subscriber_id
FROM creator_checkout_sessions cs
WHERE i.provider_subscription_id=cs.stripe_subscription_id
  AND i.creator_id IS NULL;

-- Reject unsafe activation if any historic event is not attributable to an
-- account; preserve evidence for manual review instead of silently deleting it.
ALTER TABLE creator_billing_incidents
  ALTER COLUMN creator_id SET NOT NULL,
  ALTER COLUMN subscriber_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS creator_billing_incidents_creator_idx
  ON creator_billing_incidents(creator_id);
CREATE INDEX IF NOT EXISTS creator_billing_incidents_subscriber_idx
  ON creator_billing_incidents(subscriber_id);
