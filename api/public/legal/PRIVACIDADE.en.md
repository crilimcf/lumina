# Lumina Privacy Policy

**Version:** 10 November 2026

## 1. Data controller

**Controller:** Carlos Fernandes

**Email:** carlos.fernandes@digibox.pt

**Address:** Rua da Cabecinha No. 23, 5300-802 Rebordainhos, Bragança, Portugal

**Tax ID (NIF):** 227369661

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
- precise or approximate location, only when you activate a local feature;
- notification token, platform, technical device identifier, model and operating-system version;
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

The applicable legal bases are performance of the Terms and requested service, compliance with legal obligations, legitimate interests in security, abuse prevention and service improvement, and consent where it is specifically requested. Consent may be withdrawn at any time without affecting processing already carried out.

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

In the iOS and Android apps, the session token is stored in the device's protected Keychain or Keystore. Face ID, fingerprint and device passcode are validated by the operating system; Lumina only receives the validation result and does not receive or store biometric data.

## 7. Providers

The current architecture may involve:

- **Railway** — API;
- **PostgreSQL** — database;
- **Vercel** — web application;
- **Cloudflare R2 / S3-compatible service** — photos and videos;
- **Resend** — transactional emails;
- **Apple Push Notification service (APNs)** and **Google Firebase Cloud Messaging (FCM)** — mobile-notification delivery;
- **Stripe** — only when paid features are enabled.

Lumina applies the contractual safeguards and transfer mechanisms required by the GDPR to its providers, including adequacy decisions or Standard Contractual Clauses where applicable.

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

Requests for access, rectification, erasure, restriction, objection and portability may be sent to the email in section 1 and are handled within the legal time limits. Where processing relies on consent, it may be withdrawn at any time. A complaint may also be filed with the Portuguese Data Protection Authority (CNPD).

Lumina does not use solely automated decisions that produce legal or similarly significant effects on a person.

## 10. Security

Lumina applies technical measures such as password hashing, revocable sessions, optional two-step verification, CSRF protection, rate limiting, upload validation, Content-Security-Policy and server-side access control.

No system is invulnerable; relevant incidents must be assessed and handled according to applicable legal obligations.

## 11. Changes

This Policy may be updated when the product, providers or legal requirements change. Material changes should be communicated appropriately.

## 12. Creators, payments and AI — update of 10 November 2026

Lumina Creators stores plan names, descriptions, prices, billing intervals, exclusive text content and publication status as part of the requested service. Draft plans do not trigger charges. When subscriptions are actually launched, Lumina may process payment provider identifiers, subscription status, billing dates, cancellations and refunds, but must not store complete payment-card numbers. Payment processing will use Stripe, subject to activation and verification.

Live streams may use Amazon IVS and S3; AI features may transmit the prompt and information strictly needed to OpenAI when you choose to use them. These providers must be assessed for processing agreements, geographic processing locations, security and international transfer safeguards under the GDPR. Data is retained for the duration required to deliver the service, subject to account deletion and applicable legal record-keeping duties. The legal basis may include contractual necessity, statutory duties, legitimate security interests or consent where specifically required. You may exercise your GDPR rights using the contact indicated above.

This update is a disclosure of processing activities, not a claim that monetisation or an external legal audit has been completed.
