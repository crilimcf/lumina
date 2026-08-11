import { Router } from 'express';
import { q, tx } from '../db.js';
import { auth, h, bad, notFound, HttpError } from '../middleware/auth.js';
import { claimUpload, removeUploadIfUnreferenced } from '../lib/uploads.js';
import { createLiveInput, deleteLiveInput, getLiveSubscriberToken, liveProviderConfigured } from '../lib/liveProvider.js';
import { sendPushToUser } from '../lib/webpush.js';

export const liveRoutes = Router();

const visibleWhere = `(
  ls.creator_id = $1
  OR (
    NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_id = $1 AND b.blocked_id = ls.creator_id)
         OR (b.blocked_id = $1 AND b.blocker_id = ls.creator_id)
    )
    AND (
      ls.privacy = 'public'
      OR EXISTS (
        SELECT 1 FROM follows f
        WHERE f.follower_id = $1 AND f.following_id = ls.creator_id
      )
    )
  )
)`;

const LIVE_SELECT = `
  SELECT ls.id, ls.creator_id, ls.title, ls.privacy, ls.status,
         ls.playback_url, ls.recording_url, ls.recording_mime, ls.post_id,
         ls.started_at, ls.ended_at, ls.created_at,
         u.handle, u.name, u.palette, u.avatar_url,
         (ls.creator_id = $1) AS is_mine,
         (SELECT count(*)::int FROM live_viewers lv
           WHERE lv.stream_id = ls.id AND lv.last_seen_at >= now() - interval '35 seconds') AS viewers,
         (SELECT count(*)::int FROM live_reactions lr
           WHERE lr.stream_id = ls.id AND lr.kind='like') AS likes,
         (SELECT count(*)::int FROM live_reactions lr
           WHERE lr.stream_id = ls.id AND lr.kind='fire') AS fires
  FROM live_streams ls
  JOIN users u ON u.id = ls.creator_id AND u.suspended_at IS NULL
`;

async function getVisibleStream(userId, streamId) {
  const { rows } = await q(`${LIVE_SELECT} WHERE ls.id=$2 AND ${visibleWhere}`, [userId, streamId]);
  return rows[0] || null;
}

liveRoutes.get('/config', auth, h(async (_req, res) => {
  res.json({ configured: liveProviderConfigured(), provider: 'amazon-ivs-realtime' });
}));

liveRoutes.get('/', auth, h(async (req, res) => {
  const { rows } = await q(
    `${LIVE_SELECT}
     WHERE ls.status='live' AND ${visibleWhere}
     ORDER BY ls.started_at DESC NULLS LAST, ls.created_at DESC
     LIMIT 30`,
    [req.user.id]
  );
  res.json(rows);
}));

liveRoutes.post('/', auth, h(async (req, res) => {
  const title = String(req.body.title || '').trim();
  const privacy = String(req.body.privacy || 'public');
  if (!title) throw bad('Dá um título ao direto');
  if (title.length > 140) throw bad('O título tem no máximo 140 caracteres');
  if (!['public', 'followers'].includes(privacy)) throw bad('Privacidade inválida');

  const { rows: active } = await q(
    `SELECT id FROM live_streams WHERE creator_id=$1 AND status IN ('preparing','live') LIMIT 1`,
    [req.user.id]
  );
  if (active[0]) throw new HttpError(409, 'Já tens um direto em preparação ou a decorrer', 'live_already_active');

  const { rows } = await q(
    `INSERT INTO live_streams (creator_id,title,privacy)
     VALUES ($1,$2,$3)
     RETURNING id,title,privacy,status,created_at`,
    [req.user.id, title, privacy]
  );
  const stream = rows[0];

  try {
    const provider = await createLiveInput({ liveId: stream.id, creatorId: req.user.id, title });
    await q(
      `UPDATE live_streams
          SET provider_input_id=$2, playback_url=NULL, updated_at=now()
        WHERE id=$1`,
      [stream.id, provider.inputId]
    );
    res.status(201).json({
      ...stream,
      configured: provider.configured,
      publisherToken: provider.publisherToken,
    });
  } catch (error) {
    await q('DELETE FROM live_streams WHERE id=$1', [stream.id]);
    throw new HttpError(503, error.message || 'Diretos indisponíveis', 'live_provider_unavailable');
  }
}));

