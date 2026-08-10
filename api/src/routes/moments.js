import { Router } from 'express';
import { q, tx } from '../db.js';
import { auth, h, bad, notFound, forbidden } from '../middleware/auth.js';
import { claimUpload, removeUploadIfUnreferenced } from '../lib/uploads.js';

export const momentRoutes = Router();

const VISIBLE_TO = `
  (m.author_id = $1 OR EXISTS (
    SELECT 1 FROM follows f
    WHERE f.follower_id = $1 AND f.following_id = m.author_id
  ))
  AND NOT EXISTS (SELECT 1 FROM blocks b
    WHERE (b.blocker_id = $1 AND b.blocked_id = m.author_id)
       OR (b.blocked_id = $1 AND b.blocker_id = m.author_id))
`;

momentRoutes.post('/', auth, h(async (req, res) => {
  const { mediaUrl = null, palette = 0 } = req.body;
  const p = Number(palette);
  if (!Number.isInteger(p) || p < 0 || p > 4) throw bad('Cor inválida');

  const moment = await tx(async (c) => {
    let claimed = null;
    if (mediaUrl) {
      claimed = await claimUpload(mediaUrl, req.user.id, 'moment', (text, params) => c.query(text, params), { allowVideo: true });
      if (!claimed) throw bad('Media não verificado ou já utilizado', 'unconfirmed_upload');
    }
    const { rows } = await c.query(
      `INSERT INTO moments (author_id, media_url, palette) VALUES ($1, $2, $3)
       RETURNING id, media_url, palette, created_at, expires_at`,
      [req.user.id, mediaUrl, p]
    );
    return { ...rows[0], media_mime: claimed?.mime || null };
  });
  res.status(201).json(moment);
}));

momentRoutes.get('/', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT m.id, m.media_url,
            (SELECT up.mime FROM uploads up WHERE up.url = m.media_url LIMIT 1) AS media_mime,
            m.palette, m.created_at, m.expires_at,
            u.id AS author_id, u.handle, u.name, u.palette AS author_palette, u.avatar_url AS author_avatar_url,
            EXISTS (SELECT 1 FROM moment_views v WHERE v.moment_id = m.id AND v.user_id = $1) AS viewed,
            (SELECT count(*) FROM moment_reactions r WHERE r.moment_id=m.id AND r.kind='like')::int AS likes,
            (SELECT count(*) FROM moment_reactions r WHERE r.moment_id=m.id AND r.kind='fire')::int AS fires,
            COALESCE((SELECT array_agg(r.kind) FROM moment_reactions r WHERE r.moment_id=m.id AND r.user_id=$1), ARRAY[]::text[]) AS my_reactions
     FROM moments m JOIN users u ON u.id = m.author_id
     WHERE m.expires_at > now() AND ${VISIBLE_TO}
     ORDER BY m.created_at ASC`,
    [req.user.id]
  );
  res.json(rows);
}));

momentRoutes.patch('/:momentId', auth, h(async (req, res) => {
  const hasMedia = Object.prototype.hasOwnProperty.call(req.body || {}, 'mediaUrl');
  const hasPalette = Object.prototype.hasOwnProperty.call(req.body || {}, 'palette');
  if (!hasMedia && !hasPalette) throw bad('Nada para alterar');
  const mediaUrl = hasMedia && req.body.mediaUrl ? String(req.body.mediaUrl) : null;
  let palette = null;
  if (hasPalette) {
    palette = Number(req.body.palette);
    if (!Number.isInteger(palette) || palette < 0 || palette > 4) throw bad('Cor inválida');
  }

  const result = await tx(async (c) => {
    const { rows: own } = await c.query(
      `SELECT id, media_url, palette, created_at, expires_at
       FROM moments WHERE id = $1 AND author_id = $2 AND expires_at > now() FOR UPDATE`,
      [req.params.momentId, req.user.id]
    );
    const current = own[0];
    if (!current) throw notFound('Momento não encontrado');

    let claimed = null;
    if (hasMedia && mediaUrl && mediaUrl !== current.media_url) {
      claimed = await claimUpload(mediaUrl, req.user.id, 'moment', (text, params) => c.query(text, params), { allowVideo: true });
      if (!claimed) throw bad('Media não verificado ou já utilizado', 'unconfirmed_upload');
    }

    const nextMedia = hasMedia ? mediaUrl : current.media_url;
    const nextPalette = hasPalette ? palette : current.palette;
    const { rows } = await c.query(
      `UPDATE moments SET media_url = $3, palette = $4
       WHERE id = $1 AND author_id = $2
       RETURNING id, media_url, palette, created_at, expires_at`,
      [current.id, req.user.id, nextMedia, nextPalette]
    );
    return { moment: rows[0], oldMedia: current.media_url, claimed };
  });

  if (result.oldMedia && result.oldMedia !== result.moment.media_url) {
    removeUploadIfUnreferenced(result.oldMedia).catch(err => console.error('[momentos] falhou limpar media substituído:', err.message));
  }
  let mediaMime = result.claimed?.mime || null;
  if (!mediaMime && result.moment.media_url) {
    const { rows } = await q('SELECT mime FROM uploads WHERE url = $1 LIMIT 1', [result.moment.media_url]);
    mediaMime = rows[0]?.mime || null;
  }
  res.json({ ...result.moment, media_mime: mediaMime });
}));

momentRoutes.post('/:momentId/view', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT m.author_id FROM moments m
     WHERE m.id = $2 AND m.expires_at > now() AND ${VISIBLE_TO}`,
    [req.user.id, req.params.momentId]
  );
  if (!rows[0]) throw notFound('Momento não encontrado');
  if (rows[0].author_id !== req.user.id) {
    await q('INSERT INTO moment_views (moment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.momentId, req.user.id]);
  }
  res.json({ viewed: true });
}));

