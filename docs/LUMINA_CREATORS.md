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
