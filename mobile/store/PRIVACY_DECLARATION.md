# Store privacy declaration working sheet

This file is the source-of-truth checklist for the App Store Privacy and Google Play Data Safety forms. It must be revalidated against production behavior immediately before submission.

## Data used by Lumina

| Category | Example | Purpose | User choice / deletion |
|---|---|---|---|
| Account identifiers | email, handle, internal user ID | account, authentication, safety | account can be permanently deleted |
| Profile information | name, bio, avatar, date of birth/age eligibility | profile and age eligibility | editable/deleted with account |
| User content | posts, comments, Moments, Rooms | core social features | user controls content; account deletion applies |
| Messages | chat text and shared media | person-to-person communication | required to provide messaging |
| Photos/videos | only media selected or captured by the user | posts, chat, Moments, Rooms | permission/user initiated |
| Audio/video | camera/microphone during calls/live actions initiated by user | communication | permission/user initiated |
| Location | when the user invokes local Lumina One experiences | nearby/local discovery | optional; no-location fallback exists |
| Social graph | follows, blocks, invitations | connections and safety | user controlled |
| Reports/moderation data | reports, blocks, moderation status | abuse prevention and platform safety | required for safety/legal handling |
| Device push token | APNs/FCM token and platform | deliver notifications | removed on unsubscribe/account deletion/token invalidation |
| Session/security data | sessions, 2FA/passkey records, security metadata | authentication/security | session management/account deletion |

## Not declared unless implementation changes

- The native release does not upload the device address book.
- The native release does not request advertising tracking permission.
- No cross-app advertising identifier is intentionally collected by the Lumina client.
- Paid Ultra Rooms are disabled in the current client, so the native release does not expose an external digital-goods checkout.

## Permissions rationale

- Camera: media capture and video calls, only after user action.
- Microphone: audio/video calls and user-created media/live features.
- Photos: select content to share; add access only when the user explicitly saves media.
- Location while in use: local Lumina One discovery, optional.
- Notifications: messages, calls and activity; permission is requested after an authenticated in-app explanation.

## Submission check

Before answering Apple/Google privacy forms, verify production API logs, SDK inventory and all third-party services. If a new analytics, advertising, attribution or crash-reporting SDK is added, this worksheet and both store declarations must be updated before release.
