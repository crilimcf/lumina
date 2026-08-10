import { Router } from 'express';
import { q, tx } from '../db.js';
import { env } from '../env.js';
import { auth, h, bad, notFound, forbidden } from '../middleware/auth.js';
import { claimUpload } from '../lib/uploads.js';

export const messageRoutes = Router();

/** Threads guardam o par ordenado, por isso não há conversas duplicadas. */
const pair = (a, b) => (a < b ? [a, b] : [b, a]);

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

  const { rows: target } = await q(
    'SELECT id FROM users WHERE id = $1 AND suspended_at IS NULL',
    [userB]
  );
  if (!target[0]) throw notFound('Pessoa não encontrada');
  if (await blocked(userA, userB)) throw forbidden('Não é possível iniciar esta conversa');

  const [a, b] = pair(userA, userB);
  const { rows } = await q(
    `INSERT INTO threads (user_a, user_b) VALUES ($1, $2)
     ON CONFLICT (user_a, user_b) DO UPDATE SET user_a = EXCLUDED.user_a
     RETURNING *`,
    [a, b]
  );
  return rows[0];
}

async function assertParticipant(threadId, userId) {
  const { rows } = await q(
    'SELECT * FROM threads WHERE id = $1 AND (user_a = $2 OR user_b = $2)',
    [threadId, userId]
  );
  if (!rows[0]) throw forbidden('Não fazes parte desta conversa');

  const other = rows[0].user_a === userId ? rows[0].user_b : rows[0].user_a;
  if (await blocked(userId, other)) throw forbidden('Esta conversa já não está disponível');
  return rows[0];
}

