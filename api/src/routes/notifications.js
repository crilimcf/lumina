import { Router } from 'express';
import { q } from '../db.js';
import { auth, h, notFound } from '../middleware/auth.js';

export const notificationRoutes = Router();

const SELECT_NOTIFICATION = `
  SELECT n.id, COALESCE(n.type,n.kind) AS type,
         CASE WHEN n.type IS NULL THEN COALESCE(n.payload,'{}'::jsonb) ELSE n.data END AS data,
         n.read_at, n.created_at,
         n.post_id, n.room_id, n.follow_request_id,
         a.id AS actor_id, a.handle AS actor_handle, a.name AS actor_name,
         a.palette AS actor_palette, a.avatar_url AS actor_avatar_url,
         p.body AS post_body,
         r.name AS room_name, r.topic AS room_topic, r.visibility AS room_visibility,
         fr.status AS follow_request_status
  FROM notifications n
  LEFT JOIN users a ON a.id = n.actor_id
  LEFT JOIN posts p ON p.id = n.post_id
  LEFT JOIN rooms r ON r.id = n.room_id
  LEFT JOIN follow_requests fr ON fr.id = n.follow_request_id
`;

notificationRoutes.get('/', auth, h(async (req, res) => {
  const before = req.query.before || null;
  const asked = Number(req.query.limit);
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, 100) : 40;
  const { rows } = await q(
    `${SELECT_NOTIFICATION}
     WHERE n.user_id = $1
       AND ($2::timestamptz IS NULL OR n.created_at < $2)
     ORDER BY n.created_at DESC
     LIMIT $3`,
    [req.user.id, before, limit]
  );
  res.json({
    notifications: rows,
    nextCursor: rows.length === limit ? rows.at(-1).created_at : null,
  });
}));

notificationRoutes.get('/unread-count', auth, h(async (req, res) => {
  const { rows } = await q(
    'SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [req.user.id]
  );
  res.json({ count: rows[0].count });
}));

notificationRoutes.post('/read-all', auth, h(async (req, res) => {
  await q('UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE user_id = $1', [req.user.id]);
  res.json({ read: true });
}));

notificationRoutes.post('/:notificationId/read', auth, h(async (req, res) => {
  const { rows } = await q(
    `UPDATE notifications SET read_at = COALESCE(read_at, now())
     WHERE id = $1 AND user_id = $2 RETURNING id`,
    [req.params.notificationId, req.user.id]
  );
  if (!rows[0]) throw notFound('Notificação não encontrada');
  res.json({ read: true });
}));
