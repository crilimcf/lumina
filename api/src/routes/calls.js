import { Router } from 'express';
import { q } from '../db.js';
import { env } from '../env.js';
import { auth, h, bad, forbidden, notFound } from '../middleware/auth.js';
import { sendPushToUser } from '../lib/webpush.js';
import { groupCallRoutes } from './group-calls.js';

export const callRoutes = Router();
callRoutes.use(groupCallRoutes);

const BASE_STUN = {
  urls: [
    'stun:stun.cloudflare.com:3478',
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
  ],
};
const TURN_CACHE_MS = 50 * 60_000;
let turnCache = null;

function browserSafeIceUrl(value) {
  const url = String(value || '').trim();
  if (!/^(?:stun|turn|turns):/i.test(url)) return null;
  if (/^(?:stun|turn|turns):[^?]*:53(?:\?|$)/i.test(url)) return null;
  return url;
}

function cleanIceServers(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = Array.isArray(item.urls) ? item.urls : [item.urls];
    const urls = raw.map(browserSafeIceUrl).filter(Boolean);
    if (!urls.length) continue;
    const next = { urls };
    if (typeof item.username === 'string' && item.username) next.username = item.username;
    if (typeof item.credential === 'string' && item.credential) next.credential = item.credential;
    out.push(next);
  }
  return out;
}

function staticTurnServers() {
  const urls = String(env.TURN_URLS || '').split(',').map(v => v.trim()).filter(Boolean);
  if (!urls.length) return [];
  return cleanIceServers([{ urls, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL }]);
}

async function cloudflareTurnServers() {
  const keyId = String(env.TURN_CLOUDFLARE_KEY_ID || '').trim();
  const token = String(env.TURN_CLOUDFLARE_API_TOKEN || '').trim();
  if (!keyId || !token) return [];
  if (!/^[a-f0-9]{32}$/i.test(keyId)) {
    console.warn('[calls] TURN_CLOUDFLARE_KEY_ID inválido');
    return [];
  }
  if (turnCache && turnCache.expiresAt > Date.now()) return turnCache.iceServers;

  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ttl: 3600 }),
        signal: AbortSignal.timeout(5_000),
        redirect: 'error',
      }
    );
    if (!response.ok) throw new Error(`Cloudflare TURN HTTP ${response.status}`);
    const data = await response.json();
    const iceServers = cleanIceServers(data?.iceServers).filter(server =>
      server.urls.some(url => /^(?:turn|turns):/i.test(url))
      || server.urls.some(url => /^stun:/i.test(url))
    );
    if (!iceServers.some(server => server.urls.some(url => /^(?:turn|turns):/i.test(url)))) {
      throw new Error('Cloudflare TURN respondeu sem relay');
    }
    turnCache = { iceServers, expiresAt: Date.now() + TURN_CACHE_MS };
    return iceServers;
  } catch (error) {
    console.warn('[calls] Não foi possível obter credenciais TURN:', error?.message);
    return [];
  }
}

async function rtcIceConfig() {
  const cloudflare = await cloudflareTurnServers();
  const staticTurn = cloudflare.length ? [] : staticTurnServers();
  const managed = cloudflare.length ? cloudflare : staticTurn;
  const iceServers = [BASE_STUN, ...managed];
  return {
    iceServers,
    relayConfigured: iceServers.some(server => server.urls.some(url => /^(?:turn|turns):/i.test(url))),
    relaySource: cloudflare.length ? 'cloudflare' : staticTurn.length ? 'managed' : 'none',
  };
}

async function blocked(a, b) {
  const { rows } = await q(
    `SELECT 1 FROM blocks
     WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)
     LIMIT 1`,
    [a, b]
  );
  return !!rows[0];
}

async function threadForUser(threadId, userId) {
  const { rows } = await q(
    `SELECT t.*, CASE WHEN t.user_a=$2 THEN t.user_b ELSE t.user_a END AS other_id
     FROM threads t
     JOIN users other
       ON other.id = CASE WHEN t.user_a=$2 THEN t.user_b ELSE t.user_a END
      AND other.suspended_at IS NULL
     WHERE t.id=$1 AND (t.user_a=$2 OR t.user_b=$2)`,
    [threadId, userId]
  );
  if (!rows[0]) throw forbidden('Não fazes parte desta conversa');
  if (await blocked(userId, rows[0].other_id)) throw forbidden('Esta conversa já não está disponível');
  return rows[0];
}

