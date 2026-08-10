import crypto from 'node:crypto';
import { q, tx } from '../db.js';

const SECRET_NAME = 'web_push_vapid_v1';
const VAPID_SUBJECT = 'https://lumina-snowy-ten.vercel.app';

const b64url = (value) => Buffer.from(value).toString('base64url');
const decode64 = (value) => Buffer.from(String(value || ''), 'base64url');

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
  let parsed;
  try { parsed = new URL(endpoint); }
  catch { return { stale:true, status:0 }; }
  if (parsed.protocol !== 'https:') return { stale:true, status:0 };

  const jwt = makeVapidJwt(endpoint, key);
  const publicKey = publicApplicationKey(key.x, key.y);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
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

export async function sendPushToUser(userId) {
  if (!userId) return { attempted:0, accepted:0 };
  const { rows } = await q(
    `SELECT endpoint FROM web_push_subscriptions
     WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 8`,
    [userId]
  );
  if (!rows.length) return { attempted:0, accepted:0 };

  const key = await getOrCreateVapid();
  const results = await Promise.all(rows.map(async ({ endpoint }) => ({ endpoint, ...(await sendWake(endpoint, key)) })));
  const stale = results.filter(r => r.stale).map(r => r.endpoint);
  if (stale.length) await q('DELETE FROM web_push_subscriptions WHERE endpoint = ANY($1::text[])', [stale]);
  return {
    attempted: results.length,
    accepted: results.filter(r => r.status >= 200 && r.status < 300).length,
  };
}
