import { Router } from 'express';
import { q, tx } from '../db.js';
import { env } from '../env.js';
import { auth, h, bad, notFound, forbidden } from '../middleware/auth.js';
import { claimUpload, removeClaimedUploadIfUnreferenced } from '../lib/uploads.js';
import { sendPushToUser } from '../lib/webpush.js';
import { publishRealtime, subscribeRealtime } from '../realtime.js';

export const messageRoutes = Router();

const pair = (a, b) => (a < b ? [a, b] : [b, a]);
const unique = values => [...new Set(values.filter(Boolean).map(String))];

async function blocked(a, b, query = q) {
  const { rows } = await query(
    `SELECT 1 FROM blocks
     WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
    [a, b]
  );
  return !!rows[0];
}

async function findOrCreateThread(userA, userB) {
  if (!userB) throw bad('Falta a pessoa', 'user_required');
  if (userA === userB) throw bad('Não podes falar contigo');
  const { rows: target } = await q('SELECT id FROM users WHERE id = $1 AND suspended_at IS NULL', [userB]);
  if (!target[0]) throw notFound('Pessoa não encontrada');
  if (await blocked(userA, userB)) throw forbidden('Não é possível iniciar esta conversa');
  const [a, b] = pair(userA, userB);
  const { rows } = await q(
    `INSERT INTO threads (user_a, user_b) VALUES ($1, $2)
     ON CONFLICT (user_a, user_b) DO UPDATE SET user_a = EXCLUDED.user_a RETURNING *`,
    [a, b]
  );
  return rows[0];
}

async function assertParticipant(threadId, userId) {
  const { rows } = await q('SELECT * FROM threads WHERE id = $1 AND (user_a = $2 OR user_b = $2)', [threadId, userId]);
  if (!rows[0]) throw forbidden('Não fazes parte desta conversa');
  const other = rows[0].user_a === userId ? rows[0].user_b : rows[0].user_a;
  if (await blocked(userId, other)) throw forbidden('Esta conversa já não está disponível');
  return rows[0];
}

async function ownMessage(messageId, userId) {
  const { rows } = await q(
    `SELECT m.*, t.user_a, t.user_b
       FROM messages m JOIN threads t ON t.id=m.thread_id
      WHERE m.id=$1`, [messageId]
  );
  const message = rows[0];
  if (!message) throw notFound('Mensagem não encontrada');
  if (message.sender_id !== userId) throw forbidden('Só podes alterar as tuas mensagens');
  await assertParticipant(message.thread_id, userId);
  return message;
}

messageRoutes.get('/events', auth, h(async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.socket?.setTimeout(0);
  res.socket?.setKeepAlive(true);

  const unsubscribe = await subscribeRealtime(req.user.id, event => {
    if (res.writableEnded || res.destroyed) return;
    const payload = {
      id: event.id,
      type: event.type,
      at: event.at,
      threadId: event.threadId || null,
      threadIds: Array.isArray(event.threadIds) ? event.threadIds : undefined,
      messageId: event.messageId || null,
    };
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  });

  res.flushHeaders?.();
  res.write('retry: 5000\n');
  res.write(`event: ready\ndata: ${JSON.stringify({ ok:true, at:new Date().toISOString() })}\n\n`);

  const heartbeat = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) res.write(': keep-alive\n\n');
  }, 25_000);
  heartbeat.unref?.();

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
  };
  req.once('aborted', cleanup);
  req.once('close', cleanup);
  res.once('close', cleanup);
}));

messageRoutes.get('/threads', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT t.id,
            u.id AS other_id, u.handle, u.name, u.palette, u.avatar_url,
            last.body, last.mode, last.kind, last.media_type, last.purged_at, last.deleted_at, last.created_at,
            (SELECT count(*) FROM messages m
              WHERE m.thread_id=t.id AND m.sender_id<>$1 AND m.read_at IS NULL AND m.deleted_at IS NULL)::int AS unread
       FROM threads t
       JOIN users u ON u.id=CASE WHEN t.user_a=$1 THEN t.user_b ELSE t.user_a END
       LEFT JOIN LATERAL (
         SELECT body,mode,kind,media_type,purged_at,deleted_at,created_at
           FROM messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1
       ) last ON true
      WHERE (t.user_a=$1 OR t.user_b=$1)
        AND u.suspended_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM blocks bl
          WHERE (bl.blocker_id=$1 AND bl.blocked_id=u.id) OR (bl.blocked_id=$1 AND bl.blocker_id=u.id))
      ORDER BY last.created_at DESC NULLS LAST LIMIT 100`, [req.user.id]
  );
  res.json(rows.map(r => ({
    ...r,
    body: r.deleted_at ? 'Mensagem apagada'
      : r.purged_at ? null
      : r.mode === 'once' ? `👁 ${r.media_type === 'video' ? 'Vídeo' : 'Foto'} de uma vez`
      : r.mode === 'timer' ? '⏱ Mensagem efémera'
      : r.kind === 'media' ? (r.media_type === 'video' ? '🎥 Vídeo' : '📷 Fotografia')
      : r.body,
  })));
}));

