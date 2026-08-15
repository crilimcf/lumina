import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDelegatePath = path.resolve(here, '../ios/App/App/AppDelegate.swift');
const entitlementsPath = path.resolve(here, '../ios/App/App/App.entitlements');
const privacyManifestPath = path.resolve(here, '../ios/App/App/PrivacyInfo.xcprivacy');
const projectPath = path.resolve(here, '../ios/App/App.xcodeproj/project.pbxproj');

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

const productionSigning = !!process.env.IOS_CERTIFICATE_P12_BASE64;
const apnsEnvironment = process.env.APNS_ENVIRONMENT === 'production' || productionSigning ? 'production' : 'development';
let entitlements = await fs.readFile(entitlementsPath, 'utf8');
entitlements = entitlements.replace(
  /(<key>aps-environment<\/key>\s*<string>)(development|production)(<\/string>)/,
  `$1${apnsEnvironment}$3`
);
await fs.writeFile(entitlementsPath, entitlements);

const privacyManifest = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array><string>CA92.1</string></array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array><string>C617.1</string></array>
    </dict>
  </array>
</dict>
</plist>
`;
await fs.writeFile(privacyManifestPath, privacyManifest);

let project = await fs.readFile(projectPath, 'utf8');
if (!project.includes('PrivacyInfo.xcprivacy in Resources')) {
  const buildFileId = 'A1B2C3D4E5F60718293A4B5C';
  const fileRefId = 'B1C2D3E4F5061728394A5B6C';

  if (!project.includes('/* Begin PBXBuildFile section */') || !project.includes('/* Begin PBXFileReference section */')) {
    throw new Error('Xcode project format changed; PrivacyInfo.xcprivacy could not be registered.');
  }

  project = project.replace(
    '/* Begin PBXBuildFile section */',
    `/* Begin PBXBuildFile section */\n\t\t${buildFileId} /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = ${fileRefId} /* PrivacyInfo.xcprivacy */; };`
  );
  project = project.replace(
    '/* Begin PBXFileReference section */',
    `/* Begin PBXFileReference section */\n\t\t${fileRefId} /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = App/PrivacyInfo.xcprivacy; sourceTree = SOURCE_ROOT; };`
  );

  const resourcesStart = /(\/\* Resources \*\/ = \{\s*isa = PBXResourcesBuildPhase;[\s\S]*?files = \(\s*)/;
  if (!resourcesStart.test(project)) throw new Error('Xcode Resources build phase not found for PrivacyInfo.xcprivacy.');
  project = project.replace(resourcesStart, `$1\n\t\t\t\t${buildFileId} /* PrivacyInfo.xcprivacy in Resources */,`);
  await fs.writeFile(projectPath, project);
}

console.log(`[mobile] iOS push bridge, APNs ${apnsEnvironment} entitlement and Apple Privacy Manifest configured.`);