momentRoutes.post('/:momentId/reactions/:kind', auth, h(async (req, res) => {
  const kind = String(req.params.kind || '');
  if (!['like', 'fire'].includes(kind)) throw bad('Reação inválida');

  const result = await tx(async (c) => {
    const { rows: visible } = await c.query(
      `SELECT m.author_id FROM moments m
       WHERE m.id=$2 AND m.expires_at>now() AND ${VISIBLE_TO}`,
      [req.user.id, req.params.momentId]
    );
    if (!visible[0]) throw notFound('Momento não encontrado');
    if (visible[0].author_id === req.user.id) throw bad('Não podes reagir ao teu próprio Momento');

    const lockKey = `moment-reaction:${req.params.momentId}:${req.user.id}:${kind}`;
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lockKey]);

    const removed = await c.query(
      'DELETE FROM moment_reactions WHERE moment_id=$1 AND user_id=$2 AND kind=$3 RETURNING kind',
      [req.params.momentId, req.user.id, kind]
    );
    if (!removed.rowCount) {
      await c.query(
        'INSERT INTO moment_reactions (moment_id,user_id,kind) VALUES ($1,$2,$3)',
        [req.params.momentId, req.user.id, kind]
      );
    }
    const { rows } = await c.query(
      `SELECT count(*) FILTER (WHERE kind='like')::int AS likes,
              count(*) FILTER (WHERE kind='fire')::int AS fires
       FROM moment_reactions WHERE moment_id=$1`,
      [req.params.momentId]
    );
    return { active: !removed.rowCount, kind, ...rows[0] };
  });

  res.json(result);
}));

momentRoutes.get('/:momentId/viewers', auth, h(async (req, res) => {
  const { rows: own } = await q('SELECT author_id FROM moments WHERE id = $1', [req.params.momentId]);
  if (!own[0]) throw notFound('Momento não encontrado');
  if (own[0].author_id !== req.user.id) throw forbidden('Só o autor vê quem viu');
  const { rows } = await q(
    `SELECT u.id, u.handle, u.name, u.palette, u.avatar_url, v.seen_at
     FROM moment_views v JOIN users u ON u.id = v.user_id
     WHERE v.moment_id = $1 ORDER BY v.seen_at DESC`,
    [req.params.momentId]
  );
  res.json(rows);
}));

momentRoutes.get('/:momentId/interactions', auth, h(async (req, res) => {
  const { rows: own } = await q('SELECT author_id FROM moments WHERE id=$1', [req.params.momentId]);
  if (!own[0]) throw notFound('Momento não encontrado');
  if (own[0].author_id !== req.user.id) throw forbidden('Só o autor vê as interações');
  const { rows } = await q(
    `SELECT u.id,u.handle,u.name,u.palette,u.avatar_url,
            array_agg(r.kind ORDER BY r.created_at)::text[] AS reactions,
            max(r.created_at) AS reacted_at
       FROM moment_reactions r
       JOIN users u ON u.id=r.user_id
      WHERE r.moment_id=$1
      GROUP BY u.id,u.handle,u.name,u.palette,u.avatar_url
      ORDER BY max(r.created_at) DESC`,
    [req.params.momentId]
  );
  res.json(rows);
}));

momentRoutes.delete('/:momentId', auth, h(async (req, res) => {
  const { rows } = await q('DELETE FROM moments WHERE id = $1 AND author_id = $2 RETURNING media_url', [req.params.momentId, req.user.id]);
  if (!rows[0]) throw notFound('Momento não encontrado');
  if (rows[0].media_url) removeUploadIfUnreferenced(rows[0].media_url).catch(err => console.error('[momentos] falhou limpar media apagado:', err.message));
  res.json({ deleted: true });
}));