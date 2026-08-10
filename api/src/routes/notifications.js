import { Router } from 'express';
import { q } from '../db.js';
import { auth, h, bad, notFound } from '../middleware/auth.js';
import { validPushEndpoint, vapidPublicKey } from '../lib/webpush.js';

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

notificationRoutes.get('/push/key', auth, h(async (_req, res) => {
  res.json({ publicKey: await vapidPublicKey() });
}));

notificationRoutes.get('/push/status', auth, h(async (req, res) => {
  const { rows } = await q('SELECT count(*)::int AS count FROM web_push_subscriptions WHERE user_id=$1', [req.user.id]);
  res.json({ subscribed: rows[0].count > 0, devices: rows[0].count });
}));

notificationRoutes.post('/push/subscribe', auth, h(async (req, res) => {
  const endpoint = String(req.body?.endpoint || '').trim();
  if (endpoint.length > 4000 || !validPushEndpoint(endpoint)) {
    throw bad('Subscrição push inválida', 'bad_push_subscription');
  }
  const keys = req.body?.keys || {};
  const p256dh = keys.p256dh ? String(keys.p256dh).slice(0, 500) : null;
  const authKey = keys.auth ? String(keys.auth).slice(0, 500) : null;
  await q(
    `INSERT INTO web_push_subscriptions (endpoint,user_id,p256dh,auth)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id=EXCLUDED.user_id,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,updated_at=now()`,
    [endpoint, req.user.id, p256dh, authKey]
  );
  res.status(201).json({ subscribed:true });
}));

notificationRoutes.post('/push/unsubscribe', auth, h(async (req, res) => {
  const endpoint = String(req.body?.endpoint || '').trim();
  if (endpoint) await q('DELETE FROM web_push_subscriptions WHERE endpoint=$1 AND user_id=$2', [endpoint, req.user.id]);
  res.json({ subscribed:false });
}));

notificationRoutes.get('/push/latest', auth, h(async (req, res) => {
  const [{ rows }, countResult] = await Promise.all([
    q(
      `${SELECT_NOTIFICATION}
       WHERE n.user_id=$1 AND n.read_at IS NULL
         AND COALESCE(n.type,n.kind) IN ('message','incoming_call')
         AND ${BLOCKED_ACTOR_FILTER}
         AND ${ACTIVE_ACTOR_FILTER}
       ORDER BY n.created_at DESC LIMIT 1`,
      [req.user.id]
    ),
    q('SELECT count(*)::int AS count FROM notifications WHERE user_id=$1 AND read_at IS NULL', [req.user.id]),
  ]);
  const item = rows[0] || null;
  if (!item) return res.json({ notification:null, unread:countResult.rows[0].count });

  const name = item.actor_name || 'Alguém';
  let title = 'Lumina';
  let body = 'Tens uma novidade.';
  let tag = `lumina:${item.id}`;
  let url = '/?tab=alerts';
  if (item.type === 'message') {
    title = name;
    const kind = item.data?.kind;
    const mediaType = item.data?.mediaType;
    const mode = item.data?.mode;
    body = kind === 'media'
      ? (mode === 'once' ? `Enviou ${mediaType === 'video' ? 'um vídeo' : 'uma foto'} para veres uma vez` : `Enviou ${mediaType === 'video' ? 'um vídeo' : 'uma fotografia'}`)
      : 'Enviou-te uma mensagem';
    tag = `lumina:message:${item.data?.threadId || item.id}`;
    url = '/?tab=dms';
  } else if (item.type === 'incoming_call') {
    title = `Chamada de ${name}`;
    body = item.data?.mode === 'video' ? 'Videochamada recebida' : 'Chamada de áudio recebida';
    tag = `lumina:call:${item.data?.callId || item.id}`;
    url = '/?tab=dms';
  }
  res.json({ notification:{ title,body,tag,url,type:item.type }, unread:countResult.rows[0].count });
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