messageRoutes.post('/threads', auth, h(async (req, res) => {
  const thread = await findOrCreateThread(req.user.id, req.body.userId);
  await publishRealtime([thread.user_a, thread.user_b], 'thread_changed', { threadId:thread.id });
  res.status(201).json(thread);
}));

messageRoutes.post('/delivered', auth, h(async (req, res) => {
  const { rows } = await q(
    `UPDATE messages m SET delivered_at=COALESCE(m.delivered_at,now())
       FROM threads t
      WHERE m.thread_id=t.id AND m.sender_id<>$1 AND m.delivered_at IS NULL
        AND m.deleted_at IS NULL AND (t.user_a=$1 OR t.user_b=$1)
      RETURNING m.thread_id, m.sender_id`, [req.user.id]
  );
  if (rows.length) {
    await publishRealtime(
      unique([req.user.id, ...rows.map(row => row.sender_id)]),
      'message_delivered',
      { threadIds:unique(rows.map(row => row.thread_id)) },
    );
  }
  res.json({ delivered: rows.length });
}));

messageRoutes.get('/threads/:threadId/messages', auth, h(async (req, res) => {
  const thread = await assertParticipant(req.params.threadId, req.user.id);
  const { rows: readRows } = await q(
    `UPDATE messages SET delivered_at=COALESCE(delivered_at,now()), read_at=COALESCE(read_at,now())
      WHERE thread_id=$1 AND sender_id<>$2 AND read_at IS NULL AND deleted_at IS NULL
      RETURNING sender_id`,
    [req.params.threadId, req.user.id]
  );
  const { rows } = await q(
    `SELECT id,sender_id,kind,mode,media_type,palette,opened_at,expires_at,purged_at,
            created_at,delivered_at,read_at,edited_at,deleted_at,
            CASE WHEN deleted_at IS NOT NULL OR purged_at IS NOT NULL THEN NULL
                 WHEN mode<>'normal' AND sender_id<>$2 AND opened_at IS NULL THEN NULL ELSE body END AS body,
            CASE WHEN deleted_at IS NOT NULL OR purged_at IS NOT NULL THEN NULL
                 WHEN mode<>'normal' AND sender_id<>$2 AND opened_at IS NULL THEN NULL ELSE media_url END AS media_url
       FROM messages WHERE thread_id=$1 ORDER BY created_at LIMIT 200`,
    [req.params.threadId, req.user.id]
  );
  if (readRows.length) {
    await publishRealtime(
      [thread.user_a, thread.user_b],
      'message_read',
      { threadId:req.params.threadId },
    );
  }
  res.json(rows);
}));

messageRoutes.post('/threads/:threadId/messages', auth, h(async (req, res) => {
  const { kind='text', mode='normal', mediaUrl=null, mediaType=null } = req.body;
  const body = bodyOrNull(req.body.body);
  const palette = Number(req.body.palette ?? 0);
  if (!['text','media'].includes(kind)) throw bad('Tipo de mensagem inválido');
  if (!['normal','timer','once'].includes(mode)) throw bad('Modo inválido');
  if (!Number.isInteger(palette) || palette<0 || palette>4) throw bad('Cor inválida','bad_palette');
  if (kind === 'text') {
    if (!body) throw bad('Mensagem vazia');
    if (body.length > 4000) throw bad('A mensagem tem no máximo 4000 caracteres');
    if (mediaUrl || mediaType) throw bad('Mensagem de texto não leva media');
  }
  if (kind === 'media') {
    if (!mediaUrl) throw bad('Falta o ficheiro','media_required');
    if (mediaType !== null && !['image','video'].includes(mediaType)) throw bad('Tipo de media inválido','bad_media_type');
    if (body) throw bad('Mensagem de media não leva texto');
  }
  if (mode === 'once' && kind !== 'media') throw bad('O modo uma vez é só para foto ou vídeo');
  if (mode === 'timer' && kind !== 'text') throw bad('O modo efémero é só para texto');
  const thread = await assertParticipant(req.params.threadId, req.user.id);

  const message = await tx(async (c) => {
    let resolvedMediaType = mediaType;
    if (mediaUrl) {
      const claimed = await claimUpload(mediaUrl, req.user.id, 'message', (text, params) => c.query(text, params), { allowVideo: true });
      if (!claimed) throw bad('Media não verificada ou já utilizada','unconfirmed_upload');
      const actualType = String(claimed.mime).startsWith('video/') ? 'video' : 'image';
      if (resolvedMediaType && actualType !== resolvedMediaType) throw bad('O tipo do ficheiro não corresponde ao envio','bad_media_type');
      resolvedMediaType = actualType;
    }
    const { rows } = await c.query(
      `INSERT INTO messages (thread_id,sender_id,kind,mode,body,media_url,media_type,palette)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id,sender_id,kind,mode,body,media_url,media_type,palette,created_at,delivered_at,read_at,edited_at,deleted_at`,
      [req.params.threadId,req.user.id,kind,mode,body,mediaUrl,resolvedMediaType,palette]
    );
    return rows[0];
  });
  const recipientId = thread.user_a === req.user.id ? thread.user_b : thread.user_a;
  await publishRealtime([req.user.id, recipientId], 'message_created', { threadId:req.params.threadId, messageId:message.id });
  sendPushToUser(recipientId).catch(error => console.debug('[push] mensagem', error?.message));
  res.status(201).json(message);
}));

