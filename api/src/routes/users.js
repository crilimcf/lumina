import { Router } from 'express';
import { q, tx } from '../db.js';
import { auth, h, bad, notFound, forbidden } from '../middleware/auth.js';

export const userRoutes = Router();

/** Ha bloqueio entre estas duas pessoas, em qualquer sentido? */
async function blocked(a, b) {
  const { rows } = await q(
    `SELECT 1 FROM blocks
     WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
    [a, b]
  );
  return !!rows[0];
}

async function activeUser(userId) {
  const { rows } = await q(
    'SELECT id, handle, name, is_private FROM users WHERE id = $1 AND suspended_at IS NULL',
    [userId]
  );
  return rows[0] || null;
}

async function notify({ userId, type, actorId = null, postId = null, roomId = null, followRequestId = null, dedupeKey }) {
  await q(
    `INSERT INTO notifications
       (user_id,type,actor_id,post_id,room_id,follow_request_id,dedupe_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (dedupe_key) DO UPDATE
       SET actor_id=EXCLUDED.actor_id, post_id=EXCLUDED.post_id,
           room_id=EXCLUDED.room_id, follow_request_id=EXCLUDED.follow_request_id,
           read_at=NULL, created_at=now()`,
    [userId, type, actorId, postId, roomId, followRequestId, dedupeKey]
  );
}

userRoutes.get('/search', auth, h(async (req, res) => {
  const term = String(req.query.q || '').trim();
  if (term.length < 2) return res.json([]);
  const { rows } = await q(
    `SELECT u.id, u.handle, u.name, u.bio, u.palette, u.avatar_url, u.stars, u.is_private,
            (SELECT count(*) FROM follows WHERE following_id = u.id)::int AS followers,
            EXISTS (SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = u.id) AS following,
            EXISTS (SELECT 1 FROM follow_requests fr
                    WHERE fr.requester_id=$1 AND fr.target_id=u.id AND fr.status='pending') AS requested
     FROM users u
     WHERE u.id <> $1 AND u.suspended_at IS NULL
       AND (u.handle ILIKE $2 OR u.name ILIKE $2 OR EXISTS (
            SELECT 1 FROM unnest(u.stars) s WHERE s ILIKE $2))
       AND NOT EXISTS (SELECT 1 FROM blocks b
                       WHERE (b.blocker_id = $1 AND b.blocked_id = u.id)
                          OR (b.blocked_id = $1 AND b.blocker_id = u.id))
     ORDER BY followers DESC LIMIT 25`,
    [req.user.id, `%${term}%`]
  );
  res.json(rows);
}));

/** Rotas /me antes de /:handle: "me" nunca deve ser interpretado como handle. */
userRoutes.get('/me/privacy', auth, h(async (req, res) => {
  const { rows } = await q('SELECT is_private FROM users WHERE id=$1', [req.user.id]);
  res.json({ isPrivate: !!rows[0]?.is_private });
}));

userRoutes.patch('/me/privacy', auth, h(async (req, res) => {
  if (typeof req.body?.isPrivate !== 'boolean') throw bad('Privacidade inválida');
  const nextPrivate = req.body.isPrivate;

  const acceptedCount = await tx(async (c) => {
    await c.query('UPDATE users SET is_private=$2 WHERE id=$1', [req.user.id, nextPrivate]);
    if (nextPrivate) return 0;

    const { rows: pending } = await c.query(
      `SELECT id, requester_id FROM follow_requests
       WHERE target_id=$1 AND status='pending' FOR UPDATE`,
      [req.user.id]
    );
    for (const request of pending) {
      await c.query(
        `UPDATE follow_requests SET status='accepted',responded_at=now() WHERE id=$1`,
        [request.id]
      );
      await c.query(
        `INSERT INTO follows (follower_id,following_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [request.requester_id, req.user.id]
      );
      await c.query(
        `INSERT INTO notifications
           (user_id,type,actor_id,follow_request_id,dedupe_key)
         VALUES ($1,'follow_accepted',$2,$3,$4)
         ON CONFLICT (dedupe_key) DO UPDATE SET read_at=NULL,created_at=now(),actor_id=EXCLUDED.actor_id`,
        [request.requester_id, req.user.id, request.id, `follow:accepted:${request.id}`]
      );
      await c.query(
        `UPDATE notifications SET read_at=COALESCE(read_at,now())
         WHERE user_id=$1 AND follow_request_id=$2 AND type='follow_request'`,
        [req.user.id, request.id]
      );
    }
    return pending.length;
  });

  res.json({ isPrivate: nextPrivate, acceptedPending: acceptedCount });
}));

