import { Router } from 'express';
import { q } from '../db.js';
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

userRoutes.get('/search', auth, h(async (req, res) => {
  const term = String(req.query.q || '').trim();
  if (term.length < 2) return res.json([]);
  const { rows } = await q(
    `SELECT u.id, u.handle, u.name, u.bio, u.palette, u.stars,
            (SELECT count(*) FROM follows WHERE following_id = u.id)::int AS followers
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

userRoutes.get('/:handle', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT u.id, u.handle, u.name, u.bio, u.palette, u.stars, u.created_at,
            (SELECT count(*) FROM follows WHERE following_id = u.id)::int AS followers,
            EXISTS (SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = u.id) AS following,
            EXISTS (SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = u.id) AS is_blocked
     FROM users u WHERE u.handle = $2 AND u.suspended_at IS NULL`,
    [req.user.id, req.params.handle]
  );
  if (!rows[0]) throw notFound('Pessoa nao encontrada');
  // Quem me bloqueou desaparece: nao confirmamos sequer que a conta existe.
  if (await blocked(req.user.id, rows[0].id) && !rows[0].is_blocked) throw notFound('Pessoa nao encontrada');
  res.json(rows[0]);
}));

userRoutes.post('/:userId/follow', auth, h(async (req, res) => {
  if (req.params.userId === req.user.id) throw bad('Nao te podes seguir');
  if (await blocked(req.user.id, req.params.userId)) throw forbidden('Nao e possivel');
  await q(
    'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.user.id, req.params.userId]
  );
  res.json({ following: true });
}));

userRoutes.delete('/:userId/follow', auth, h(async (req, res) => {
  await q('DELETE FROM follows WHERE follower_id = $1 AND following_id = $2',
    [req.user.id, req.params.userId]);
  res.json({ following: false });
}));

/**
 * Bloquear.
 *
 * Corta nos dois sentidos e desfaz o que ja existia: deixam de se seguir um
 * ao outro. Um bloqueio que deixa a outra pessoa continuar a seguir-te nao e
 * um bloqueio.
 */
userRoutes.post('/:userId/block', auth, h(async (req, res) => {
  if (req.params.userId === req.user.id) throw bad('Nao te podes bloquear');
  await q(
    'INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.user.id, req.params.userId]
  );
  await q(
    `DELETE FROM follows
     WHERE (follower_id = $1 AND following_id = $2) OR (follower_id = $2 AND following_id = $1)`,
    [req.user.id, req.params.userId]
  );
  res.json({ blocked: true });
}));

userRoutes.delete('/:userId/block', auth, h(async (req, res) => {
  await q('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2',
    [req.user.id, req.params.userId]);
  res.json({ blocked: false });
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
