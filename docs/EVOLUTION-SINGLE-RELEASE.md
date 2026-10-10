# Lumina Evolution — single non-PostgreSQL release

## Scope and release policy
This release improves the **existing** Lumina web/native app, preserving all features and the existing Midnight, Air and Pulse identities. The branch accumulates changes into a single reviewable delivery. It must not be merged until web/API/Mobile Safari/native checks all pass at the same commit; no partial production deployments.

### Shipped in this candidate
- Design foundations shared across Feed, Momentos, Radar/Pulso, Lumina One, Lumes, Cápsulas, Agora, Salas, Chat and Perfil, including responsive width, consistent editorial cards, focus visibility and reduced motion.
- Bottom navigation is a landmark with a localized accessible name, correct current destination semantics and accessible unread marker.
- Main Radar external news links reuse the strict HTTP(S) URL validator. Dates use the user's chosen Lumina locale.
- Changing language cannot silently reload and discard unsent content, media work or an active call.
- Client error telemetry removes email addresses, likely access tokens and sensitive URL query parameters before upload.

### Validations required for final acceptance
- API integration, web build and production dependency audit green.
- Safari two shards green with 320/375/390/428 mobile breakpoints and all three themes; capture and visually compare real screens.
- Android/iOS native builds green; actual devices must separately validate camera, microphone, calls, push, background/foreground and accessibility VoiceOver/TalkBack.
- After merge, confirm Vercel READY and Railway SUCCESS at the **same** SHA with /api/health HTTP 200 and X-Lumina-Release matching.
- Security review: manual authorization/CSRF/CORS/upload/AI checks and RGPD assessment. Automated green CI is not a pentest.
- Radar RSS publishers: 403 Renascença, 404 RFI, DW DTD cannot be bypassed. Replacement must use verified official feeds and retain safe XML parsing; unresolved feeds should remain visibly reported.
- Independent review of native store release, privacy and physical accessibility still mandatory. Do not claim zero errors without this evidence.

## Explicit exclusion: PostgreSQL
No database schema changes, volume resizing, restoration, backup scheduling, data purge or database configuration. Normal reads/writes through the existing application are unaffected.

## Rollback
Keep the previous healthy paired Vercel + Railway production SHA available. Roll back both services together on regressions. Never reverse database data as part of app rollout.
