# Lumina native mobile release

Lumina keeps the existing React/Vite Web product as the shared product code and adds native Android/iOS shells with Capacitor 8. The Vercel/Railway Web release continues independently while the native apps are built, tested and reviewed.

## Identity

- App name: `Lumina`
- Android application ID: `com.crilimcf.lumina`
- iOS bundle ID: `com.crilimcf.lumina`
- Custom deep-link scheme: `lumina://`
- Initial store version: `1.0.0`
- Android target SDK: API 36

Do not change the application/bundle ID after creating the store records unless the store records are recreated too.

## Architecture

`web/` remains the source UI. `mobile/` owns native build/runtime concerns. Native builds bundle `web/dist`; they do not point the WebView at the live website. API calls are routed to the canonical Lumina API and use a native Bearer session. The normal Web deployment continues to use its secure session cookie.

The native bootstrap adds:

- persistent app session using Capacitor Preferences with a sandboxed local fallback;
- Authorization Bearer support for all existing `/api` calls;
- authenticated SSE for messages and notifications;
- native splash/status-bar/keyboard lifecycle behavior;
- Android back-button and `lumina://` deep links;
- native notification registration and notification tap routing;
- haptic/share/browser bridge helpers;
- native-only suppression of browser Web Push, web deployment polling and WebAuthn passkeys where the web origin cannot safely provide the existing RP-ID contract.

Passkeys remain fully available on Web. Native passkeys can be enabled later after the Apple Associated Domains and Android Digital Asset Links identifiers are known from the final developer/store accounts.

## Native push

The API accepts native device tokens at `/api/notifications/native/*` and can deliver through:

### Android / Firebase Cloud Messaging

Railway/API environment variables:

- `FCM_PROJECT_ID`
- `FCM_CLIENT_EMAIL`
- `FCM_PRIVATE_KEY`

The Android project also requires the Firebase `google-services.json` corresponding to `com.crilimcf.lumina` for on-device registration. Never commit that file if it contains project-sensitive configuration; inject it in the release workflow or developer machine.

### iOS / APNs

Railway/API environment variables:

- `APNS_TEAM_ID`
- `APNS_KEY_ID`
- `APNS_PRIVATE_KEY`
- `APNS_BUNDLE_ID=com.crilimcf.lumina`
- `APNS_PRODUCTION=true` for the production App Store build

The App ID and provisioning profile must have Push Notifications enabled in Apple Developer.

## CI validation

`.github/workflows/mobile-native.yml` builds both platforms without store secrets:

- Android debug APK;
- Android release AAB (unsigned until the Play upload key is configured);
- iOS Release build for the simulator with code signing disabled.

This workflow proves that the shared Web bundle, Capacitor plugins and generated native projects compile together. It intentionally does not manufacture or expose private signing keys.

## Store signing secrets

Signing material belongs in GitHub encrypted Actions secrets or the store/provider account, never in source control or chat.

Expected Android release secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Expected Apple release secrets:

- `IOS_CERTIFICATE_P12_BASE64`
- `IOS_CERTIFICATE_PASSWORD`
- `IOS_PROVISIONING_PROFILE_BASE64`
- `APPLE_TEAM_ID`
- App Store Connect API credentials when automated upload is enabled.

## Store-owner actions that cannot be automated from this repository

1. Enrol/verify the Apple Developer account and accept Apple legal agreements.
2. Create the App Store Connect record for `com.crilimcf.lumina`.
3. Create/verify the Google Play Console developer account and accept Google legal agreements.
4. Create the Google Play app record for `com.crilimcf.lumina`.
5. Create the Apple distribution/provisioning credentials and Android Play upload key (or allow the chosen CI release process to use existing credentials).
6. Create the Firebase iOS/Android app registrations and APNs key when push is enabled.
7. Complete any identity, tax, banking, age-rating or organization verification the stores request.

These are owner/legal-account actions. They are intentionally not bypassed or represented as completed by the codebase.

## Release gate

Before public release, all of the following must pass on physical devices:

- create account, login, 2FA and logout;
- Feed, Moments, profile and relationships;
- create/upload photos and videos;
- chat text/media, receipts and notification navigation;
- audio/video calls, camera and microphone permissions;
- Rooms and moderation/report/block flows;
- Lumina One, local location permission and no-location fallback;
- Radar/external links;
- account data export and permanent account deletion;
- background/foreground lifecycle, offline recovery and keyboard safe areas;
- push registration, foreground notification, background notification and tap-to-open;
- PT/FR/EN/ES device-language regression;
- small Android, modern Android, small iPhone and current iPhone layouts.

A build is a store candidate only after these device checks and both store signing identities exist.
