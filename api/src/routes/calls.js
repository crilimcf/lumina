import { Router } from 'express';
import { q } from '../db.js';
import { auth, h, bad, forbidden, notFound } from '../middleware/auth.js';
import { sendPushToUser } from '../lib/webpush.js';

export const callRoutes = Router();

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

  const { rows } = await q(
    `INSERT INTO call_sessions (thread_id,caller_id,callee_id,mode)
     VALUES ($1,$2,$3,$4)
     RETURNING id,thread_id,caller_id,callee_id,mode,status,created_at`,
    [threadId, req.user.id, thread.other_id, mode]
  );
  sendPushToUser(thread.other_id).catch(error => console.debug('[push] chamada', error?.message));
  res.status(201).json(rows[0]);
}));

callRoutes.get('/incoming', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT cs.id,cs.thread_id,cs.caller_id,cs.callee_id,cs.mode,cs.status,cs.created_at,
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
  res.json(rows[0] || null);
}));

callRoutes.post('/:callId/answer', auth, h(async (req, res) => {
  const call = await callForUser(req.params.callId, req.user.id);
  if (call.callee_id !== req.user.id) throw forbidden('Só quem recebe pode atender');
  if (call.status !== 'ringing') throw bad('A chamada já não está a tocar');
  const { rows } = await q(
    `UPDATE call_sessions SET status='active', answered_at=now()
     WHERE id=$1 RETURNING *`,
    [call.id]
  );
  res.json(rows[0]);
}));

callRoutes.post('/:callId/decline', auth, h(async (req, res) => {
  const call = await callForUser(req.params.callId, req.user.id);
  if (call.callee_id !== req.user.id) throw forbidden();
  await q(`UPDATE call_sessions SET status='declined', ended_at=now() WHERE id=$1 AND status='ringing'`, [call.id]);
  res.json({ declined: true });
}));

callRoutes.post('/:callId/end', auth, h(async (req, res) => {
  const call = await callForUser(req.params.callId, req.user.id);
  await q(`UPDATE call_sessions SET status='ended', ended_at=now() WHERE id=$1 AND status<>'ended'`, [call.id]);
  await q(`INSERT INTO call_signals (call_id,sender_id,kind,payload) VALUES ($1,$2,'hangup','{}'::jsonb)`, [call.id, req.user.id]);
  res.json({ ended: true });
}));

// Um único pedido devolve estado + sinais novos. Isto reduz drasticamente o
// polling por chamada e evita 429 quando dois telemóveis estão no mesmo Wi-Fi.
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