async function callForUser(callId, userId) {
  const { rows } = await q(
    `SELECT cs.*
     FROM call_sessions cs
     JOIN users other
       ON other.id = CASE WHEN cs.caller_id=$2 THEN cs.callee_id ELSE cs.caller_id END
      AND other.suspended_at IS NULL
     WHERE cs.id=$1 AND (cs.caller_id=$2 OR cs.callee_id=$2)`,
    [callId, userId]
  );
  const call = rows[0];
  if (!call) throw notFound('Chamada não encontrada');
  const otherId = call.caller_id === userId ? call.callee_id : call.caller_id;
  if (await blocked(userId, otherId)) throw forbidden('Esta chamada já não está disponível');
  return call;
}

async function pushReadyFor(userId) {
  const { rows } = await q(
    `SELECT EXISTS(
       SELECT 1 FROM web_push_subscriptions WHERE user_id=$1
       UNION ALL
       SELECT 1 FROM push_tokens WHERE user_id=$1 AND platform IN ('ios','android')
     ) AS ready`,
    [userId]
  );
  return !!rows[0]?.ready;
}

callRoutes.get('/ice-config', auth, h(async (_req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.json(await rtcIceConfig());
}));

callRoutes.post('/', auth, h(async (req, res) => {
  const threadId = String(req.body.threadId || '');
  const mode = String(req.body.mode || 'audio');
  if (!['audio', 'video'].includes(mode)) throw bad('Tipo de chamada inválido');
  const thread = await threadForUser(threadId, req.user.id);

  await q(
    `UPDATE call_sessions SET status='ended', ended_at=now()
     WHERE thread_id=$1 AND status IN ('ringing','active')
       AND (caller_id=$2 OR callee_id=$2)`,
    [threadId, req.user.id]
  );

  const [{ rows }, calleePushReady] = await Promise.all([
    q(
      `INSERT INTO call_sessions (thread_id,caller_id,callee_id,mode)
       VALUES ($1,$2,$3,$4)
       RETURNING id,thread_id,caller_id,callee_id,mode,status,created_at,
                 push_attempted,push_accepted,push_last_at,callee_seen_at`,
      [threadId, req.user.id, thread.other_id, mode]
    ),
    pushReadyFor(thread.other_id),
  ]);
  const call = rows[0];
  const push = await sendPushToUser(thread.other_id, {
    callId:call.id,
    notification:{
      title:`Chamada de ${req.user.name || req.user.handle}`,
      body:mode === 'video' ? 'Videochamada recebida' : 'Chamada de áudio recebida',
      tag:`lumina:call:${call.id}`,
      url:`/?tab=dms&call=${encodeURIComponent(call.id)}`,
    },
  }).catch(error => {
    console.debug('[push] chamada inicial', error?.message);
    return { attempted:0, accepted:0, encrypted:0, statuses:[] };
  });

  if (push.attempted > 0) {
    await q(
      `UPDATE call_sessions
          SET push_attempted=$2,push_accepted=$3,push_last_at=now()
        WHERE id=$1`,
      [call.id, push.attempted, push.accepted]
    );
  }

  res.status(201).json({
    ...call,
    push_attempted:push.attempted,
    push_accepted:push.accepted,
    push_encrypted:push.encrypted,
    callee_push_ready:calleePushReady,
  });
}));

