import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDelegatePath = path.resolve(here, '../ios/App/App/AppDelegate.swift');
const entitlementsPath = path.resolve(here, '../ios/App/App/App.entitlements');

let source = await fs.readFile(appDelegatePath, 'utf8');
if (!source.includes('capacitorDidRegisterForRemoteNotifications')) {
  const classEnd = source.lastIndexOf('\n}');
  if (classEnd < 0) throw new Error('Could not locate the AppDelegate class terminator.');

  const callbacks = `

    // Capacitor Push Notifications bridge required for APNs registration.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
`;
  source = `${source.slice(0, classEnd)}${callbacks}${source.slice(classEnd)}`;
  await fs.writeFile(appDelegatePath, source);
}

const apnsEnvironment = process.env.APNS_ENVIRONMENT === 'production' ? 'production' : 'development';
let entitlements = await fs.readFile(entitlementsPath, 'utf8');
entitlements = entitlements.replace(
  /(<key>aps-environment<\/key>\s*<string>)(development|production)(<\/string>)/,
  `$1${apnsEnvironment}$3`
);
await fs.writeFile(entitlementsPath, entitlements);

console.log(`[mobile] iOS AppDelegate wired to Capacitor Push Notifications (${apnsEnvironment}).`);
