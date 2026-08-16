import crypto from 'node:crypto';
import http2 from 'node:http2';
import { env } from '../env.js';
import { q } from '../db.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const APNS_AUDIENCE = 'https://appleid.apple.com';
let googleAccess = null;
let apnsJwt = null;

const b64url = value => Buffer.from(value).toString('base64url');
const nowSeconds = () => Math.floor(Date.now() / 1000);
const normalizedPrivateKey = value => String(value || '').replace(/\\n/g, '\n').trim();

const nativeConfigured = platform => platform === 'android'
  ? !!(env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY)
  : !!(env.APNS_TEAM_ID && env.APNS_KEY_ID && env.APNS_PRIVATE_KEY && env.APNS_BUNDLE_ID);

function googleAssertion() {
  const now = nowSeconds();
  const header = b64url(JSON.stringify({ alg:'RS256', typ:'JWT' }));
  const payload = b64url(JSON.stringify({
    iss:env.FIREBASE_CLIENT_EMAIL,
    scope:FCM_SCOPE,
    aud:GOOGLE_TOKEN_URL,
    iat:now,
    exp:now + 3600,
  }));
  const input = `${header}.${payload}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(input), normalizedPrivateKey(env.FIREBASE_PRIVATE_KEY)).toString('base64url');
  return `${input}.${signature}`;
}

async function googleToken() {
  if (googleAccess?.expiresAt > Date.now() + 60_000) return googleAccess.value;
  const body = new URLSearchParams({
    grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion:googleAssertion(),
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method:'POST',
    headers:{ 'content-type':'application/x-www-form-urlencoded' },
    body,
    signal:AbortSignal.timeout(8_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(`FCM OAuth HTTP ${response.status}`);
  googleAccess = { value:data.access_token, expiresAt:Date.now() + Math.max(300, Number(data.expires_in) || 3600) * 1000 };
  return googleAccess.value;
}

function apnsToken() {
  if (apnsJwt?.expiresAt > Date.now() + 60_000) return apnsJwt.value;
  const now = nowSeconds();
  const header = b64url(JSON.stringify({ alg:'ES256', kid:env.APNS_KEY_ID }));
  const payload = b64url(JSON.stringify({ iss:env.APNS_TEAM_ID, iat:now }));
  const input = `${header}.${payload}`;
  const signature = crypto.sign('sha256', Buffer.from(input), {
    key:normalizedPrivateKey(env.APNS_PRIVATE_KEY),
    dsaEncoding:'ieee-p1363',
  }).toString('base64url');
  apnsJwt = { value:`${input}.${signature}`, expiresAt:Date.now() + 50 * 60_000 };
  return apnsJwt.value;
}

const cleanNotification = (notification, badge) => ({
  title:String(notification?.title || 'Lumina').slice(0, 120),
  body:String(notification?.body || 'Tens uma novidade.').slice(0, 220),
  url:String(notification?.url || '/?tab=alerts').slice(0, 600),
  tag:String(notification?.tag || 'lumina:activity').slice(0, 180),
  badge:Math.max(0, Math.min(999, Number(badge) || 0)),
});

async function sendFcm(token, notification) {
  const accessToken = await googleToken();
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/messages:send`,
    {
      method:'POST',
      headers:{ authorization:`Bearer ${accessToken}`, 'content-type':'application/json' },
      body:JSON.stringify({
        message:{
          token,
          notification:{ title:notification.title, body:notification.body },
          data:{ url:notification.url, tag:notification.tag },
          android:{
            priority:'high',
            notification:{ channel_id:'lumina_activity', sound:'default', notification_count:notification.badge },
          },
        },
      }),
      signal:AbortSignal.timeout(8_000),
    }
  );
  const data = await response.json().catch(() => ({}));
  const code = String(data?.error?.details?.[0]?.errorCode || data?.error?.status || '');
  return {
    accepted:response.ok,
    stale:response.status === 404 || code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT',
    status:response.status,
  };
}

function sendApns(token, notification, environment) {
  return new Promise(resolve => {
    const sandbox = environment === 'sandbox' || (!environment && env.APNS_PRODUCTION === false);
    const authority = sandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
    const client = http2.connect(authority);
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      try { client.destroy(); } catch {}
      resolve(result);
    };
    client.setTimeout(8_000, () => finish({ accepted:false, stale:false, status:0 }));
    client.once('error', () => finish({ accepted:false, stale:false, status:0 }));
    const request = client.request({
      ':method':'POST',
      ':path':`/3/device/${encodeURIComponent(token)}`,
      authorization:`bearer ${apnsToken()}`,
      'apns-topic':env.APNS_BUNDLE_ID,
      'apns-push-type':'alert',
      'apns-priority':'10',
      'apns-expiration':String(nowSeconds() + 3600),
      'apns-collapse-id':notification.tag.slice(0, 64),
    });
    let status = 0;
    let data = '';
    request.setEncoding('utf8');
    request.on('response', headers => { status = Number(headers[':status'] || 0); });
    request.on('data', chunk => { data += chunk; });
    request.once('error', () => finish({ accepted:false, stale:false, status:0 }));
    request.on('end', () => {
      let reason = '';
      try { reason = JSON.parse(data || '{}').reason || ''; } catch {}
      finish({
        accepted:status >= 200 && status < 300,
        stale:status === 410 || ['BadDeviceToken','DeviceTokenNotForTopic','Unregistered'].includes(reason),
        status,
      });
    });
    request.end(JSON.stringify({
      aps:{ alert:{ title:notification.title, body:notification.body }, sound:'default', badge:notification.badge },
      url:notification.url,
      tag:notification.tag,
    }));
  });
}

export async function sendNativePushToUser(userId, notification, badge = 0) {
  const { rows } = await q(
    `SELECT token,platform,push_environment FROM push_tokens
     WHERE user_id=$1 AND platform IN ('ios','android')
     ORDER BY updated_at DESC LIMIT 12`,
    [userId]
  );
  const targets = rows.filter(row => nativeConfigured(row.platform));
  if (!targets.length || !notification) return { attempted:0, accepted:0, statuses:[] };
  const payload = cleanNotification(notification, badge);
  const results = await Promise.all(targets.map(async target => {
    try {
      const result = target.platform === 'ios'
        ? await sendApns(target.token, payload, target.push_environment)
        : await sendFcm(target.token, payload);
      return { token:target.token, ...result };
    } catch {
      return { token:target.token, accepted:false, stale:false, status:0 };
    }
  }));
  const stale = results.filter(result => result.stale).map(result => result.token);
  if (stale.length) await q('DELETE FROM push_tokens WHERE token=ANY($1::text[])', [stale]);
  return {
    attempted:results.length,
    accepted:results.filter(result => result.accepted).length,
    statuses:results.map(result => result.status),
  };
}

export const nativePushConfiguration = () => ({
  android:nativeConfigured('android'),
  ios:nativeConfigured('ios'),
});
