-- Connected recipients created using Stripe Accounts v2 may receive transfers
-- without permission to collect direct charges. Keep an independent flag;
-- NULL preserves the old eligibility semantics for v1 legacy accounts.
ALTER TABLE creator_billing_accounts
  ADD COLUMN IF NOT EXISTS transfers_enabled BOOLEAN;
