import { Router } from 'express';
import { q, tx } from '../db.js';
import { auth, h, bad, forbidden, notFound } from '../middleware/auth.js';
import { claimUpload, removeUploadIfUnreferenced } from '../lib/uploads.js';

export const roomMessagePrivacyRoutes = Router();

const PRIVATE_MENTION = /^@([a-z0-9._]{3,24})(?:\s+|$)/i;

async function blocked(a, b, query = q) {
  if (!a || !b || a === b) return false;
  const { rows } = await query(
    `SELECT 1 FROM blocks
      WHERE (blocker_id=$1 AND blocked_id=$2)
         OR (blocker_id=$2 AND blocked_id=$1)
      LIMIT 1`,
    [a, b]
  );
  return !!rows[0];
}

async function assertMember(roomId, userId, query = q) {
  const { rows } = await query(
    `SELECT r.id,r.creator_id,r.billing_state
       FROM rooms r
       JOIN room_members rm ON rm.room_id=r.id AND rm.user_id=$2
      WHERE r.id=$1
        AND r.billing_state='active'
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
           WHERE (b.blocker_id=$2 AND b.blocked_id=r.creator_id)
              OR (b.blocked_id=$2 AND b.blocker_id=r.creator_id)
        )`,
    [roomId, userId]
  );
  if (!rows[0]) throw forbidden('Não tens acesso a esta sala');
  return rows[0];
}

async function privateRecipient(roomId, senderId, rawBody, query = q) {
  const match = String(rawBody || '').match(PRIVATE_MENTION);
  if (!match) return { recipient: null, body: String(rawBody || '').trim() };

  const handle = match[1];
  const { rows } = await query(
    `SELECT u.id,u.name,u.handle
       FROM room_members rm
       JOIN users u ON u.id=rm.user_id AND u.suspended_at IS NULL
      WHERE rm.room_id=$1 AND u.handle=$2
      LIMIT 1`,
    [roomId, handle]
  );
  const recipient = rows[0];
  if (!recipient) throw bad('Essa pessoa não está nesta sala', 'room_private_recipient');
  if (recipient.id === senderId) throw bad('Escolhe outra pessoa para a mensagem privada', 'room_private_self');
  if (await blocked(senderId, recipient.id, query)) throw forbidden('Não é possível enviar uma mensagem privada a esta pessoa');

  return {
    recipient,
    body: String(rawBody || '').slice(match[0].length).trim(),
  };
}

roomMessagePrivacyRoutes.get('/:roomId/private-recipients', auth, h(async (req, res) => {
  await assertMember(req.params.roomId, req.user.id);
  const term = String(req.query.q || '').trim().replace(/^@/, '').slice(0, 24);
  const contains = term ? `%${term}%` : '%';
  const prefix = term ? `${term}%` : '%';
  const { rows } = await q(
    `SELECT u.id,u.name,u.handle,u.palette,u.avatar_url
       FROM room_members rm
       JOIN users u ON u.id=rm.user_id AND u.suspended_at IS NULL
      WHERE rm.room_id=$1
        AND u.id<>$2
        AND (u.handle ILIKE $3 OR u.name ILIKE $3)
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
           WHERE (b.blocker_id=$2 AND b.blocked_id=u.id)
              OR (b.blocked_id=$2 AND b.blocker_id=u.id)
        )
      ORDER BY CASE WHEN u.handle ILIKE $4 THEN 0 ELSE 1 END,u.name
      LIMIT 12`,
    [req.params.roomId, req.user.id, contains, prefix]
  );
  res.json(rows);
}));

roomMessagePrivacyRoutes.get('/:roomId/messages', auth, h(async (req, res) => {
  await assertMember(req.params.roomId, req.user.id);
  const { rows } = await q(
    `SELECT rm.id,rm.sender_id,rm.body,rm.media_url,rm.media_mime,
            rm.private_recipient_id,rm.created_at,rm.edited_at,
            u.name,u.handle,u.palette,u.avatar_url,
            recipient.name AS private_recipient_name,
            recipient.handle AS private_recipient_handle
       FROM room_messages rm
       JOIN users u ON u.id=rm.sender_id AND u.suspended_at IS NULL
       LEFT JOIN users recipient ON recipient.id=rm.private_recipient_id AND recipient.suspended_at IS NULL
      WHERE rm.room_id=$1
        AND rm.deleted_at IS NULL
        AND (rm.private_recipient_id IS NULL OR rm.sender_id=$2 OR rm.private_recipient_id=$2)
        AND NOT EXISTS(
          SELECT 1 FROM blocks b
           WHERE (b.blocker_id=$2 AND b.blocked_id=rm.sender_id)
              OR (b.blocked_id=$2 AND b.blocker_id=rm.sender_id)
        )
      ORDER BY rm.created_at ASC
      LIMIT 300`,
    [req.params.roomId, req.user.id]
  );
  res.json(rows);
}));

