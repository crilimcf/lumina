import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const androidRoot = path.resolve(here, '../android');
const manifestPath = path.join(androidRoot, 'app/src/main/AndroidManifest.xml');
const drawablePath = path.join(androidRoot, 'app/src/main/res/drawable/ic_stat_lumina.xml');

let manifest = await fs.readFile(manifestPath, 'utf8');
if (!manifest.includes('com.google.firebase.messaging.default_notification_icon')) {
  manifest = manifest.replace(
    /<application([^>]*)>/,
    `<application$1>\n        <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_lumina" />`
  );
  await fs.writeFile(manifestPath, manifest);
}

const vector = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFFFF"
        android:pathData="M12,1.8 L14.45,8.05 L21.2,8.45 L16,12.75 L17.65,19.3 L12,15.65 L6.35,19.3 L8,12.75 L2.8,8.45 L9.55,8.05 Z" />
    <path
        android:fillColor="#FFFFFFFF"
        android:pathData="M12,9.2 A2.8,2.8 0,1 0,12 14.8 A2.8,2.8 0,1 0,12 9.2" />
</vector>
`;
await fs.mkdir(path.dirname(drawablePath), { recursive:true });
await fs.writeFile(drawablePath, vector);

console.log('[mobile] Android push icon configured; channel lumina_activity is created at runtime.');
