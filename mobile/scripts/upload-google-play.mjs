import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const packageName = process.env.GOOGLE_PLAY_PACKAGE || 'com.crilimcf.lumina';
const track = process.env.GOOGLE_PLAY_TRACK || 'internal';
const aabPath = process.argv[2];
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!aabPath || !credentialsPath) {
  throw new Error('Usage: GOOGLE_APPLICATION_CREDENTIALS=service-account.json node upload-google-play.mjs <app.aab>');
}

const service = JSON.parse(await fs.readFile(credentialsPath, 'utf8'));
if (!service.client_email || !service.private_key) throw new Error('Invalid Google Play service account JSON.');

const b64 = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = b64({ alg:'RS256', typ:'JWT' });
const payload = b64({
  iss:service.client_email,
  scope:'https://www.googleapis.com/auth/androidpublisher',
  aud:'https://oauth2.googleapis.com/token',
  iat:now,
  exp:now + 3600,
});
const input = `${header}.${payload}`;
const signature = crypto.sign('RSA-SHA256', Buffer.from(input), service.private_key).toString('base64url');
const assertion = `${input}.${signature}`;

const oauth = await fetch('https://oauth2.googleapis.com/token', {
  method:'POST',
  headers:{ 'content-type':'application/x-www-form-urlencoded' },
  body:new URLSearchParams({ grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  signal:AbortSignal.timeout(15000),
});
const oauthBody = await oauth.json().catch(() => ({}));
if (!oauth.ok || !oauthBody.access_token) throw new Error(`Google OAuth failed (${oauth.status}): ${JSON.stringify(oauthBody)}`);
const auth = { Authorization:`Bearer ${oauthBody.access_token}` };

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers:{ ...auth, ...(options.body ? { 'content-type':'application/json' } : {}), ...(options.headers || {}) },
    signal:AbortSignal.timeout(30000),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`Google Play API ${response.status}: ${text}`);
  return data;
}

const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}`;
const edit = await jsonRequest(`${base}/edits`, { method:'POST', body:'{}' });
if (!edit?.id) throw new Error('Google Play did not create an edit.');

try {
  const bytes = await fs.readFile(aabPath);
  const uploadResponse = await fetch(
    `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/edits/${encodeURIComponent(edit.id)}/bundles?uploadType=media`,
    {
      method:'POST',
      headers:{ ...auth, 'content-type':'application/octet-stream' },
      body:bytes,
      signal:AbortSignal.timeout(120000),
    }
  );
  const uploadText = await uploadResponse.text();
  const bundle = uploadText ? JSON.parse(uploadText) : null;
  if (!uploadResponse.ok || !bundle?.versionCode) throw new Error(`Bundle upload failed (${uploadResponse.status}): ${uploadText}`);

  await jsonRequest(`${base}/edits/${encodeURIComponent(edit.id)}/tracks/${encodeURIComponent(track)}`, {
    method:'PUT',
    body:JSON.stringify({ releases:[{ status:'completed', versionCodes:[String(bundle.versionCode)] }] }),
  });
  await jsonRequest(`${base}/edits/${encodeURIComponent(edit.id)}:commit`, { method:'POST', body:'{}' });
  console.log(`[play] Uploaded versionCode ${bundle.versionCode} to ${track}.`);
} catch (error) {
  await fetch(`${base}/edits/${encodeURIComponent(edit.id)}`, { method:'DELETE', headers:auth }).catch(() => {});
  throw error;
}