roomMessagePrivacyRoutes.post('/:roomId/messages', auth, h(async (req, res) => {
  await assertMember(req.params.roomId, req.user.id);
  const rawBody = String(req.body.body || '').trim();
  const mediaUrl = req.body.mediaUrl ? String(req.body.mediaUrl) : null;
  if (!rawBody && !mediaUrl) throw bad('Mensagem vazia');
  if (rawBody.length > 4000) throw bad('A mensagem tem no máximo 4000 caracteres');

  const message = await tx(async c => {
    const { recipient, body } = await privateRecipient(
      req.params.roomId,
      req.user.id,
      rawBody,
      (text, params) => c.query(text, params)
    );
    if (!body && !mediaUrl) throw bad('Escreve a mensagem privada depois do @nome');

    let mediaMime = null;
    if (mediaUrl) {
      const claimed = await claimUpload(
        mediaUrl,
        req.user.id,
        'room_message',
        (text, params) => c.query(text, params),
        { allowVideo: true }
      );
      if (!claimed) throw bad('Foto ou vídeo não verificado ou já utilizado', 'unconfirmed_upload');
      if (!claimed.mime?.startsWith('image/') && !claimed.mime?.startsWith('video/')) throw bad('Formato de media inválido');
      mediaMime = claimed.mime;
    }

    const { rows } = await c.query(
      `INSERT INTO room_messages
         (room_id,sender_id,body,media_url,media_mime,private_recipient_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id,sender_id,body,media_url,media_mime,private_recipient_id,created_at,edited_at`,
      [req.params.roomId, req.user.id, body || null, mediaUrl, mediaMime, recipient?.id || null]
    );
    return {
      ...rows[0],
      private_recipient_name: recipient?.name || null,
      private_recipient_handle: recipient?.handle || null,
    };
  });

  res.status(201).json(message);
}));

roomMessagePrivacyRoutes.patch('/:roomId/messages/:messageId', auth, h(async (req, res) => {
  await assertMember(req.params.roomId, req.user.id);
  const body = String(req.body.body || '').trim();
  if (!body || body.length > 4000) throw bad('Mensagem inválida');
  const { rows } = await q(
    `UPDATE room_messages
        SET body=$4,edited_at=now()
      WHERE id=$1 AND room_id=$2 AND sender_id=$3 AND deleted_at IS NULL
      RETURNING id,body,edited_at`,
    [req.params.messageId, req.params.roomId, req.user.id, body]
  );
  if (!rows[0]) throw notFound('Mensagem não encontrada');
  res.json(rows[0]);
}));

roomMessagePrivacyRoutes.delete('/:roomId/messages/:messageId', auth, h(async (req, res) => {
  const room = await assertMember(req.params.roomId, req.user.id);
  const { rows: found } = await q(
    `SELECT sender_id,private_recipient_id,media_url
       FROM room_messages
      WHERE id=$1 AND room_id=$2 AND deleted_at IS NULL
        AND (private_recipient_id IS NULL OR sender_id=$3 OR private_recipient_id=$3)`,
    [req.params.messageId, req.params.roomId, req.user.id]
  );
  const message = found[0];
  if (!message) throw notFound('Mensagem não encontrada');

  const canDelete = message.sender_id === req.user.id
    || (!message.private_recipient_id && room.creator_id === req.user.id);
  if (!canDelete) {
    throw forbidden(message.private_recipient_id
      ? 'Só quem enviou pode apagar esta mensagem privada'
      : 'Só podes apagar as tuas mensagens, salvo se fores dono da sala');
  }

  await q(
    `UPDATE room_messages
        SET deleted_at=now(),media_url=NULL,media_mime=NULL
      WHERE id=$1 AND room_id=$2 AND deleted_at IS NULL`,
    [req.params.messageId, req.params.roomId]
  );
  if (message.media_url) removeUploadIfUnreferenced(message.media_url).catch(() => {});
  res.json({ deleted: true });
}));