userRoutes.get('/me/follow-requests', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT fr.id, fr.created_at,
            u.id AS user_id, u.handle, u.name, u.bio, u.palette, u.avatar_url, u.is_private,
            (SELECT count(*) FROM follows WHERE following_id=u.id)::int AS followers,
            EXISTS(SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=u.id) AS following
     FROM follow_requests fr
     JOIN users u ON u.id=fr.requester_id
     WHERE fr.target_id=$1 AND fr.status='pending' AND u.suspended_at IS NULL
     ORDER BY fr.created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
}));

userRoutes.post('/me/follow-requests/:requestId/accept', auth, h(async (req, res) => {
  const result = await tx(async (c) => {
    const { rows } = await c.query(
      `SELECT id,requester_id FROM follow_requests
       WHERE id=$1 AND target_id=$2 AND status='pending' FOR UPDATE`,
      [req.params.requestId, req.user.id]
    );
    if (!rows[0]) throw notFound('Pedido não encontrado');
    const request = rows[0];
    await c.query(
      `UPDATE follow_requests SET status='accepted',responded_at=now() WHERE id=$1`,
      [request.id]
    );
    await c.query(
      `INSERT INTO follows (follower_id,following_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [request.requester_id, req.user.id]
    );
    await c.query(
      `INSERT INTO notifications
         (user_id,type,actor_id,follow_request_id,dedupe_key)
       VALUES ($1,'follow_accepted',$2,$3,$4)
       ON CONFLICT (dedupe_key) DO UPDATE SET read_at=NULL,created_at=now(),actor_id=EXCLUDED.actor_id`,
      [request.requester_id, req.user.id, request.id, `follow:accepted:${request.id}`]
    );
    await c.query(
      `UPDATE notifications SET read_at=COALESCE(read_at,now())
       WHERE user_id=$1 AND follow_request_id=$2 AND type='follow_request'`,
      [req.user.id, request.id]
    );
    return request;
  });
  res.json({ accepted: true, requesterId: result.requester_id });
}));

userRoutes.post('/me/follow-requests/:requestId/decline', auth, h(async (req, res) => {
  const { rows } = await q(
    `UPDATE follow_requests SET status='declined',responded_at=now()
     WHERE id=$1 AND target_id=$2 AND status='pending' RETURNING id`,
    [req.params.requestId, req.user.id]
  );
  if (!rows[0]) throw notFound('Pedido não encontrado');
  await q(
    `UPDATE notifications SET read_at=COALESCE(read_at,now())
     WHERE user_id=$1 AND follow_request_id=$2 AND type='follow_request'`,
    [req.user.id, req.params.requestId]
  );
  res.json({ declined: true });
}));

userRoutes.get('/me/followers', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT u.id, u.handle, u.name, u.bio, u.palette, u.avatar_url, u.is_private,
            (SELECT count(*) FROM follows WHERE following_id = u.id)::int AS followers,
            EXISTS (SELECT 1 FROM follows mine WHERE mine.follower_id = $1 AND mine.following_id = u.id) AS following,
            EXISTS (SELECT 1 FROM follow_requests fr WHERE fr.requester_id=$1 AND fr.target_id=u.id AND fr.status='pending') AS requested,
            true AS follows_me
     FROM follows f
     JOIN users u ON u.id = f.follower_id
     WHERE f.following_id = $1 AND u.suspended_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM blocks b
                       WHERE (b.blocker_id = $1 AND b.blocked_id = u.id)
                          OR (b.blocked_id = $1 AND b.blocker_id = u.id))
     ORDER BY f.created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
}));

userRoutes.get('/me/following', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT u.id, u.handle, u.name, u.bio, u.palette, u.avatar_url, u.is_private,
            (SELECT count(*) FROM follows WHERE following_id = u.id)::int AS followers,
            true AS following, false AS requested,
            EXISTS (SELECT 1 FROM follows theirs WHERE theirs.follower_id = u.id AND theirs.following_id = $1) AS follows_me
     FROM follows f JOIN users u ON u.id = f.following_id
     WHERE f.follower_id = $1 AND u.suspended_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM blocks b
                       WHERE (b.blocker_id = $1 AND b.blocked_id = u.id)
                          OR (b.blocked_id = $1 AND b.blocker_id = u.id))
     ORDER BY f.created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
}));

userRoutes.get('/me/suggestions', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT u.id, u.handle, u.name, u.bio, u.palette, u.avatar_url, u.is_private,
            (SELECT count(*) FROM follows WHERE following_id = u.id)::int AS followers,
            false AS following,
            EXISTS (SELECT 1 FROM follow_requests fr WHERE fr.requester_id=$1 AND fr.target_id=u.id AND fr.status='pending') AS requested
     FROM memberships m
     JOIN memberships mine ON mine.community_id = m.community_id AND mine.user_id = $1
     JOIN users u ON u.id = m.user_id
     WHERE u.id <> $1 AND u.suspended_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM blocks b
                       WHERE (b.blocker_id = $1 AND b.blocked_id = u.id)
                          OR (b.blocked_id = $1 AND b.blocker_id = u.id))
     GROUP BY u.id
     ORDER BY count(*) DESC, followers DESC
     LIMIT 20`,
    [req.user.id]
  );
  res.json(rows);
}));

userRoutes.get('/me/blocked', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT u.id, u.handle, u.name, u.palette, b.created_at
     FROM blocks b JOIN users u ON u.id = b.blocked_id
     WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
}));

