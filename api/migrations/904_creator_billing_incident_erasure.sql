-- Retain billing incidents only while the associated membership exists.
-- The legal/audit policy may require a separate, appropriately restricted
-- financial ledger, but operational incident references must not become
-- orphaned when a user exercises the account-erasure flow.
ALTER TABLE creator_billing_incidents
  ADD CONSTRAINT creator_billing_incidents_subscription_fkey
  FOREIGN KEY (provider_subscription_id)
  REFERENCES creator_memberships(provider_subscription_id)
  ON DELETE CASCADE;
