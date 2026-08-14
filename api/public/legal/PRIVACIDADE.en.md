# Lumina Privacy Policy

**Version:** 9 August 2026

> This text is a technical product baseline and should be reviewed by legal counsel before a broad public launch.

## 1. Data controller

**Controller:** `[name/company to be completed]`

**Email:** `[email to be completed]`

**Address/tax ID:** `[to be completed]`

These fields must be completed before public launch.

## 2. Data we process

Depending on the features used, Lumina may process:

- internal account identifier;
- name, username, email and date of birth;
- bio, avatar and interests added to the profile;
- public/private profile setting;
- follow relationships, follow requests and blocks;
- posts, comments, reactions and reposts;
- Moments and their views;
- Rooms created/joined, invitations and Room messages;
- private messages, read/open state and calls;
- uploaded photos and videos;
- reports and moderation decisions;
- technical security data such as sessions, user-agent, IP address and login attempts;
- password-recovery requests, two-step verification and protected recovery codes;
- payment data required when a paid feature is actually enabled.

## 3. Why we use the data

Data is processed to:

- create and protect the account;
- show the Feed, profiles and social connections;
- manage private profiles and follow requests;
- provide Rooms, Messages, calls, Moments and Radar;
- store and serve media;
- prevent abuse, spam and unauthorized access;
- moderate reported content;
- carry out export, correction and deletion requests;
- operate, diagnose and improve the service.

The applicable legal basis depends on the specific purpose and must be confirmed in the final legal text before public launch.

## 4. Visibility

- A public profile can be viewed by other authenticated Lumina users.
- A private profile only exposes its posts after a follow request is accepted.
- The social Feed shows the user and authors they follow.
- Public Rooms can be discovered by Lumina users; private Rooms are invitation-only.
- Blocking cuts relationships and visibility between the two accounts.
- Moments follow the same social relationship as the Feed and expire after 24 hours.

## 5. Messages and ephemeral content

Private messages and Room messages are stored to provide the service.

Timed or view-once messages and Moments are removed from active content according to the rules shown in the product. Lumina cannot prevent another person from making a screenshot, recording or copy before expiry.

## 6. Session and local storage

The main browser session uses a cookie with `HttpOnly`, `Secure`, `SameSite=Lax` and `Path=/`. Application JavaScript does not read this cookie.

The CSRF value required for state-changing requests is returned by the API and kept in application memory. The PWA may also use browser local storage for non-sensitive technical preferences.

## 7. Providers

The current architecture may involve:

- **Railway** — API;
- **PostgreSQL** — database;
- **Vercel** — web application;
- **Cloudflare R2 / S3-compatible service** — photos and videos;
- **Resend** — transactional emails;
- **Stripe** — only when paid features are enabled.

Before public launch, contracts, processing regions, subprocessors and applicable transfer mechanisms must be confirmed.

## 8. Retention

- Moments expire after 24 hours.
- Temporary messages are cleaned up after they are opened or expire according to the selected mode.
- Expired recovery tokens and old login attempts are cleaned up periodically.
- Account-deletion requests have a 30-day window before execution, unless legal obligations require otherwise.
- Abandoned/orphaned uploads are cleaned up by API jobs.

## 9. Rights

The application includes technical mechanisms to:

- correct profile data;
- export account data;
- request deletion;
- cancel the request during the defined window;
- manage privacy, follows, blocks and sessions.

To exercise other rights under applicable law, a contact channel must be completed in section 1.

## 10. Security

Lumina applies technical measures such as password hashing, revocable sessions, optional two-step verification, CSRF protection, rate limiting, upload validation, Content-Security-Policy and server-side access control.

No system is invulnerable; relevant incidents must be assessed and handled according to applicable legal obligations.

## 11. Changes

This Policy may be updated when the product, providers or legal requirements change. Material changes should be communicated appropriately.
