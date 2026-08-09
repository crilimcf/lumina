import { Router } from 'express';
import { q, tx } from '../db.js';
import { auth, h, bad, notFound, forbidden, requireVisiblePost } from '../middleware/auth.js';
import { claimUpload, removeUploadIfUnreferenced } from '../lib/uploads.js';

export const postRoutes = Router();

const SELECT_POST = `
  SELECT p.id, p.body, p.media_url,
         (SELECT up.mime FROM uploads up WHERE up.url = p.media_url LIMIT 1) AS media_mime,
         p.palette, p.created_at, p.edited_at, p.kind, p.repost_of,
         u.id AS author_id, u.handle, u.name, u.palette AS author_palette, u.avatar_url AS author_avatar_url,
         (SELECT count(*) FROM reactions r WHERE r.post_id = p.id AND r.kind = 'like')::int AS likes,
         (SELECT count(*) FROM reactions r WHERE r.post_id = p.id AND r.kind = 'fire')::int AS fires,
         (SELECT count(*) FROM posts rp WHERE rp.repost_of = p.id)::int AS reposts,
         (SELECT count(*) FROM comments cm WHERE cm.post_id = p.id AND cm.hidden_at IS NULL)::int AS comments,
         (SELECT array_agg(r.kind) FROM reactions r WHERE r.post_id = p.id AND r.user_id = $1) AS my_reactions
  FROM posts p
  JOIN users u ON u.id = p.author_id
`;

async function listByKind(req, kind) {
  const before = req.query.before || null;
  const asked = Number(req.query.limit);
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, 50) : 20;
  const socialFilter = kind === 'post'
    ? `AND (p.author_id = $1 OR EXISTS (
         SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.following_id = p.author_id
       ))`
    : '';
  const { rows } = await q(
    `${SELECT_POST}
     WHERE p.hidden_at IS NULL
       AND COALESCE(p.kind,'post') = $4
       ${socialFilter}
       AND NOT EXISTS (SELECT 1 FROM blocks b
                       WHERE (b.blocker_id = $1 AND b.blocked_id = p.author_id)
                          OR (b.blocked_id = $1 AND b.blocker_id = p.author_id))
       AND ($2::timestamptz IS NULL OR p.created_at < $2)
     ORDER BY p.created_at DESC
     LIMIT $3`,
    [req.user.id, before, limit, kind]
  );
  return { posts: rows, nextCursor: rows.length === limit ? rows.at(-1).created_at : null };
}

postRoutes.get('/feed', auth, h(async (req, res) => {
  res.json(await listByKind(req, 'post'));
}));

postRoutes.get('/promotions', auth, h(async (req, res) => {
  res.json(await listByKind(req, 'promotion'));
}));

postRoutes.post('/', auth, h(async (req, res) => {
  const { mediaUrl = null } = req.body;
  const body = String(req.body.body || '').trim();
  const palette = Number(req.body.palette ?? 0);
  if (!body) throw bad('A publicação não pode ficar vazia');
  if (body.length > 2000) throw bad('A publicação tem no máximo 2000 caracteres');
  if (!Number.isInteger(palette) || palette < 0 || palette > 4) throw bad('Cor inválida', 'bad_palette');

  const post = await tx(async (c) => {
    if (mediaUrl) {
      const claimed = await claimUpload(mediaUrl, req.user.id, 'post', (text, params) => c.query(text, params), { allowVideo: true });
      if (!claimed) throw bad('Media não verificado ou já utilizado', 'unconfirmed_upload');
    }

    const { rows } = await c.query(
      `INSERT INTO posts (author_id, body, media_url, palette, kind)
       VALUES ($1, $2, $3, $4, 'post') RETURNING id`,
      [req.user.id, body, mediaUrl, palette]
    );
    return rows[0];
  });

  const { rows } = await q(`${SELECT_POST} WHERE p.id = $2`, [req.user.id, post.id]);
  res.status(201).json(rows[0]);
}));

postRoutes.patch('/:postId', auth, h(async (req, res) => {
  const body = String(req.body.body || '').trim();
  if (!body) throw bad('A publicação não pode ficar vazia');
  if (body.length > 2000) throw bad('A publicação tem no máximo 2000 caracteres');
  const { rows } = await q(
    `UPDATE posts SET body=$3, edited_at=now()
     WHERE id=$1 AND author_id=$2 AND hidden_at IS NULL
     RETURNING id`,
    [req.params.postId, req.user.id, body]
  );
  if (!rows[0]) throw notFound('Publicação não encontrada');
  const { rows: full } = await q(`${SELECT_POST} WHERE p.id=$2`, [req.user.id, req.params.postId]);
  res.json(full[0]);
}));