liveRoutes.post('/:streamId/start', auth, h(async (req, res) => {
  const { rows } = await q(
    `UPDATE live_streams
        SET status='live', started_at=COALESCE(started_at,now()), updated_at=now()
      WHERE id=$1 AND creator_id=$2 AND status='preparing'
      RETURNING id,title,privacy,started_at`,
    [req.params.streamId, req.user.id]
  );
  if (!rows[0]) throw notFound('Direto não encontrado ou já iniciado');
  const stream = rows[0];

  const notices = await q(
    `INSERT INTO notifications (user_id,type,actor_id,data,dedupe_key)
     SELECT f.follower_id, 'live_started', $1,
            jsonb_build_object('liveId',$2::uuid,'title',$3::text,'privacy',$4::text),
            'live:' || $2::text || ':' || f.follower_id::text
       FROM follows f
      WHERE f.following_id=$1
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_id=$1 AND b.blocked_id=f.follower_id)
             OR (b.blocked_id=$1 AND b.blocker_id=f.follower_id)
        )
     ON CONFLICT (dedupe_key) DO UPDATE
       SET data=EXCLUDED.data, actor_id=EXCLUDED.actor_id, read_at=NULL, created_at=now()
     RETURNING id,user_id`,
    [req.user.id, stream.id, stream.title, stream.privacy]
  );

  res.json(stream);

  if (notices.rows.length) {
    const actorName = req.user.name || req.user.handle || 'Alguém';
    void Promise.allSettled(notices.rows.map(notice => sendPushToUser(notice.user_id, {
      notification: {
        title: `${actorName} está em direto`,
        body: stream.title,
        tag: `lumina:live:${stream.id}`,
        url: `/?live=${encodeURIComponent(stream.id)}&notification=${encodeURIComponent(notice.id)}`,
      },
    }))).catch(() => {});
  }
}));

liveRoutes.get('/:streamId', auth, h(async (req, res) => {
  const stream = await getVisibleStream(req.user.id, req.params.streamId);
  if (!stream) throw notFound('Direto não encontrado');

  let subscriberToken = null;
  if (stream.status === 'live') {
    const { rows } = await q('SELECT provider_input_id FROM live_streams WHERE id=$1', [stream.id]);
    subscriberToken = await getLiveSubscriberToken({
      stageArn: rows[0]?.provider_input_id,
      userId: req.user.id,
    });
  }

  res.json({ ...stream, subscriberToken });
}));

liveRoutes.post('/:streamId/heartbeat', auth, h(async (req, res) => {
  const stream = await getVisibleStream(req.user.id, req.params.streamId);
  if (!stream || stream.status !== 'live') throw notFound('Direto não disponível');
  await q('SELECT lumina_live_prune_viewers($1)', [stream.id]);
  await q(
    `INSERT INTO live_viewers (stream_id,user_id)
     VALUES ($1,$2)
     ON CONFLICT (stream_id,user_id) DO UPDATE SET last_seen_at=now()`,
    [stream.id, req.user.id]
  );
  const { rows } = await q(
    `SELECT count(*)::int AS viewers FROM live_viewers
      WHERE stream_id=$1 AND last_seen_at >= now() - interval '35 seconds'`,
    [stream.id]
  );
  res.json(rows[0]);
}));

liveRoutes.get('/:streamId/activity', auth, h(async (req, res) => {
  const stream = await getVisibleStream(req.user.id, req.params.streamId);
  if (!stream) throw notFound('Direto não encontrado');
  const after = req.query.after ? new Date(String(req.query.after)) : null;
  const afterIso = after && !Number.isNaN(after.getTime()) ? after.toISOString() : new Date(0).toISOString();
  const [{ rows: comments }, { rows: reactions }, { rows: counts }] = await Promise.all([
    q(
      `SELECT lc.id,lc.body,lc.created_at,lc.author_id,u.name,u.handle,u.palette,u.avatar_url
         FROM live_comments lc JOIN users u ON u.id=lc.author_id AND u.suspended_at IS NULL
        WHERE lc.stream_id=$1 AND lc.created_at > $2::timestamptz
          AND NOT EXISTS (
            SELECT 1 FROM blocks b
            WHERE (b.blocker_id=$3 AND b.blocked_id=lc.author_id)
               OR (b.blocked_id=$3 AND b.blocker_id=lc.author_id)
          )
        ORDER BY lc.created_at ASC LIMIT 100`,
      [stream.id, afterIso, req.user.id]
    ),
    q(
      `SELECT id,kind,created_at FROM live_reactions
        WHERE stream_id=$1 AND created_at > $2::timestamptz
        ORDER BY created_at ASC LIMIT 200`,
      [stream.id, afterIso]
    ),
    q(
      `SELECT
         (SELECT count(*)::int FROM live_viewers WHERE stream_id=$1 AND last_seen_at >= now() - interval '35 seconds') AS viewers,
         (SELECT count(*)::int FROM live_reactions WHERE stream_id=$1 AND kind='like') AS likes,
         (SELECT count(*)::int FROM live_reactions WHERE stream_id=$1 AND kind='fire') AS fires`,
      [stream.id]
    ),
  ]);
  res.json({ comments, reactions, ...counts[0], now: new Date().toISOString() });
}));

