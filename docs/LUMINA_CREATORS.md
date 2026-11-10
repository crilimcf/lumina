# Lumina Creators — foundation

## Objective
Build creator-owned communities: subscriptions, members-only posts and live sessions,
private discussion, early access, and transparent revenue reporting.

## Implemented in this branch
- Draft plan creation by authenticated creators.
- Creator Studio for private drafts and preparing member-only text content (50 items max per creator).
- Public plan catalogue (published plans only).
- PostgreSQL tables for plans, memberships and members-only content.
- Independent feature flag `FEATURE_CREATORS` (default false) for the payment-free studio.
- Separate feature flag `FEATURE_SUBSCRIPTIONS` (default false); not enabled by studio access.
- No payment collection, payout, or paid access entitlement is enabled.

## Safe production rollout (draft studio only)
1. Deploy the reviewed branch with all API, web and mobile CI checks green.
2. Set `FEATURE_CREATORS=true` on the Railway API; leave `FEATURE_SUBSCRIPTIONS=false`.
3. Verify `/health`, authenticated `/api/creators/me/plans` and `/api/creators/me/content`, and confirm payments remain unavailable.
4. The 'published' content status only means content has been prepared for future eligible members; no subscriber can pay or unlock it yet.
5. Monitor PostgreSQL disk usage and API errors. Disable `FEATURE_CREATORS` immediately to hide the studio without deleting data if any issue is detected.

## Safety requirements before launch
1. Integrate Stripe Connect onboarding, country eligibility, payouts and tax compliance.
2. Implement subscription checkout with Stripe customer and subscription ownership mapping.
3. Validate Stripe webhook signatures against the raw request body.
4. Process subscription lifecycle events idempotently (created, updated, deleted, refunds).
5. Only server-verified active subscriptions with non-expired periods may unlock content.
6. Enforce blocks, privacy, creator moderation, reporting, abuse prevention and age rules.
7. Test app-store billing policies for iOS/Android digital purchases.
8. Add a creator dashboard and UX with accessible cancellation, billing disclosures and receipts.
9. Measure video bandwidth and storage costs before promising a 10% platform fee.
10. Stage and test migrations against a database copy before production deployment.

## Differentiation roadmap
- Creator circles: membership perks combining exclusive posts, private rooms and live access.
- Co-creation: creator-approved community proposals and member votes.
- Community quests: optional participation milestones, never pay-to-win reach.
- Fairness: chronological member updates and portable creator-owned export.
- Creator economics: revenue after processing, refunds and tax, not misleading gross percentages.

No claim of industry-first novelty is made without competitive validation.

## Stripe Connect integration branch (10 November 2026 — gated work in progress)

The PR implementing Stripe Connect is a **draft**. It is **not a completed paid product** and must not be merged or enabled just because the API or web CI builds succeed.

- `api/migrations/901_creators_billing.sql` stores Connect onboarding, customer, checkout session references and webhook delivery IDs.
- Backend routes: `GET /api/creators/me/billing/status`, `POST /api/creators/me/billing/onboard`, `POST /api/creators/me/billing/refresh`, `POST /api/creators/me/plans/:planId/publish` and `POST /api/creators/:creatorId/plans/:planId/checkout`.
- A separate `POST /api/payments/stripe/creators-webhook` verifies the signature of the raw Stripe event and reconciles subscription state with paid invoices before granting access. It is disabled unless all billing flags and required secrets are configured.
- Never expose `STRIPE_SECRET_KEY` or `CREATORS_STRIPE_WEBHOOK_SECRET` in the web build.
- `CREATORS_PLATFORM_FEE_PERCENT` has no default: commercial commission must be explicitly agreed and configured by the platform owner.
- The native mobile apps MUST NOT present an alternative payment link or embedded subscription Checkout for digital goods before an app-store policy review.

### Remaining blocking requirements before launch

1. Obtain a Stripe **test-mode** account or sandbox and verified keys, and test real event order, signatures, prices, KYC, onboarding, repeat checkout, renewal, billing portal, cancellations, disputes, chargebacks, refunds and taxes.
2. Wire and test Stripe Billing Portal and payment lifecycle reconciliation, including charge refunds and disputes. **The current webhook does not comprehensively cover these cases and must remain disabled.**
3. Finish privacy retention, contracted service providers and international-transfer review with a competent lawyer; complete RGPD export and erasure for the new payment reference tables if added to production.
4. Review consumer subscription disclosures and applicable statutory cancellation and refund rights, and implement legal receipts/fiscal obligations.
5. Complete Apple / Google compliant native digital-goods billing implementation and test on real devices, or keep all native purchase flows hidden.
6. Run staging migration/rollback and integration tests before enabling `FEATURE_SUBSCRIPTIONS` in production.
7. Verify account `digibox.pt` onboarding eligibility and complete any pending proof-of-liveness requirements.

No platform receives money or grants paid memberships from this branch while `FEATURE_SUBSCRIPTIONS=false`.

## Stripe test-mode audit — 10 November 2026

Read-only inspection after the account owner authorized test-mode Stripe access:

- Digibox Stripe is available in both live and test modes. Specify livemode=false for tests.
- The linked test mode currently has zero Connect connected accounts and zero webhook endpoints.
- Stripe Tax settings are pending, with zero tax registrations. Do not activate live checkout as if tax compliance were complete.
- The automated EnableConnect operation refused activation because it only supports standalone sandboxes, not the existing test-mode environment.
- This API limitation does not prove that Connect cannot be configured in the dashboard, only that this particular automated setup cannot do it.
- Testing destination subscriptions requires an isolated Connect-enabled sandbox/test account, synthetic connected account, and separate staging backend with webhook secret and test API key.
- No test purchases, accounts, customers, products, webhooks, or prices were created during this read-only audit.
- Existing live Stripe webhooks for Digibox's other products remain unchanged.

Continue to keep FEATURE_SUBSCRIPTIONS=false in production. Do not put Stripe test keys in the production Railway service.
