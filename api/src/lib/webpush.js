import crypto from 'node:crypto';
import { q, tx } from '../db.js';
import { sendNativePushToUser } from './nativepush.js';

const SECRET_NAME = 'web_push_vapid_v1';
const APP_ORIGIN = 'https://lumina-snowy-ten.vercel.app';
const VAPID_SUBJECT = APP_ORIGIN;
const CALL_RETRY_DELAYS = [2600, 7600, 15000];
const MAX_PUSH_PLAINTEXT = 3600;
const RECORD_SIZE = 4096;

const b64url = (value) => Buffer.from(value).toString('base64url');
const decode64 = (value) => Buffer.from(String(value || ''), 'base64url');
const hmac = (key, value) => crypto.createHmac('sha256', key).update(value).digest();
const expandOne = (prk, info, length) => hmac(prk, Buffer.concat([info, Buffer.from([1])])).subarray(0, length);

export function validPushEndpoint(value) {
  let url;
  try { url = new URL(String(value || '')); }
  catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  if (url.port && url.port !== '443') return false;
  const host = url.hostname.toLowerCase();
  return host === 'web.push.apple.com'
    || host.endsWith('.push.apple.com')
    || host === 'fcm.googleapis.com'
    || host === 'updates.push.services.mozilla.com'
    || host.endsWith('.push.services.mozilla.com')
    || host.endsWith('.notify.windows.com');
}

function publicApplicationKey(x, y) {
  return Buffer.concat([Buffer.from([4]), decode64(x), decode64(y)]).toString('base64url');
}

async function getOrCreateVapid() {
  const existing = await q('SELECT value FROM app_secrets WHERE name=$1', [SECRET_NAME]);
  if (existing.rows[0]?.value?.d) return existing.rows[0].value;

  const generated = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = generated.privateKey.export({ format: 'jwk' });
  const value = { kty:'EC', crv:'P-256', x:jwk.x, y:jwk.y, d:jwk.d };

  await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock($1)', [4_817_339]);
    await c.query(
      `INSERT INTO app_secrets (name,value)
       VALUES ($1,$2::jsonb)
       ON CONFLICT (name) DO NOTHING`,
      [SECRET_NAME, JSON.stringify(value)]
    );
  });

  const final = await q('SELECT value FROM app_secrets WHERE name=$1', [SECRET_NAME]);
  if (!final.rows[0]?.value?.d) throw new Error('Não foi possível inicializar Web Push');
  return final.rows[0].value;
}

export async function vapidPublicKey() {
  const key = await getOrCreateVapid();
  return publicApplicationKey(key.x, key.y);
}

function makeVapidJwt(endpoint, key) {
  const audience = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ typ:'JWT', alg:'ES256' }));
  const payload = b64url(JSON.stringify({ aud:audience, exp:now + 12 * 60 * 60, sub:VAPID_SUBJECT }));
  const signingInput = `${header}.${payload}`;
  const privateKey = crypto.createPrivateKey({
    key: { kty:'EC', crv:'P-256', x:key.x, y:key.y, d:key.d },
    format: 'jwk',
  });
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `${signingInput}.${signature}`;
}

/**
 * RFC 8291 + RFC 8188, aes128gcm, single record.
 * Exportada para podermos validar criptograficamente o payload nos testes sem
 * depender de um serviço Push externo.
 */
export function encryptWebPushPayload(payload, subscription) {
  const uaPublic = decode64(subscription?.p256dh);
  const authSecret = decode64(subscription?.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || authSecret.length < 16) {
    throw new Error('Chaves da subscrição Web Push inválidas');
  }

  const plaintext = Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload));
  if (!plaintext.length || plaintext.length > MAX_PUSH_PLAINTEXT) throw new Error('Payload Web Push inválido');

  const asEcdh = crypto.createECDH('prime256v1');
  const asPublic = asEcdh.generateKeys();
  const sharedSecret = asEcdh.computeSecret(uaPublic);
  const prkKey = hmac(authSecret, sharedSecret);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = expandOne(prkKey, keyInfo, 32);

  const salt = crypto.randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = expandOne(prk, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = expandOne(prk, Buffer.from('Content-Encoding: nonce\0'), 12);

  const recordPlaintext = Buffer.concat([plaintext, Buffer.from([2])]);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(recordPlaintext), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header[20] = asPublic.length;
  const body = Buffer.concat([header, asPublic, encrypted]);
  if (body.length > 4096) throw new Error('Payload Web Push excede o limite de 4096 bytes');
  return body;
}

