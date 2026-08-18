import { Router } from 'express';
import { q } from '../db.js';
import { auth, h, bad, notFound } from '../middleware/auth.js';
import { validPushEndpoint, vapidPublicKey } from '../lib/webpush.js';
import { localizeNotification, normalizeNotificationLocale } from '../lib/notification-i18n.js';
import { subscribeRealtime } from '../realtime.js';

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

notificationRoutes.get('/events', auth, h(async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.socket?.setTimeout(0);
  res.socket?.setKeepAlive(true);

  const unsubscribe = await subscribeRealtime(req.user.id, event => {
    if (event.type !== 'notification_changed' || res.writableEnded || res.destroyed) return;
    res.write(`data: ${JSON.stringify({
      id:event.id,
      type:event.type,
      at:event.at,
      notificationId:event.notificationId || null,
    })}\n\n`);
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

notificationRoutes.get('/push/key', auth, h(async (_req, res) => {
  res.json({ publicKey: await vapidPublicKey() });
}));

notificationRoutes.get('/push/status', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT
       (SELECT count(*) FROM web_push_subscriptions WHERE user_id=$1)::int AS web,
       (SELECT count(*) FROM push_tokens WHERE user_id=$1 AND platform IN ('ios','android'))::int AS native`,
    [req.user.id]
  );
  const devices = rows[0].web + rows[0].native;
  res.json({ subscribed:devices > 0, devices, web:rows[0].web, native:rows[0].native });
}));

notificationRoutes.post('/native/subscribe', auth, h(async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const platform = String(req.body?.platform || '').trim();
  const pushEnvironment = platform === 'ios' && req.body?.environment === 'sandbox' ? 'sandbox' : 'production';
  const locale = normalizeNotificationLocale(req.body?.locale || req.headers['accept-language']);
  if (!['ios','android'].includes(platform) || token.length < 16 || token.length > 4096 || /\s/.test(token)) {
    throw bad('Token de notificação nativo inválido', 'bad_native_push_token');
  }
  await q(
    `INSERT INTO push_tokens (token,user_id,platform,device_id,device_name,os_version,push_environment,locale,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
     ON CONFLICT (token) DO UPDATE
       SET user_id=EXCLUDED.user_id,platform=EXCLUDED.platform,device_id=EXCLUDED.device_id,
           device_name=EXCLUDED.device_name,os_version=EXCLUDED.os_version,
           push_environment=EXCLUDED.push_environment,locale=EXCLUDED.locale,updated_at=now()`,
    [
      token,
      req.user.id,
      platform,
      req.body?.deviceId ? String(req.body.deviceId).slice(0, 160) : null,
      req.body?.deviceName ? String(req.body.deviceName).slice(0, 120) : null,
      req.body?.osVersion ? String(req.body.osVersion).slice(0, 40) : null,
      pushEnvironment,
      locale,
    ]
  );
  res.status(201).json({ subscribed:true, platform, locale });
}));

notificationRoutes.post('/native/unsubscribe', auth, h(async (req, res) => {
  const token = String(req.body?.token || '').trim();
  if (token) await q('DELETE FROM push_tokens WHERE token=$1 AND user_id=$2', [token, req.user.id]);
  res.json({ subscribed:false });
}));

notificationRoutes.post('/push/subscribe', auth, h(async (req, res) => {
  const endpoint = String(req.body?.endpoint || '').trim();
  if (endpoint.length > 4000 || !validPushEndpoint(endpoint)) {
    throw bad('Subscrição push inválida', 'bad_push_subscription');
  }
  const keys = req.body?.keys || {};
  const p256dh = keys.p256dh ? String(keys.p256dh).slice(0, 500) : null;
  const authKey = keys.auth ? String(keys.auth).slice(0, 500) : null;
  const locale = normalizeNotificationLocale(req.body?.locale || req.headers['accept-language']);
  await q(
    `INSERT INTO web_push_subscriptions (endpoint,user_id,p256dh,auth,locale)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id=EXCLUDED.user_id,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,locale=EXCLUDED.locale,updated_at=now()`,
    [endpoint, req.user.id, p256dh, authKey, locale]
  );
  res.status(201).json({ subscribed:true, locale });
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
  const locale = normalizeNotificationLocale(req.query.locale || req.headers['accept-language']);
  const notification = localizeNotification({ title,body,tag,url,type:item.type }, locale);
  res.json({ notification, unread:countResult.rows[0].count });
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