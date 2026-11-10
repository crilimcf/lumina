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


## Lumina standalone Sandbox successfully connected — 10 November 2026

The account owner authorized the independent **Lumina** sandbox in addition to Digibox live/test. Sandbox account reference: `acct_1UaENzI3oNqs1r6L` (non-secret). **All changes below were performed with `livemode=false`.**

- Stripe Connect platform activation: **enabled=true**, confirmed by the Stripe API.
- Sandbox marketplace connected accounts: **none yet**.
- Test product: `prod_VbRTjMA9a20sgl` — "Lumina Creators — Plano de Testes".
- Test recurring price: `price_1UaEadI3oNqs1r6LIem9QrV0` — **EUR 4.99/month**, sandbox only.
- Synthetic test customer: `cus_VbRTuSYlsHyTuW`, email uses the reserved `example.invalid` domain.
- Stripe tool currently exposes account reads and Connect enablement, but **not** a supported connected-account *create* operation; therefore a fake creator account has not been created and destination Checkout has **not** been verified end-to-end.
- No Stripe webhook endpoint, completed Checkout, charge, invoice, transfer or payout was created. No live Digibox setting was modified.
- Before any end-to-end Checkout run: decide how VAT/Stripe Tax will be handled; do not enable automatic taxes without correct registrations. A sandbox-only test must use synthetic data and an isolated backend with test-only credentials.
- Platform commission `CREATORS_PLATFORM_FEE_PERCENT` remains intentionally unset, pending explicit commercial terms.

**Status:** Sandbox integration is configured for the next stage; real subscription billing, entitlement lifecycles, refunds, disputes and Connect payouts still need live sandbox endpoint tests before any production merge.

## Billing security regression hardening — 10 November 2026

- Connected Lumina Sandbox and enabled Stripe Connect at the platform level.
- Created test-only EUR 4.99/month price and test customer; Billing Portal session created on Stripe sandbox and verified with Stripe-hosted HTTPS URL.
- Added paid-content rendering based exclusively on server-verified creator membership, not client flags.
- Persisted refunded and disputed invoice IDs and suspended associated membership access. A duplicate/older Stripe update cannot reactivate a reversed invoice.
- Added an out-of-order refund pathway: a reversal arriving before first paid webhook is linked to the pending Checkout and recorded so a subsequent webhook cannot accidentally authorize that reversed invoice.
- Added regression tests for renewal and new paid invoice restoration, dispute on renewal, pre-membership refund, and a strict live-key approval switch.
- Added separate CREATORS_LIVE_PAYMENTS_APPROVED=false gate. Live Stripe credentials cannot activate checkout from FEATURE_SUBSCRIPTIONS alone.
- Do not remove required financial and legal launch criteria because isolated test runners passed. Stripe Connect creator account creation, invoice tax treatment and checkout transfers remain unvalidated in the sandbox.

At this stage, the production app still has billing feature disabled.


## Billing portal, webhook and user-facing cancellation validation — 10 November 2026

- Stripe's **Lumina standalone sandbox** has an **active default Billing Portal configuration**: `bpc_1UaEwtI3oNqs1r6LmW5vhkT8`.
- Verified by sandbox API: `subscription_cancel.enabled=true`, cancellation at the end of the paid period, invoice history enabled, payment-method updates enabled.
- A sandbox-only portal session was successfully created for the synthetic customer; Stripe returned `billing.stripe.com`, and no real charge occurred.
- Existing subscribers can invoke `/creators/me/billing/subscriptions` and `/creators/me/billing/portal` even when `FEATURE_CREATORS=false` or `FEATURE_SUBSCRIPTIONS=false` so cancellation remains accessible during an emergency pause.
- Signed financial webhook processing now only requires the payment credentials and signing secret, not a commercial feature flag. This keeps refunds, cancellations and revocations operational while new sales are disabled.
- Creator profiles show subscription state, a direct *Manage payment or cancel* action on the web and server-authorized paid content; private profiles no longer hide content from their existing paying members.
- The incident-handler regression suite now covers disputes, partial/full refunds, later paid renewals, replayed events and refunds identified only by PaymentIntent.
- Connect **is enabled** in this sandbox, but still has **zero connected creator accounts**. No end-to-end destination-charge checkout or payout has been proven.
- The production API remains on `master` with `FEATURE_SUBSCRIPTIONS=false`. Do not release this feature branch until sandbox Connect onboarding, VAT, disputes and live integration are independently approved.