userRoutes.get('/:handle/posts', auth, h(async (req, res) => {
  const { rows: people } = await q(
    `SELECT u.id,u.handle,u.name,u.bio,u.palette,u.avatar_url,u.is_private,
            EXISTS(SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=u.id) AS following
     FROM users u WHERE u.handle=$2 AND u.suspended_at IS NULL`,
    [req.user.id, req.params.handle]
  );
  const person = people[0];
  if (!person) throw notFound('Pessoa não encontrada');
  if (await blocked(req.user.id, person.id) && person.id !== req.user.id) throw notFound('Pessoa não encontrada');
  const canView = person.id === req.user.id || !person.is_private || person.following;
  if (!canView) throw forbidden('Este perfil é privado');

  const { rows } = await q(
    `SELECT p.id,p.body,p.media_url,p.palette,p.created_at,p.edited_at,
            (SELECT up.mime FROM uploads up WHERE up.url=p.media_url LIMIT 1) AS media_mime,
            c.id AS community_id,c.slug AS community_slug,c.name AS community_name,
            (SELECT count(*) FROM reactions r WHERE r.post_id=p.id AND r.kind='like')::int AS likes,
            (SELECT count(*) FROM reactions r WHERE r.post_id=p.id AND r.kind='fire')::int AS fires,
            (SELECT count(*) FROM comments cm WHERE cm.post_id=p.id AND cm.hidden_at IS NULL)::int AS comments
     FROM posts p JOIN communities c ON c.id=p.community_id
     WHERE p.author_id=$2 AND p.hidden_at IS NULL AND COALESCE(p.kind,'post')='post'
       AND ($1=$2 OR p.community_id IN (SELECT community_id FROM memberships WHERE user_id=$1))
     ORDER BY p.created_at DESC LIMIT 100`,
    [req.user.id, person.id]
  );
  res.json({ person, posts: rows, canView: true });
}));

