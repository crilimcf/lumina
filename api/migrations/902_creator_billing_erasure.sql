-- Ensure GDPR account deletion can cascade creator plans, subscriptions and
-- pending Checkout references. Any Stripe subscription must be cancelled before
-- the user is deleted (handled by runAccountDeletions).
ALTER TABLE creator_memberships
  DROP CONSTRAINT IF EXISTS creator_memberships_plan_id_fkey,
  ADD CONSTRAINT creator_memberships_plan_id_fkey
    FOREIGN KEY (plan_id) REFERENCES creator_plans(id) ON DELETE CASCADE;

ALTER TABLE creator_checkout_sessions
  DROP CONSTRAINT IF EXISTS creator_checkout_sessions_plan_id_fkey,
  ADD CONSTRAINT creator_checkout_sessions_plan_id_fkey
    FOREIGN KEY (plan_id) REFERENCES creator_plans(id) ON DELETE CASCADE;