messageRoutes.patch('/:messageId', auth, h(async (req, res) => {
  const message = await ownMessage(req.params.messageId, req.user.id);
  if (message.deleted_at) throw bad('A mensagem já foi apagada','deleted');
  if (message.mode !== 'normal' || message.kind !== 'text') throw bad('Só mensagens de texto normais podem ser editadas','not_editable');
  const body = bodyOrNull(req.body.body);
  if (!body) throw bad('Mensagem vazia');
  if (body.length > 4000) throw bad('A mensagem tem no máximo 4000 caracteres');
  const { rows } = await q(
    `UPDATE messages SET body=$2,edited_at=now() WHERE id=$1
     RETURNING id,body,edited_at,delivered_at,read_at`, [message.id, body]
  );
  await publishRealtime([message.user_a, message.user_b], 'message_updated', { threadId:message.thread_id, messageId:message.id });
  res.json(rows[0]);
}));

messageRoutes.delete('/:messageId', auth, h(async (req, res) => {
  const message = await ownMessage(req.params.messageId, req.user.id);
  if (message.deleted_at) return res.json({ deleted: true });
  const { rows } = await q(
    `UPDATE messages SET body=NULL,media_url=NULL,deleted_at=now() WHERE id=$1
     RETURNING media_type,deleted_at`, [message.id]
  );
  if (message.media_url) removeClaimedUploadIfUnreferenced(message.media_url, 'message').catch(() => {});
  await publishRealtime([message.user_a, message.user_b], 'message_deleted', { threadId:message.thread_id, messageId:message.id });
  res.json({ deleted: true, deletedAt: rows[0].deleted_at });
}));

function bodyOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

messageRoutes.post('/:messageId/open', auth, h(async (req, res) => {
  const out = await tx(async (c) => {
    const { rows } = await c.query(
      `SELECT m.*,t.user_a,t.user_b FROM messages m JOIN threads t ON t.id=m.thread_id
       WHERE m.id=$1 FOR UPDATE`, [req.params.messageId]
    );
    const m = rows[0];
    if (!m) throw notFound('Mensagem não encontrada');
    if (m.user_a !== req.user.id && m.user_b !== req.user.id) throw forbidden();
    const other = m.user_a === req.user.id ? m.user_b : m.user_a;
    if (await blocked(req.user.id, other, (text, params) => c.query(text, params))) throw forbidden('Esta conversa já não está disponível');
    if (m.sender_id === req.user.id) throw bad('É tua');
    if (m.deleted_at) throw bad('Esta mensagem foi apagada','deleted');
    if (m.mode === 'normal') throw bad('Esta mensagem não é efémera','not_ephemeral');
    if (m.purged_at) throw bad('Já não existe','purged');
    if (m.opened_at) {
      if (m.mode === 'once') throw bad('Esta media já foi vista','already_seen');
      return {
        payload:{ body:m.body, mediaUrl:m.media_url, mediaType:m.media_type, expiresAt:m.expires_at },
        threadId:m.thread_id,
        userA:m.user_a,
        userB:m.user_b,
      };
    }
    const seconds = m.mode === 'once' ? env.ONCE_SECONDS : env.EPHEMERAL_SECONDS;
    const { rows: up } = await c.query(
      `UPDATE messages SET delivered_at=COALESCE(delivered_at,now()),read_at=COALESCE(read_at,now()),
                           opened_at=now(),expires_at=now()+($2||' seconds')::interval
       WHERE id=$1 RETURNING body,media_url,media_type,expires_at`, [m.id, seconds]
    );
    return {
      payload:{ body:up[0].body, mediaUrl:up[0].media_url, mediaType:up[0].media_type, expiresAt:up[0].expires_at },
      threadId:m.thread_id,
      userA:m.user_a,
      userB:m.user_b,
    };
  });
  await publishRealtime([out.userA, out.userB], 'message_opened', { threadId:out.threadId, messageId:req.params.messageId });
  res.json(out.payload);
}));
