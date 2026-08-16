import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const packageName = process.env.PLAY_PACKAGE_NAME || 'pt.digibox.lumina';
const track = process.env.PLAY_TRACK || 'internal';
const releaseStatus = process.env.PLAY_RELEASE_STATUS || 'completed';
const bundlePath = process.env.PLAY_BUNDLE_PATH;
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const releaseName = process.env.PLAY_RELEASE_NAME || 'Lumina mobile release';
const validStatuses = new Set(['draft', 'inProgress', 'halted', 'completed']);

if (!bundlePath || !credentialsPath) {
  throw new Error('PLAY_BUNDLE_PATH e GOOGLE_APPLICATION_CREDENTIALS são obrigatórios');
}
if (!validStatuses.has(releaseStatus)) throw new Error(`Estado Play inválido: ${releaseStatus}`);

const credentials = JSON.parse(await fs.readFile(credentialsPath, 'utf8'));
if (!credentials.client_email || !credentials.private_key) throw new Error('Service account Google Play inválida');

const b64url = value => Buffer.from(value).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const input = `${b64url(JSON.stringify({ alg:'RS256', typ:'JWT' }))}.${b64url(JSON.stringify({
  iss:credentials.client_email,
  scope:'https://www.googleapis.com/auth/androidpublisher',
  aud:credentials.token_uri || 'https://oauth2.googleapis.com/token',
  iat:now,
  exp:now + 3600,
}))}`;
const signature = crypto.sign('RSA-SHA256', Buffer.from(input), credentials.private_key).toString('base64url');
const assertion = `${input}.${signature}`;

const tokenResponse = await fetch(credentials.token_uri || 'https://oauth2.googleapis.com/token', {
  method:'POST',
  headers:{ 'content-type':'application/x-www-form-urlencoded' },
  body:new URLSearchParams({
    grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  }),
  signal:AbortSignal.timeout(30_000),
});
const tokenData = await tokenResponse.json().catch(() => ({}));
if (!tokenResponse.ok || !tokenData.access_token) {
  throw new Error(`OAuth Google Play falhou (${tokenResponse.status}): ${JSON.stringify(tokenData)}`);
}

const auth = { authorization:`Bearer ${tokenData.access_token}` };
const apiBase = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}`;
const checkedJson = async (response, action) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${action} falhou (${response.status}): ${JSON.stringify(data)}`);
  return data;
};

const edit = await checkedJson(await fetch(`${apiBase}/edits`, {
  method:'POST',
  headers:{ ...auth, 'content-type':'application/json' },
  body:'{}',
  signal:AbortSignal.timeout(30_000),
}), 'Criar edit');

const bundle = await fs.readFile(bundlePath);
const uploaded = await checkedJson(await fetch(
  `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/edits/${encodeURIComponent(edit.id)}/bundles?uploadType=media`,
  {
    method:'POST',
    headers:{ ...auth, 'content-type':'application/octet-stream' },
    body:bundle,
    signal:AbortSignal.timeout(180_000),
  }
), 'Carregar AAB');

const versionCode = String(uploaded.versionCode || '');
if (!versionCode) throw new Error('Google Play não devolveu o versionCode do AAB');

await checkedJson(await fetch(`${apiBase}/edits/${encodeURIComponent(edit.id)}/tracks/${encodeURIComponent(track)}`, {
  method:'PUT',
  headers:{ ...auth, 'content-type':'application/json' },
  body:JSON.stringify({
    track,
    releases:[{
      name:releaseName,
      status:releaseStatus,
      versionCodes:[versionCode],
      releaseNotes:[
        { language:'pt-PT', text:'Primeira versão móvel nativa da Lumina.' },
        { language:'en-US', text:'First native mobile release of Lumina.' },
      ],
    }],
  }),
  signal:AbortSignal.timeout(30_000),
}), 'Atualizar faixa');

await checkedJson(await fetch(
  `${apiBase}/edits/${encodeURIComponent(edit.id)}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW`,
  { method:'POST', headers:auth, signal:AbortSignal.timeout(30_000) }
), 'Submeter edit');

console.log(`AAB ${versionCode} submetido à faixa ${track} (${releaseStatus}).`);
