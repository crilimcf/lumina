import crypto from 'node:crypto';
import http2 from 'node:http2';
import { env } from '../env.js';

const b64 = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const normalizePrivateKey = value => String(value || '').replace(/\\n/g, '\n').trim();

let fcmAccess = null;
let apnsToken = null;

function signedJwt({ header, payload, key, algorithm, dsaEncoding }) {
  const input = `${b64(header)}.${b64(payload)}`;
  const signature = crypto.sign(algorithm, Buffer.from(input), dsaEncoding ? { key, dsaEncoding } : key).toString('base64url');
  return `${input}.${signature}`;
}

function fcmConfigured() {
  return !!(env.FCM_PROJECT_ID && env.FCM_CLIENT_EMAIL && env.FCM_PRIVATE_KEY);
}

function apnsConfigured() {
  return !!(env.APNS_TEAM_ID && env.APNS_KEY_ID && env.APNS_PRIVATE_KEY && env.APNS_BUNDLE_ID);
}

export function nativePushConfigured(platform) {
  return platform === 'android' ? fcmConfigured() : platform === 'ios' ? apnsConfigured() : false;
}

async function fcmAccessToken() {
  if (fcmAccess && fcmAccess.expiresAt > Date.now() + 60_000) return fcmAccess.token;
  const now = Math.floor(Date.now() / 1000);
  const assertion = signedJwt({
    header:{ alg:'RS256', typ:'JWT' },
    payload:{
      iss:env.FCM_CLIENT_EMAIL,
      scope:'https://www.googleapis.com/auth/firebase.messaging',
      aud:'https://oauth2.googleapis.com/token',
      iat:now,
      exp:now + 3600,
    },
    key:normalizePrivateKey(env.FCM_PRIVATE_KEY),
    algorithm:'RSA-SHA256',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method:'POST',
    headers:{ 'content-type':'application/x-www-form-urlencoded' },
    body:new URLSearchParams({ grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal:AbortSignal.timeout(8000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(`FCM OAuth ${response.status}: ${body.error_description || body.error || 'token unavailable'}`);
  fcmAccess = { token:body.access_token, expiresAt:Date.now() + Math.max(300, Number(body.expires_in || 3600) - 60) * 1000 };
  return fcmAccess.token;
}

async function sendFcm(token, notice, badge) {
  if (!fcmConfigured()) return { configured:false, accepted:false, stale:false, status:0 };
  const accessToken = await fcmAccessToken();
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(env.FCM_PROJECT_ID)}/messages:send`, {
    method:'POST',
    headers:{ Authorization:`Bearer ${accessToken}`, 'content-type':'application/json' },
    body:JSON.stringify({
      message:{
        token,
        notification:{ title:notice.title, body:notice.body },
        data:{
          url:String(notice.url || '/?tab=alerts'),
          type:String(notice.type || 'activity'),
          tag:String(notice.tag || 'lumina:activity'),
        },
        android:{
          priority:'high',
          notification:{
            channel_id:'lumina_activity',
            sound:'default',
            notification_count:Math.max(0, Number(badge) || 0),
          },
        },
      },
    }),
    signal:AbortSignal.timeout(8000),
  });
  const data = await response.json().catch(() => ({}));
  const detail = JSON.stringify(data).slice(0, 800);
  const stale = response.status === 404 || /UNREGISTERED|registration-token-not-registered/i.test(detail);
  return { configured:true, accepted:response.ok, stale, status:response.status, error:response.ok ? null : detail };
}

function apnsBearer() {
  const now = Math.floor(Date.now() / 1000);
  if (apnsToken && apnsToken.expiresAt > now + 120) return apnsToken.value;
  const value = signedJwt({
    header:{ alg:'ES256', kid:env.APNS_KEY_ID },
    payload:{ iss:env.APNS_TEAM_ID, iat:now },
    key:normalizePrivateKey(env.APNS_PRIVATE_KEY),
    algorithm:'sha256',
    dsaEncoding:'ieee-p1363',
  });
  apnsToken = { value, expiresAt:now + 3000 };
  return value;
}

async function sendApns(token, notice, badge) {
  if (!apnsConfigured()) return { configured:false, accepted:false, stale:false, status:0 };
  const host = env.APNS_PRODUCTION ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
  const client = http2.connect(host);
  const body = JSON.stringify({
    aps:{
      alert:{ title:notice.title, body:notice.body },
      sound:'default',
      badge:Math.max(0, Number(badge) || 0),
    },
    url:String(notice.url || '/?tab=alerts'),
    type:String(notice.type || 'activity'),
    tag:String(notice.tag || 'lumina:activity'),
  });

  try {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        try { client.close(); } catch { /* ignored */ }
        reject(new Error('APNs timeout'));
      }, 8000);
      const request = client.request({
        ':method':'POST',
        ':path':`/3/device/${encodeURIComponent(token)}`,
        authorization:`bearer ${apnsBearer()}`,
        'apns-topic':env.APNS_BUNDLE_ID,
        'apns-push-type':'alert',
        'apns-priority':'10',
        'content-type':'application/json',
        'content-length':Buffer.byteLength(body),
      });
      let status = 0;
      let responseBody = '';
      request.setEncoding('utf8');
      request.on('response', headers => { status = Number(headers[':status'] || 0); });
      request.on('data', chunk => { responseBody += chunk; });
      request.on('error', error => {
        clearTimeout(timeout); client.close(); reject(error);
      });
      request.on('end', () => {
        clearTimeout(timeout); client.close();
        const stale = status === 410 || /BadDeviceToken|Unregistered/i.test(responseBody);
        resolve({ configured:true, accepted:status >= 200 && status < 300, stale, status, error:status >= 200 && status < 300 ? null : responseBody.slice(0,800) });
      });
      request.end(body);
    });
  } finally {
    if (!client.closed && !client.destroyed) client.close();
  }
}

export async function sendNativePush(subscription, notice, badge = 0) {
  if (!subscription?.token || !subscription?.platform) return { configured:false, accepted:false, stale:true, status:0, error:'invalid subscription' };
  if (subscription.platform === 'android') return sendFcm(subscription.token, notice, badge);
  if (subscription.platform === 'ios') return sendApns(subscription.token, notice, badge);
  return { configured:false, accepted:false, stale:true, status:0, error:'unsupported platform' };
}
