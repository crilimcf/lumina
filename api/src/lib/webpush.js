import crypto from 'node:crypto';
import { q, tx } from '../db.js';

const SECRET_NAME = 'web_push_vapid_v1';
const VAPID_SUBJECT = 'https://lumina-snowy-ten.vercel.app';
const CALL_RETRY_DELAYS = [2600, 7600, 15000];

const b64url = (value) => Buffer.from(value).toString('base64url');
const decode64 = (value) => Buffer.from(String(value || ''), 'base64url');

export function validPushEndpoint(value) {
  let url;
  try { url = new URL(String(value || '')); }
  catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  if (url.port && url.port !== '443') return false;
  const host = url.hostname.toLowerCase();
  return host === 'web.push.apple.com'
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

async function sendWake(endpoint, key) {
  if (!validPushEndpoint(endpoint)) return { stale:true, status:0 };

  const jwt = makeVapidJwt(endpoint, key);
  const publicKey = publicApplicationKey(key.x, key.y);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'error',
      headers: {
        TTL: '120',
        Urgency: 'high',
        Authorization: `vapid t=${jwt}, k=${publicKey}`,
      },
      signal: AbortSignal.timeout(7_000),
    });
    return { stale: response.status === 404 || response.status === 410, status: response.status };
  } catch {
    return { stale:false, status:0 };
  }
}

async function subscriptionsFor(userId) {
  const { rows } = await q(
    `SELECT endpoint FROM web_push_subscriptions
     WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 8`,
    [userId]
  );
  return rows;
}

async function deliverWake(userId, key, subscriptions = null) {
  const rows = subscriptions || await subscriptionsFor(userId);
  if (!rows.length) return { attempted:0, accepted:0 };

  const results = await Promise.all(rows.map(async ({ endpoint }) => ({ endpoint, ...(await sendWake(endpoint, key)) })));
  const stale = results.filter(r => r.stale).map(r => r.endpoint);
  if (stale.length) await q('DELETE FROM web_push_subscriptions WHERE endpoint = ANY($1::text[])', [stale]);
  return {
    attempted: results.length,
    accepted: results.filter(r => r.status >= 200 && r.status < 300).length,
  };
}

function scheduleIncomingCallRetries(userId, callId, key) {
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
        await deliverWake(userId, key);
      } catch (error) {
        console.debug('[push] retry chamada', error?.message);
      }
    }, delay);
    timer.unref?.();
  }
}

async function latestIncomingCallId(userId) {
  const { rows } = await q(
    `SELECT data->>'callId' AS call_id
     FROM notifications
     WHERE user_id=$1 AND read_at IS NULL AND type='incoming_call'
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  return rows[0]?.call_id || null;
}

export async function sendPushToUser(userId) {
  if (!userId) return { attempted:0, accepted:0 };
  const subscriptions = await subscriptionsFor(userId);
  if (!subscriptions.length) return { attempted:0, accepted:0 };

  const key = await getOrCreateVapid();
  const result = await deliverWake(userId, key, subscriptions);

  // Uma chamada não pode depender de um único wake-up. iOS pode atrasar um
  // push pontual em redes móveis; repetimos apenas enquanto a sessão continua
  // realmente a tocar. Mensagens normais continuam a gerar um único push.
  const callId = await latestIncomingCallId(userId).catch(() => null);
  if (callId) scheduleIncomingCallRetries(userId, callId, key);

  return result;
}
