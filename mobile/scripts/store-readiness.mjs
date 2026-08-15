import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(here, '..');
const repoRoot = path.resolve(mobileRoot, '..');
const strictStore = process.argv.includes('--strict-store') || process.argv.includes('--strict-signing');

const checks = [];
const add = (name, ok, detail, blocking = true) => checks.push({ name, ok:!!ok, detail, blocking });
const exists = async value => fs.access(value).then(() => true).catch(() => false);
const read = async value => fs.readFile(value, 'utf8');

const config = JSON.parse(await read(path.join(mobileRoot, 'capacitor.config.json')));
const pkg = JSON.parse(await read(path.join(mobileRoot, 'package.json')));
const apiSource = await read(path.join(repoRoot, 'web/src/api.js'));
const privacyPath = path.join(repoRoot, 'legal/PRIVACIDADE.md');
const termsPath = path.join(repoRoot, 'legal/TERMOS.md');
const privacy = await read(privacyPath);

add('App identifier', config.appId === 'com.crilimcf.lumina', config.appId);
add('App name', config.appName === 'Lumina', config.appName);
add('Bundled web app', config.webDir === '../web/dist', config.webDir);
add('Capacitor stable major', /^8\./.test(pkg.dependencies?.['@capacitor/core'] || ''), pkg.dependencies?.['@capacitor/core']);
add('Android/iOS native packages', !!pkg.dependencies?.['@capacitor/android'] && !!pkg.dependencies?.['@capacitor/ios'], 'both platforms declared');
add('Native validation workflow', await exists(path.join(repoRoot, '.github/workflows/mobile-native.yml')), '.github/workflows/mobile-native.yml');
add('Production Web stays separate', await exists(path.join(repoRoot, 'web/vercel.json')), 'existing Vercel deployment remains independent');
add('Privacy policy', await exists(privacyPath), 'legal/PRIVACIDADE.md');
add('Terms', await exists(termsPath), 'legal/TERMOS.md');
add('Account deletion implementation', apiSource.includes("remove: () => call('/account/delete'"), 'authenticated account deletion API exposed to the UI');
add('Public deletion guidance', await exists(path.join(repoRoot, 'web/public/delete-account.html')), 'web/public/delete-account.html');
add('Native push migration', await exists(path.join(repoRoot, 'api/migrations/030_native_push.sql')), 'device tokens and delivery receipts');

const legalIdentityComplete = !privacy.includes('[nome/empresa a preencher]')
  && !privacy.includes('[email a preencher]')
  && !privacy.includes('[a preencher]');
add(
  'Legal controller identity/contact',
  legalIdentityComplete,
  legalIdentityComplete ? 'privacy controller fields completed' : 'owner/company, contact email and address/tax details still require the legal owner',
  strictStore
);

const external = [
  ['Android Play signing', process.env.ANDROID_KEYSTORE_BASE64 && process.env.ANDROID_KEY_ALIAS && process.env.ANDROID_KEYSTORE_PASSWORD, 'Google Play upload signing credentials'],
  ['Apple signing', process.env.IOS_CERTIFICATE_P12_BASE64 && process.env.IOS_PROVISIONING_PROFILE_BASE64 && process.env.APPLE_TEAM_ID, 'Apple Developer distribution credentials'],
  ['Android push provider', process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY, 'Firebase service account / app registration'],
  ['iOS push provider', process.env.APNS_TEAM_ID && process.env.APNS_KEY_ID && process.env.APNS_PRIVATE_KEY, 'Apple APNs key'],
];
for (const [name, ok, detail] of external) add(name, !!ok, detail, strictStore);

console.log('\nLumina mobile store-readiness\n');
for (const check of checks) console.log(`${check.ok ? 'PASS' : (check.blocking ? 'FAIL' : 'WAIT')}  ${check.name} — ${check.detail}`);

const failures = checks.filter(item => !item.ok && item.blocking);
if (failures.length) {
  console.error(`\n${failures.length} blocking readiness check(s) failed.`);
  process.exitCode = 1;
} else {
  const waiting = checks.filter(item => !item.ok).length;
  console.log(`\nTechnical project checks passed.${waiting ? ` ${waiting} external owner/signing/provider item(s) are intentionally waiting.` : ''}`);
}
