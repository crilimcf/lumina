import { Router } from 'express';
import { q, tx } from '../db.js';
import { env } from '../env.js';
import { auth, h, bad, notFound, forbidden } from '../middleware/auth.js';

export const messageRoutes = Router();

/** Threads guardam o par ordenado, por isso não há conversas duplicadas. */
const pair = (a, b) => (a < b ? [a, b] : [b, a]);

async function findOrCreateThread(userA, userB) {
  if (userA === userB) throw bad('Não podes falar contigo');
  const { rows: blk } = await q(
    `SELECT 1 FROM blocks
     WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
    [userA, userB]
  );
  if (blk[0]) throw forbidden('Não é possível iniciar esta conversa');
  const [a, b] = pair(userA, userB);
  const { rows } = await q(
    `INSERT INTO threads (user_a, user_b) VALUES ($1, $2)
     ON CONFLICT (user_a, user_b) DO UPDATE SET user_a = EXCLUDED.user_a
     RETURNING *`,
    [a, b]
  );
  return rows[0];
}

messageRoutes.get('/threads', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT t.id,
            u.id AS other_id, u.handle, u.name, u.palette,
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
       AND NOT EXISTS (SELECT 1 FROM blocks bl
                       WHERE (bl.blocker_id = $1 AND bl.blocked_id = u.id)
                          OR (bl.blocked_id = $1 AND bl.blocker_id = u.id))
     ORDER BY last.created_at DESC NULLS LAST LIMIT 100`,
    [req.user.id]
  );

  // A pré-visualização nunca mostra o conteúdo de mensagens efémeras.
  res.json(rows.map(r => ({
    ...r,
    body: r.purged_at ? null
      : r.mode === 'once' ? '👁 Foto de uma vez'
      : r.mode === 'timer' ? '⏱ Mensagem efémera'
      : r.body,
  })));
}));

messageRoutes.post('/threads', auth, h(async (req, res) => {
  const thread = await findOrCreateThread(req.user.id, req.body.userId);
  res.status(201).json(thread);
}));

async function assertParticipant(threadId, userId) {
  const { rows } = await q(
    'SELECT * FROM threads WHERE id = $1 AND (user_a = $2 OR user_b = $2)',
    [threadId, userId]
  );
  if (!rows[0]) throw forbidden('Não fazes parte desta conversa');
  return rows[0];
}

messageRoutes.get('/threads/:threadId/messages', auth, h(async (req, res) => {
  await assertParticipant(req.params.threadId, req.user.id);

  await q(
    `UPDATE messages SET read_at = now()
     WHERE thread_id = $1 AND sender_id <> $2 AND read_at IS NULL`,
    [req.params.threadId, req.user.id]
  );

  const { rows } = await q(
    `SELECT id, sender_id, kind, mode, palette, opened_at, expires_at, purged_at, created_at,
            CASE
              -- conteúdo efémero só sai do servidor depois de o destinatário o abrir
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
  const { kind = 'text', mode = 'normal', body = null, mediaUrl = null, palette = 0 } = req.body;
  if (!['normal', 'timer', 'once'].includes(mode)) throw bad('Modo inválido');
  if (kind === 'text' && !String(body || '').trim()) throw bad('Mensagem vazia');
  if (mode === 'once' && kind !== 'media') throw bad('O modo uma vez é só para fotos');

  const t = await assertParticipant(req.params.threadId, req.user.id);
  const other = t.user_a === req.user.id ? t.user_b : t.user_a;
  const { rows: blk } = await q(
    `SELECT 1 FROM blocks
     WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
    [req.user.id, other]
  );
  if (blk[0]) throw forbidden('Esta conversa já não está disponível');

  const { rows } = await q(
    `INSERT INTO messages (thread_id, sender_id, kind, mode, body, media_url, palette)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, kind, mode, created_at`,
    [req.params.threadId, req.user.id, kind, mode, body, mediaUrl, palette]
  );
  res.status(201).json(rows[0]);
}));

/**
 * Abrir uma mensagem efémera. É aqui que o relógio começa: gravamos opened_at
 * e marcamos a hora em que o conteúdo é apagado do servidor.
 *
 * Nota honesta para a interface: isto impede que a mensagem seja lida de novo,
 * não impede uma captura de ecrã. A app diz isso ao utilizador.
 */
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
    if (m.sender_id === req.user.id) throw bad('É tua');
    if (m.purged_at) throw bad('Já não existe', 'purged');
    if (m.opened_at) {
      // Ver uma vez significa uma vez. Segunda tentativa não devolve nada.
      if (m.mode === 'once') throw bad('Esta foto já foi vista', 'already_seen');
      return { body: m.body, mediaUrl: m.media_url, expiresAt: m.expires_at };
    }

    const seconds = m.mode === 'once' ? env.ONCE_SECONDS : env.EPHEMERAL_SECONDS;
    const { rows: up } = await c.query(
      `UPDATE messages SET opened_at = now(), expires_at = now() + ($2 || ' seconds')::interval
       WHERE id = $1 RETURNING body, media_url, expires_at`,
      [m.id, seconds]
    );
    return { body: up[0].body, mediaUrl: up[0].media_url, expiresAt: up[0].expires_at };
  });
  res.json(out);
}));
