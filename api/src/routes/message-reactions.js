import { Router } from 'express';
import { q } from '../db.js';
import { auth, h, bad, notFound, forbidden } from '../middleware/auth.js';
import { publishRealtime } from '../realtime.js';

export const messageReactionRoutes = Router();

const ALLOWED_REACTIONS = new Set(['👍','❤️','😂','😮','😢','🔥']);

async function blocked(a, b) {
  const { rows } = await q(
    `SELECT 1 FROM blocks
     WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)`,
    [a, b],
  );
  return !!rows[0];
}

async function participantThread(threadId, userId) {
  const { rows } = await q(
    'SELECT * FROM threads WHERE id=$1 AND (user_a=$2 OR user_b=$2)',
    [threadId, userId],
  );
  const thread = rows[0];
  if (!thread) throw forbidden('Não fazes parte desta conversa');
  const other = thread.user_a === userId ? thread.user_b : thread.user_a;
  if (await blocked(userId, other)) throw forbidden('Esta conversa já não está disponível');
  return thread;
}

async function participantMessage(messageId, userId) {
  const { rows } = await q(
    `SELECT m.id,m.thread_id,m.mode,m.deleted_at,m.purged_at,t.user_a,t.user_b
       FROM messages m JOIN threads t ON t.id=m.thread_id
      WHERE m.id=$1`,
    [messageId],
  );
  const message = rows[0];
  if (!message) throw notFound('Mensagem não encontrada');
  if (message.user_a !== userId && message.user_b !== userId) throw forbidden('Não fazes parte desta conversa');
  const other = message.user_a === userId ? message.user_b : message.user_a;
  if (await blocked(userId, other)) throw forbidden('Esta conversa já não está disponível');
  return message;
}

function ensureReactable(message) {
  if (message.deleted_at || message.purged_at || message.mode !== 'normal') {
    throw bad('Esta mensagem não pode receber reações', 'not_reactable');
  }
}

messageReactionRoutes.get('/threads/:threadId/reactions', auth, h(async (req, res) => {
  await participantThread(req.params.threadId, req.user.id);
  const { rows } = await q(
    `SELECT mr.message_id,mr.emoji,(mr.user_id=$2) AS mine
       FROM message_reactions mr
       JOIN messages m ON m.id=mr.message_id
      WHERE m.thread_id=$1
        AND m.mode='normal'
        AND m.deleted_at IS NULL
        AND m.purged_at IS NULL
      ORDER BY mr.created_at,mr.message_id`,
    [req.params.threadId, req.user.id],
  );
  res.json({ reactions:rows });
}));

messageReactionRoutes.post('/:messageId/reaction', auth, h(async (req, res) => {
  const emoji = String(req.body?.emoji || '');
  if (!ALLOWED_REACTIONS.has(emoji)) throw bad('Reação inválida', 'bad_reaction');
  const message = await participantMessage(req.params.messageId, req.user.id);
  ensureReactable(message);
  await q(
    `INSERT INTO message_reactions (message_id,user_id,emoji)
     VALUES ($1,$2,$3)
     ON CONFLICT (message_id,user_id)
     DO UPDATE SET emoji=EXCLUDED.emoji,created_at=now()`,
    [message.id, req.user.id, emoji],
  );
  await publishRealtime(
    [message.user_a, message.user_b],
    'message_reacted',
    { threadId:message.thread_id, messageId:message.id },
  );
  res.json({ messageId:message.id, emoji });
}));

messageReactionRoutes.delete('/:messageId/reaction', auth, h(async (req, res) => {
  const message = await participantMessage(req.params.messageId, req.user.id);
  ensureReactable(message);
  await q('DELETE FROM message_reactions WHERE message_id=$1 AND user_id=$2', [message.id, req.user.id]);
  await publishRealtime(
    [message.user_a, message.user_b],
    'message_reacted',
    { threadId:message.thread_id, messageId:message.id },
  );
  res.json({ messageId:message.id, reaction:null });
}));
