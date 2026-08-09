import { Router } from 'express';
import { q } from '../db.js';
import { auth, h, bad, notFound } from '../middleware/auth.js';

export const notificationRoutes = Router();

function optionalTimestamp(value) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(text);
  if (!match) throw bad('Cursor inválido', 'bad_cursor');

  const [, year, month, day, hour, minute, second, fraction = ''] = match;
  const millis = fraction.padEnd(3, '0');
  const canonical = `${year}-${month}-${day}T${hour}:${minute}:${second}.${millis}Z`;
  const date = new Date(canonical);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== canonical) {
    throw bad('Cursor inválido', 'bad_cursor');
  }
  return canonical;
}

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

const BLOCKED_ACTOR_FILTER = `
  NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE n.actor_id IS NOT NULL
      AND ((b.blocker_id=$1 AND b.blocked_id=n.actor_id)
        OR (b.blocked_id=$1 AND b.blocker_id=n.actor_id))
  )
`;

const ACTIVE_ACTOR_FILTER = `
  NOT EXISTS (
    SELECT 1 FROM users suspended_actor
    WHERE suspended_actor.id=n.actor_id AND suspended_actor.suspended_at IS NOT NULL
  )
`;

notificationRoutes.get('/', auth, h(async (req, res) => {
  const before = optionalTimestamp(req.query.before);
  const asked = Number(req.query.limit);
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, 100) : 40;
  const { rows } = await q(
    `${SELECT_NOTIFICATION}
     WHERE n.user_id = $1
       AND ${BLOCKED_ACTOR_FILTER}
       AND ${ACTIVE_ACTOR_FILTER}
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
    `SELECT count(*)::int AS count
     FROM notifications n
     WHERE n.user_id = $1 AND n.read_at IS NULL
       AND ${BLOCKED_ACTOR_FILTER}
       AND ${ACTIVE_ACTOR_FILTER}`,
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