postRoutes.post('/:postId/reactions/:kind', auth, requireVisiblePost, h(async (req, res) => {
  const { postId, kind } = req.params;
  if (!['like', 'fire'].includes(kind)) throw bad('Reação inválida');
  const del = await q('DELETE FROM reactions WHERE post_id=$1 AND user_id=$2 AND kind=$3 RETURNING user_id', [postId, req.user.id, kind]);
  if (!del.rowCount) await q('INSERT INTO reactions (post_id,user_id,kind) VALUES ($1,$2,$3)', [postId, req.user.id, kind]);
  const { rows } = await q(
    `SELECT count(*) FILTER (WHERE kind='like')::int AS likes,
            count(*) FILTER (WHERE kind='fire')::int AS fires
     FROM reactions WHERE post_id=$1`, [postId]
  );
  res.json({ active: !del.rowCount, ...rows[0] });
}));

postRoutes.post('/:postId/repost', auth, requireVisiblePost, h(async (req, res) => {
  const { rows: orig } = await q(
    `SELECT body, media_url, palette FROM posts
     WHERE id=$1 AND hidden_at IS NULL AND COALESCE(kind,'post')='post'`,
    [req.params.postId]
  );
  if (!orig[0]) throw notFound('Publicação não encontrada');

  const del = await q('DELETE FROM posts WHERE author_id=$1 AND repost_of=$2 RETURNING id,media_url', [req.user.id, req.params.postId]);
  if (del.rowCount) {
    if (del.rows[0].media_url) removeUploadIfUnreferenced(del.rows[0].media_url).catch(() => {});
    return res.json({ reposted: false });
  }
  const { rows } = await q(
    `INSERT INTO posts (author_id,body,media_url,palette,repost_of,kind)
     VALUES ($1,$2,$3,$4,$5,'post') RETURNING id`,
    [req.user.id, orig[0].body, orig[0].media_url, orig[0].palette, req.params.postId]
  );
  res.status(201).json({ reposted: true, id: rows[0].id });
}));

postRoutes.get('/:postId/comments', auth, requireVisiblePost, h(async (req, res) => {
  const { rows } = await q(
    `SELECT cm.id, cm.author_id, cm.body, cm.created_at, cm.edited_at,
            p.author_id AS post_author_id,
            u.handle, u.name, u.palette, u.avatar_url
     FROM comments cm
     JOIN users u ON u.id=cm.author_id
     JOIN posts p ON p.id=cm.post_id
     WHERE cm.post_id=$1 AND cm.hidden_at IS NULL
     ORDER BY cm.created_at LIMIT 200`,
    [req.params.postId]
  );
  res.json(rows);
}));

postRoutes.post('/:postId/comments', auth, requireVisiblePost, h(async (req, res) => {
  const body = String(req.body.body || '').trim();
  if (!body) throw bad('Comentário vazio');
  if (body.length > 1000) throw bad('O comentário tem no máximo 1000 caracteres');
  const { rows } = await q(
    `INSERT INTO comments (post_id,author_id,body) VALUES ($1,$2,$3)
     RETURNING id,author_id,body,created_at,edited_at`,
    [req.params.postId, req.user.id, body]
  );
  res.status(201).json(rows[0]);
}));

postRoutes.patch('/:postId/comments/:commentId', auth, requireVisiblePost, h(async (req, res) => {
  const body = String(req.body.body || '').trim();
  if (!body) throw bad('Comentário vazio');
  if (body.length > 1000) throw bad('O comentário tem no máximo 1000 caracteres');
  const { rows } = await q(
    `UPDATE comments SET body=$4, edited_at=now()
     WHERE id=$1 AND post_id=$2 AND author_id=$3 AND hidden_at IS NULL
     RETURNING id,author_id,body,created_at,edited_at`,
    [req.params.commentId, req.params.postId, req.user.id, body]
  );
  if (!rows[0]) throw forbidden('Só podes editar os teus comentários');
  res.json(rows[0]);
}));

postRoutes.delete('/:postId/comments/:commentId', auth, requireVisiblePost, h(async (req, res) => {
  const { rows } = await q(
    `DELETE FROM comments cm
     USING posts p
     WHERE cm.id=$1 AND cm.post_id=$2 AND p.id=cm.post_id
       AND (cm.author_id=$3 OR p.author_id=$3)
     RETURNING cm.id`,
    [req.params.commentId, req.params.postId, req.user.id]
  );
  if (!rows[0]) throw forbidden('Só podes apagar o teu comentário ou moderar comentários no teu post');
  res.json({ deleted: true });
}));

postRoutes.delete('/:postId', auth, h(async (req, res) => {
  const { rows } = await q('DELETE FROM posts WHERE id=$1 AND author_id=$2 RETURNING media_url', [req.params.postId, req.user.id]);
  if (!rows[0]) throw notFound('Publicação não encontrada');
  if (rows[0].media_url) removeUploadIfUnreferenced(rows[0].media_url).catch(() => {});
  res.json({ deleted: true });
}));