messageRoutes.get('/threads', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT t.id,
            u.id AS other_id, u.handle, u.name, u.palette, u.avatar_url,
            last.body, last.mode, last.kind, last.purged_at, last.created_at,
            (SELECT count(*) FROM messages m
              WHERE m.thread_id = t.id AND m.sender_id <> $1 AND m.read_at IS NULL)::int AS unread
     FROM threads t
     JOIN users u ON u.id = CASE WHEN t.user_a = $1 THEN t.user_b ELSE t.user_a END
     LEFT JOIN LATERAL (
       SELECT body, mode, kind, purged_at, created_at FROM messages m
       WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1
     ) last ON true
     WHERE (t.user_a = $1 OR t.user_b = $1)
       AND u.suspended_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM blocks bl
                       WHERE (bl.blocker_id = $1 AND bl.blocked_id = u.id)
                          OR (bl.blocked_id = $1 AND bl.blocker_id = u.id))
     ORDER BY last.created_at DESC NULLS LAST LIMIT 100`,
    [req.user.id]
  );

  res.json(rows.map(r => ({
    ...r,
    body: r.purged_at ? null
      : r.mode === 'once' ? '👁 Foto de uma vez'
      : r.mode === 'timer' ? '⏱ Mensagem efémera'
      : r.kind === 'media' ? '📷 Fotografia'
      : r.body,
  })));
}));

messageRoutes.post('/threads', auth, h(async (req, res) => {
  const thread = await findOrCreateThread(req.user.id, req.body.userId);
  res.status(201).json(thread);
}));

/** Marca como entregues as mensagens que chegaram a uma sessão ativa do destinatário. */
messageRoutes.post('/delivered', auth, h(async (req, res) => {
  const { rowCount } = await q(
    `UPDATE messages m
        SET delivered_at = COALESCE(m.delivered_at, now())
       FROM threads t
      WHERE m.thread_id = t.id
        AND m.sender_id <> $1
        AND m.delivered_at IS NULL
        AND (t.user_a = $1 OR t.user_b = $1)`,
    [req.user.id]
  );
  res.json({ delivered: rowCount });
}));

messageRoutes.get('/threads/:threadId/messages', auth, h(async (req, res) => {
  await assertParticipant(req.params.threadId, req.user.id);

  await q(
    `UPDATE messages
        SET delivered_at = COALESCE(delivered_at, now()),
            read_at = COALESCE(read_at, now())
      WHERE thread_id = $1 AND sender_id <> $2 AND read_at IS NULL`,
    [req.params.threadId, req.user.id]
  );

  const { rows } = await q(
    `SELECT id, sender_id, kind, mode, palette, opened_at, expires_at, purged_at,
            created_at, delivered_at, read_at,
            CASE
              WHEN purged_at IS NOT NULL THEN NULL
              WHEN mode <> 'normal' AND sender_id <> $2 AND opened_at IS NULL THEN NULL
              ELSE body
            END AS body,
            CASE
              WHEN purged_at IS NOT NULL THEN NULL
              WHEN mode <> 'normal' AND sender_id <> $2 AND opened_at IS NULL THEN NULL
              ELSE media_url
            END AS media_url
     FROM messages WHERE thread_id = $1 ORDER BY created_at LIMIT 200`,
    [req.params.threadId, req.user.id]
  );
  res.json(rows);
}));

messageRoutes.post('/threads/:threadId/messages', auth, h(async (req, res) => {
  const { kind = 'text', mode = 'normal', mediaUrl = null } = req.body;
  const body = bodyOrNull(req.body.body);
  const palette = Number(req.body.palette ?? 0);

  if (!['text', 'media'].includes(kind)) throw bad('Tipo de mensagem inválido');
  if (!['normal', 'timer', 'once'].includes(mode)) throw bad('Modo inválido');
  if (!Number.isInteger(palette) || palette < 0 || palette > 4) throw bad('Cor inválida', 'bad_palette');

  if (kind === 'text') {
    if (!body) throw bad('Mensagem vazia');
    if (body.length > 4000) throw bad('A mensagem tem no máximo 4000 caracteres');
    if (mediaUrl) throw bad('Mensagem de texto não leva imagem');
  }
  if (kind === 'media') {
    if (!mediaUrl) throw bad('Falta a imagem', 'media_required');
    if (body) throw bad('Mensagem de imagem não leva texto');
  }
  if (mode === 'once' && kind !== 'media') throw bad('O modo uma vez é só para fotos');
  if (mode === 'timer' && kind !== 'text') throw bad('O modo efémero é só para texto');

  await assertParticipant(req.params.threadId, req.user.id);

  const message = await tx(async (c) => {
    if (mediaUrl) {
      const claimed = await claimUpload(
        mediaUrl,
        req.user.id,
        'message',
        (text, params) => c.query(text, params)
      );
      if (!claimed) throw bad('Imagem não verificada ou já utilizada', 'unconfirmed_upload');
    }

    const { rows } = await c.query(
      `INSERT INTO messages (thread_id, sender_id, kind, mode, body, media_url, palette)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, sender_id, kind, mode, body, media_url, palette, created_at, delivered_at, read_at`,
      [req.params.threadId, req.user.id, kind, mode, body, mediaUrl, palette]
    );
    return rows[0];
  });

  res.status(201).json(message);
}));

function bodyOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

messageRoutes.post('/:messageId/open', auth, h(async (req, res) => {
  const out = await tx(async (c) => {
    const { rows } = await c.query(
      `SELECT m.*, t.user_a, t.user_b FROM messages m
       JOIN threads t ON t.id = m.thread_id
       WHERE m.id = $1 FOR UPDATE`,
      [req.params.messageId]
    );
    const m = rows[0];
    if (!m) throw notFound('Mensagem não encontrada');
    if (m.user_a !== req.user.id && m.user_b !== req.user.id) throw forbidden();

    const other = m.user_a === req.user.id ? m.user_b : m.user_a;
    if (await blocked(req.user.id, other, (text, params) => c.query(text, params))) {
      throw forbidden('Esta conversa já não está disponível');
    }
    if (m.sender_id === req.user.id) throw bad('É tua');
    if (m.mode === 'normal') throw bad('Esta mensagem não é efémera', 'not_ephemeral');
    if (m.purged_at) throw bad('Já não existe', 'purged');
    if (m.opened_at) {
      if (m.mode === 'once') throw bad('Esta foto já foi vista', 'already_seen');
      return { body: m.body, mediaUrl: m.media_url, expiresAt: m.expires_at };
    }

    const seconds = m.mode === 'once' ? env.ONCE_SECONDS : env.EPHEMERAL_SECONDS;
    const { rows: up } = await c.query(
      `UPDATE messages SET delivered_at=COALESCE(delivered_at,now()), read_at=COALESCE(read_at,now()),
                           opened_at = now(), expires_at = now() + ($2 || ' seconds')::interval
       WHERE id = $1 RETURNING body, media_url, expires_at`,
      [m.id, seconds]
    );
    return { body: up[0].body, mediaUrl: up[0].media_url, expiresAt: up[0].expires_at };
  });
  res.json(out);
}));