function absoluteNavigation(value) {
  try { return new URL(String(value || '/?tab=alerts'), APP_ORIGIN).toString(); }
  catch { return `${APP_ORIGIN}/?tab=alerts`; }
}

function addNotificationId(value, notificationId) {
  const url = new URL(absoluteNavigation(value));
  if (notificationId) url.searchParams.set('notification', String(notificationId));
  return url.toString();
}

export function declarativePayload(notification, badge = 0) {
  const item = notification || {};
  const appBadge = Math.max(0, Math.min(999, Number(badge) || 0));
  return {
    web_push: 8030,
    app_badge: String(appBadge),
    notification: {
      title: String(item.title || 'Lumina').slice(0, 120),
      body: String(item.body || 'Tens uma novidade.').slice(0, 220),
      navigate: absoluteNavigation(item.url),
      silent: false,
      tag: String(item.tag || 'lumina:activity').slice(0, 180),
    },
  };
}

async function latestNotificationFor(userId) {
  const [{ rows }, countResult] = await Promise.all([
    q(
      `SELECT n.id,COALESCE(n.type,n.kind) AS type,
              CASE WHEN n.type IS NULL THEN COALESCE(n.payload,'{}'::jsonb) ELSE n.data END AS data,
              a.name AS actor_name
       FROM notifications n
       LEFT JOIN users a ON a.id=n.actor_id
       WHERE n.user_id=$1 AND n.read_at IS NULL
         AND COALESCE(n.type,n.kind) IN ('message','incoming_call')
       ORDER BY n.created_at DESC LIMIT 1`,
      [userId]
    ),
    q('SELECT count(*)::int AS count FROM notifications WHERE user_id=$1 AND read_at IS NULL', [userId]),
  ]);
  const item = rows[0];
  if (!item) return { notification:null, badge:countResult.rows[0]?.count || 0, callId:null };
  const name = item.actor_name || 'Alguém';
  if (item.type === 'incoming_call') {
    return {
      notification: {
        title:`Chamada de ${name}`,
        body:item.data?.mode === 'video' ? 'Videochamada recebida' : 'Chamada de áudio recebida',
        tag:`lumina:call:${item.data?.callId || item.id}`,
        url:addNotificationId(`/?tab=dms&call=${encodeURIComponent(item.data?.callId || '')}`, item.id),
      },
      badge:countResult.rows[0]?.count || 0,
      callId:item.data?.callId || null,
    };
  }
  const kind = item.data?.kind;
  const mediaType = item.data?.mediaType;
  const mode = item.data?.mode;
  return {
    notification: {
      title:name,
      body:kind === 'media'
        ? (mode === 'once' ? `Enviou ${mediaType === 'video' ? 'um vídeo' : 'uma foto'} para veres uma vez` : `Enviou ${mediaType === 'video' ? 'um vídeo' : 'uma fotografia'}`)
        : 'Enviou-te uma mensagem',
      tag:`lumina:message:${item.data?.threadId || item.id}`,
      url:addNotificationId('/?tab=dms', item.id),
    },
    badge:countResult.rows[0]?.count || 0,
    callId:null,
  };
}

async function sendWake(subscription, key, pushPayload) {
  const endpoint = subscription?.endpoint;
  if (!validPushEndpoint(endpoint)) return { stale:true, status:0, encrypted:false };

  const jwt = makeVapidJwt(endpoint, key);
  const publicKey = publicApplicationKey(key.x, key.y);
  const headers = {
    TTL: '120',
    Urgency: 'high',
    Authorization: `vapid t=${jwt}, k=${publicKey}`,
  };
  let body;
  let encrypted = false;
  try {
    if (pushPayload && subscription?.p256dh && subscription?.auth) {
      body = encryptWebPushPayload(pushPayload, subscription);
      headers['Content-Encoding'] = 'aes128gcm';
      headers['Content-Type'] = 'application/octet-stream';
      encrypted = true;
    }
  } catch (error) {
    console.debug('[push] payload', error?.message);
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'error',
      headers,
      body,
      signal: AbortSignal.timeout(5_000),
    });
    return { stale: response.status === 404 || response.status === 410, status: response.status, encrypted };
  } catch {
    return { stale:false, status:0, encrypted };
  }
}