callRoutes.get('/incoming', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT cs.id,cs.thread_id,cs.caller_id,cs.callee_id,cs.mode,cs.status,cs.created_at,
            cs.push_attempted,cs.push_accepted,cs.push_last_at,cs.callee_seen_at,
            u.name,u.handle,u.palette,u.avatar_url
     FROM call_sessions cs
     JOIN users u ON u.id=cs.caller_id AND u.suspended_at IS NULL
     WHERE cs.callee_id=$1 AND cs.status='ringing' AND cs.created_at > now()-interval '2 minutes'
       AND NOT EXISTS (
         SELECT 1 FROM blocks b
         WHERE (b.blocker_id=$1 AND b.blocked_id=cs.caller_id)
            OR (b.blocked_id=$1 AND b.blocker_id=cs.caller_id)
       )
     ORDER BY cs.created_at DESC LIMIT 1`,
    [req.user.id]
  );
  const call = rows[0] || null;
  if (call) {
    await q(
      `UPDATE call_sessions SET callee_seen_at=COALESCE(callee_seen_at,now()) WHERE id=$1`,
      [call.id]
    );
    call.callee_seen_at = call.callee_seen_at || new Date().toISOString();
  }
  res.json(call);
}));

callRoutes.post('/:callId/answer', auth, h(async (req, res) => {
  const call = await callForUser(req.params.callId, req.user.id);
  if (call.callee_id !== req.user.id) throw forbidden('Só quem recebe pode atender');
  if (call.status !== 'ringing') throw bad('A chamada já não está a tocar');
  const { rows } = await q(
    `UPDATE call_sessions SET status='active', answered_at=now(),callee_seen_at=COALESCE(callee_seen_at,now())
     WHERE id=$1 RETURNING *`,
    [call.id]
  );
  res.json(rows[0]);
}));

callRoutes.post('/:callId/decline', auth, h(async (req, res) => {
  const call = await callForUser(req.params.callId, req.user.id);
  if (call.callee_id !== req.user.id) throw forbidden();
  await q(`UPDATE call_sessions SET status='declined', ended_at=now(),callee_seen_at=COALESCE(callee_seen_at,now()) WHERE id=$1 AND status='ringing'`, [call.id]);
  res.json({ declined: true });
}));

callRoutes.post('/:callId/end', auth, h(async (req, res) => {
  const call = await callForUser(req.params.callId, req.user.id);
  await q(`UPDATE call_sessions SET status='ended', ended_at=now() WHERE id=$1 AND status<>'ended'`, [call.id]);
  await q(`INSERT INTO call_signals (call_id,sender_id,kind,payload) VALUES ($1,$2,'hangup','{}'::jsonb)`, [call.id, req.user.id]);
  res.json({ ended: true });
}));

callRoutes.get('/:callId/sync', auth, h(async (req, res) => {
  const call = await callForUser(req.params.callId, req.user.id);
  const rawAfter = req.query.after === undefined ? 0 : Number(req.query.after);
  if (!Number.isSafeInteger(rawAfter) || rawAfter < 0) throw bad('Cursor de sinal inválido', 'bad_cursor');
  const { rows: signals } = await q(
    `SELECT id,sender_id,kind,payload,created_at
     FROM call_signals
     WHERE call_id=$1 AND sender_id<>$2 AND id>$3
     ORDER BY id ASC LIMIT 200`,
    [call.id, req.user.id, rawAfter]
  );
  res.json({
    status: call.status,
    answeredAt: call.answered_at,
    endedAt: call.ended_at,
    pushAttempted: call.push_attempted || 0,
    pushAccepted: call.push_accepted || 0,
    pushLastAt: call.push_last_at,
    calleeSeenAt: call.callee_seen_at,
    signals,
  });
}));

callRoutes.get('/:callId', auth, h(async (req, res) => {
  res.json(await callForUser(req.params.callId, req.user.id));
}));

callRoutes.post('/:callId/signals', auth, h(async (req, res) => {
  const call = await callForUser(req.params.callId, req.user.id);
  if (['ended', 'declined'].includes(call.status)) throw bad('A chamada terminou');
  const kind = String(req.body.kind || '');
  if (!['offer', 'answer', 'ice', 'hangup'].includes(kind)) throw bad('Sinal inválido');
  const payload = req.body.payload ?? null;
  const { rows } = await q(
    `INSERT INTO call_signals (call_id,sender_id,kind,payload) VALUES ($1,$2,$3,$4::jsonb)
     RETURNING id,kind,payload,created_at`,
    [call.id, req.user.id, kind, JSON.stringify(payload)]
  );
  res.status(201).json(rows[0]);
}));

callRoutes.get('/:callId/signals', auth, h(async (req, res) => {
  const call = await callForUser(req.params.callId, req.user.id);
  const rawAfter = req.query.after === undefined ? 0 : Number(req.query.after);
  if (!Number.isSafeInteger(rawAfter) || rawAfter < 0) throw bad('Cursor de sinal inválido', 'bad_cursor');
  const { rows } = await q(
    `SELECT id,sender_id,kind,payload,created_at
     FROM call_signals WHERE call_id=$1 AND sender_id<>$2 AND id>$3
     ORDER BY id ASC LIMIT 200`,
    [call.id, req.user.id, rawAfter]
  );
  res.json(rows);
}));