liveRoutes.post('/:streamId/comments', auth, h(async (req, res) => {
  const stream = await getVisibleStream(req.user.id, req.params.streamId);
  if (!stream || stream.status !== 'live') throw notFound('Direto não disponível');
  const body = String(req.body.body || '').trim();
  if (!body) throw bad('Comentário vazio');
  if (body.length > 500) throw bad('O comentário tem no máximo 500 caracteres');
  const { rows } = await q(
    `WITH inserted AS (
       INSERT INTO live_comments (stream_id,author_id,body)
       VALUES ($1,$2,$3)
       RETURNING id,stream_id,author_id,body,created_at
     )
     SELECT i.id,i.body,i.created_at,i.author_id,u.name,u.handle,u.palette,u.avatar_url
       FROM inserted i JOIN users u ON u.id=i.author_id`,
    [stream.id, req.user.id, body]
  );
  res.status(201).json(rows[0]);
}));

liveRoutes.post('/:streamId/reactions/:kind', auth, h(async (req, res) => {
  const stream = await getVisibleStream(req.user.id, req.params.streamId);
  if (!stream || stream.status !== 'live') throw notFound('Direto não disponível');
  const kind = String(req.params.kind);
  if (!['like', 'fire'].includes(kind)) throw bad('Reação inválida');
  await q('INSERT INTO live_reactions (stream_id,user_id,kind) VALUES ($1,$2,$3)', [stream.id, req.user.id, kind]);
  res.status(201).json({ ok: true });
}));

liveRoutes.post('/:streamId/end', auth, h(async (req, res) => {
  const { rows } = await q(
    `UPDATE live_streams
        SET status='ended', ended_at=COALESCE(ended_at,now()), updated_at=now()
      WHERE id=$1 AND creator_id=$2 AND status IN ('preparing','live')
      RETURNING id,provider_input_id,title,ended_at`,
    [req.params.streamId, req.user.id]
  );
  if (!rows[0]) throw notFound('Direto não encontrado');
  deleteLiveInput(rows[0].provider_input_id).catch(error => console.warn('[live] provider cleanup:', error.message));
  res.json({ id: rows[0].id, title: rows[0].title, endedAt: rows[0].ended_at });
}));

liveRoutes.post('/:streamId/replay', auth, h(async (req, res) => {
  const replayUrl = String(req.body.replayUrl || '').trim();
  const mime = String(req.body.mime || 'video/mp4').trim();
  if (!replayUrl) throw bad('Falta a gravação do direto');

  const result = await tx(async (c) => {
    const { rows } = await c.query(
      `SELECT id,title,status,post_id FROM live_streams
        WHERE id=$1 AND creator_id=$2 FOR UPDATE`,
      [req.params.streamId, req.user.id]
    );
    const stream = rows[0];
    if (!stream) throw notFound('Direto não encontrado');
    if (stream.post_id) return { postId: stream.post_id, existing: true };
    if (!['ended','failed'].includes(stream.status)) throw bad('Termina o direto antes de publicar a gravação');

    const claimed = await claimUpload(replayUrl, req.user.id, 'post', (text, params) => c.query(text, params), { allowVideo: true });
    if (!claimed) throw bad('Gravação não verificada ou já utilizada', 'unconfirmed_upload');

    const postBody = `🎥 Direto gravado · ${stream.title}`;
    const { rows: postRows } = await c.query(
      `INSERT INTO posts (author_id,body,media_url,palette,kind)
       VALUES ($1,$2,$3,0,'post') RETURNING id`,
      [req.user.id, postBody, replayUrl]
    );
    await c.query(
      `UPDATE live_streams
          SET status='ready', recording_url=$2, recording_mime=$3, post_id=$4, updated_at=now()
        WHERE id=$1`,
      [stream.id, replayUrl, mime, postRows[0].id]
    );
    return { postId: postRows[0].id, existing: false };
  });

  res.status(result.existing ? 200 : 201).json(result);
}));

liveRoutes.delete('/:streamId/replay', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT id,post_id,recording_url FROM live_streams WHERE id=$1 AND creator_id=$2`,
    [req.params.streamId, req.user.id]
  );
  const stream = rows[0];
  if (!stream) throw notFound('Direto não encontrado');
  if (stream.post_id) await q('DELETE FROM posts WHERE id=$1 AND author_id=$2', [stream.post_id, req.user.id]);
  await q(
    `UPDATE live_streams SET post_id=NULL, recording_url=NULL, recording_mime=NULL,
       status=CASE WHEN status='ready' THEN 'ended' ELSE status END, updated_at=now()
     WHERE id=$1`,
    [stream.id]
  );
  if (stream.recording_url) removeUploadIfUnreferenced(stream.recording_url).catch(() => {});
  res.json({ deleted: true });
}));