userRoutes.get('/:handle', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT u.id, u.handle, u.name, u.bio, u.palette, u.avatar_url, u.stars, u.created_at, u.is_private,
            (SELECT count(*) FROM follows WHERE following_id = u.id)::int AS followers,
            (SELECT count(*) FROM follows WHERE follower_id = u.id)::int AS following_count,
            EXISTS (SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = u.id) AS following,
            EXISTS (SELECT 1 FROM follows WHERE follower_id = u.id AND following_id = $1) AS follows_me,
            EXISTS (SELECT 1 FROM follow_requests fr WHERE fr.requester_id=$1 AND fr.target_id=u.id AND fr.status='pending') AS requested,
            EXISTS (SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = u.id) AS is_blocked
     FROM users u WHERE u.handle = $2 AND u.suspended_at IS NULL`,
    [req.user.id, req.params.handle]
  );
  if (!rows[0]) throw notFound('Pessoa nao encontrada');
  if (await blocked(req.user.id, rows[0].id) && !rows[0].is_blocked) throw notFound('Pessoa nao encontrada');
  rows[0].can_view_posts = rows[0].id === req.user.id || !rows[0].is_private || rows[0].following;
  res.json(rows[0]);
}));

userRoutes.post('/:userId/follow', auth, h(async (req, res) => {
  if (req.params.userId === req.user.id) throw bad('Nao te podes seguir');
  const target = await activeUser(req.params.userId);
  if (!target) throw notFound('Pessoa nao encontrada');
  if (await blocked(req.user.id, req.params.userId)) throw forbidden('Nao e possivel');

  if (target.is_private) {
    const { rows } = await q(
      `INSERT INTO follow_requests (requester_id,target_id,status,created_at,responded_at)
       VALUES ($1,$2,'pending',now(),NULL)
       ON CONFLICT (requester_id,target_id) DO UPDATE
         SET status='pending', responded_at=NULL,
             created_at=CASE WHEN follow_requests.status='pending' THEN follow_requests.created_at ELSE now() END
       RETURNING id`,
      [req.user.id, target.id]
    );
    const requestId = rows[0].id;
    await notify({
      userId: target.id,
      type: 'follow_request',
      actorId: req.user.id,
      followRequestId: requestId,
      dedupeKey: `follow:request:${requestId}`,
    });
    return res.status(202).json({ following: false, pending: true, requestId });
  }

  await q(
    'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.user.id, target.id]
  );
  await q(
    `UPDATE follow_requests SET status='accepted',responded_at=now()
     WHERE requester_id=$1 AND target_id=$2 AND status='pending'`,
    [req.user.id, target.id]
  );
  await notify({
    userId: target.id,
    type: 'new_follower',
    actorId: req.user.id,
    dedupeKey: `follow:direct:${req.user.id}:${target.id}`,
  });
  res.json({ following: true, pending: false });
}));

userRoutes.delete('/:userId/follow', auth, h(async (req, res) => {
  const { rows: pending } = await q(
    `DELETE FROM follow_requests
     WHERE requester_id=$1 AND target_id=$2 AND status='pending'
     RETURNING id`,
    [req.user.id, req.params.userId]
  );
  if (pending.length) {
    await q(
      `DELETE FROM notifications WHERE follow_request_id = ANY($1::uuid[]) AND type='follow_request'`,
      [pending.map(r => r.id)]
    );
  }
  await q('DELETE FROM follows WHERE follower_id = $1 AND following_id = $2',
    [req.user.id, req.params.userId]);
  res.json({ following: false, pending: false });
}));

userRoutes.post('/:userId/block', auth, h(async (req, res) => {
  if (req.params.userId === req.user.id) throw bad('Nao te podes bloquear');
  if (!await activeUser(req.params.userId)) throw notFound('Pessoa nao encontrada');
  await q(
    'INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.user.id, req.params.userId]
  );
  await q(
    `DELETE FROM follows
     WHERE (follower_id = $1 AND following_id = $2) OR (follower_id = $2 AND following_id = $1)`,
    [req.user.id, req.params.userId]
  );
  await q(
    `DELETE FROM follow_requests
     WHERE (requester_id=$1 AND target_id=$2) OR (requester_id=$2 AND target_id=$1)`,
    [req.user.id, req.params.userId]
  );
  res.json({ blocked: true });
}));

userRoutes.delete('/:userId/block', auth, h(async (req, res) => {
  await q('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2',
    [req.user.id, req.params.userId]);
  res.json({ blocked: false });
}));