async function subscriptionsFor(userId) {
  const { rows } = await q(
    `SELECT endpoint,p256dh,auth FROM web_push_subscriptions
     WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 8`,
    [userId]
  );
  return rows;
}

async function deliverWake(userId, key, subscriptions = null, pushPayload = null) {
  const rows = subscriptions || await subscriptionsFor(userId);
  if (!rows.length) return { attempted:0, accepted:0, encrypted:0, statuses:[] };

  const results = await Promise.all(rows.map(async (subscription) => ({ endpoint:subscription.endpoint, ...(await sendWake(subscription, key, pushPayload)) })));
  const stale = results.filter(r => r.stale).map(r => r.endpoint);
  if (stale.length) await q('DELETE FROM web_push_subscriptions WHERE endpoint = ANY($1::text[])', [stale]);
  return {
    attempted: results.length,
    accepted: results.filter(r => r.status >= 200 && r.status < 300).length,
    encrypted: results.filter(r => r.encrypted).length,
    statuses: results.map(r => r.status),
  };
}

function scheduleIncomingCallRetries(userId, callId, key, pushPayload, notification, badge) {
  if (!callId) return;
  for (const delay of CALL_RETRY_DELAYS) {
    const timer = setTimeout(async () => {
      try {
        const { rows } = await q(
          `SELECT 1 FROM call_sessions
           WHERE id=$1 AND callee_id=$2 AND status='ringing'
             AND created_at > now()-interval '2 minutes'`,
          [callId, userId]
        );
        if (!rows[0]) return;
        const [webRetry, nativeRetry] = await Promise.all([
          key ? deliverWake(userId, key, null, pushPayload) : { attempted:0, accepted:0 },
          sendNativePushToUser(userId, notification, badge)
            .catch(() => ({ attempted:0, accepted:0 })),
        ]);
        await q(
          `UPDATE call_sessions
             SET push_attempted=push_attempted+$2,
                 push_accepted=push_accepted+$3,
                 push_last_at=now()
           WHERE id=$1`,
          [
            callId,
            webRetry.attempted + nativeRetry.attempted,
            webRetry.accepted + nativeRetry.accepted,
          ]
        ).catch(() => {});
      } catch (error) {
        console.debug('[push] retry chamada', error?.message);
      }
    }, delay);
    timer.unref?.();
  }
}

export async function sendPushToUser(userId, options = {}) {
  if (!userId) return { attempted:0, accepted:0, encrypted:0, statuses:[] };
  const subscriptions = await subscriptionsFor(userId);

  let latest;
  if (options.notification) {
    const countResult = await q('SELECT count(*)::int AS count FROM notifications WHERE user_id=$1 AND read_at IS NULL', [userId]);
    let notification = options.notification;
    if (options.callId) {
      const { rows: noticeRows } = await q(
        `SELECT id FROM notifications WHERE user_id=$1 AND type='incoming_call' AND data->>'callId'=$2 ORDER BY created_at DESC LIMIT 1`,
        [userId, String(options.callId)]
      );
      if (noticeRows[0]?.id) notification = { ...notification, url:addNotificationId(notification.url, noticeRows[0].id) };
    }
    latest = { notification, badge:countResult.rows[0]?.count || 0, callId:options.callId || null };
  } else latest = await latestNotificationFor(userId);
  const pushPayload = latest.notification ? declarativePayload(latest.notification, latest.badge) : null;
  let webResult = { attempted:0, accepted:0, encrypted:0, statuses:[] };
  let key = null;
  if (subscriptions.length) {
    key = await getOrCreateVapid();
    webResult = await deliverWake(userId, key, subscriptions, pushPayload);
  }
  const nativeResult = await sendNativePushToUser(userId, latest.notification, latest.badge)
    .catch(() => ({ attempted:0, accepted:0, statuses:[] }));

  const callId = options.callId || latest.callId;
  if (callId && latest.notification) {
    scheduleIncomingCallRetries(userId, callId, key, pushPayload, latest.notification, latest.badge);
  }
  return {
    attempted:webResult.attempted + nativeResult.attempted,
    accepted:webResult.accepted + nativeResult.accepted,
    encrypted:webResult.encrypted,
    statuses:[...webResult.statuses, ...nativeResult.statuses],
  };
}
