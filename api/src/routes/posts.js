import { Router } from 'express';
import { q, tx } from '../db.js';
import { auth, h, bad, notFound, requirePostMember } from '../middleware/auth.js';

export const postRoutes = Router();

const SELECT_POST = `
  SELECT p.id, p.body, p.media_url, p.palette, p.created_at, p.invite_id, p.repost_of,
         c.slug AS community_slug, c.name AS community_name,
         u.id AS author_id, u.handle, u.name, u.palette AS author_palette, u.avatar_url AS author_avatar_url,
         (SELECT count(*) FROM reactions r WHERE r.post_id = p.id AND r.kind = 'like')::int AS likes,
         (SELECT count(*) FROM reactions r WHERE r.post_id = p.id AND r.kind = 'fire')::int AS fires,
         (SELECT count(*) FROM posts rp WHERE rp.repost_of = p.id)::int AS reposts,
         (SELECT count(*) FROM comments cm WHERE cm.post_id = p.id AND cm.hidden_at IS NULL)::int AS comments,
         (SELECT array_agg(r.kind) FROM reactions r WHERE r.post_id = p.id AND r.user_id = $1) AS my_reactions
  FROM posts p
  JOIN users u ON u.id = p.author_id
  JOIN communities c ON c.id = p.community_id
`;

/**
 * Feed. Cronológico, sempre. Não há ordenação por reações — é a promessa
 * central do produto e é aqui que ela se cumpre ou se perde.
 */
postRoutes.get('/feed', auth, h(async (req, res) => {
  const before = req.query.before || null;
  const limit = Math.min(Number(req.query.limit) || 20, 50);

  const { rows } = await q(
    `${SELECT_POST}
     WHERE p.hidden_at IS NULL
       AND p.community_id IN (SELECT community_id FROM memberships WHERE user_id = $1)
       -- bloqueios cortam nos dois sentidos: nem eu vejo, nem quem me bloqueou me ve
       AND NOT EXISTS (SELECT 1 FROM blocks b
                       WHERE (b.blocker_id = $1 AND b.blocked_id = p.author_id)
                          OR (b.blocked_id = $1 AND b.blocker_id = p.author_id))
       AND ($2::timestamptz IS NULL OR p.created_at < $2)
     ORDER BY p.created_at DESC
     LIMIT $3`,
    [req.user.id, before, limit]
  );
  res.json({ posts: rows, nextCursor: rows.length === limit ? rows.at(-1).created_at : null });
}));

postRoutes.post('/', auth, h(async (req, res) => {
  const { communityId, body, mediaUrl = null, palette = 0, inviteId = null } = req.body;
  if (!communityId || !body) throw bad('Faltam campos');

  // A imagem tem de ser tua e ter passado a verificacao de assinatura. Sem
  // isto, bastava apontar mediaUrl para qualquer coisa na internet.
  if (mediaUrl) {
    const { rows: up } = await q(
      'SELECT 1 FROM uploads WHERE url = $1 AND owner_id = $2 AND confirmed_at IS NOT NULL',
      [mediaUrl, req.user.id]
    );
    if (!up[0]) throw bad('Imagem nao verificada', 'unconfirmed_upload');
  }

  const { rows: mem } = await q(
    'SELECT 1 FROM memberships WHERE community_id = $1 AND user_id = $2',
    [communityId, req.user.id]
  );
  if (!mem[0]) throw bad('Só membros publicam nesta comunidade', 'not_member');

  const post = await tx(async (c) => {
    if (inviteId) {
      const { rows: inv } = await c.query(
        `SELECT id FROM invites
         WHERE id = $1 AND community_id = $2 AND now() BETWEEN opens_at AND closes_at`,
        [inviteId, communityId]
      );
      if (!inv[0]) throw bad('Esse convite já fechou', 'invite_closed');
    }
    const { rows } = await c.query(
      `INSERT INTO posts (author_id, community_id, body, media_url, palette, invite_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [req.user.id, communityId, body, mediaUrl, palette, inviteId]
    );
    if (inviteId) {
      await c.query('UPDATE invites SET reply_count = reply_count + 1 WHERE id = $1', [inviteId]);
      // Marca o dia no registo. Sem contador, sem reset: so acumula.
      await c.query(
        `INSERT INTO answer_days (user_id, community_id, local_date)
         SELECT $1, $2, i.local_date FROM invites i WHERE i.id = $3
         ON CONFLICT DO NOTHING`,
        [req.user.id, communityId, inviteId]
      );
    }
    return rows[0];
  });

  const { rows } = await q(`${SELECT_POST} WHERE p.id = $2`, [req.user.id, post.id]);
  res.status(201).json(rows[0]);
}));

/** Reagir. Duas reações independentes, nenhuma delas mexe na ordem do feed. */
postRoutes.post('/:postId/reactions/:kind', auth, requirePostMember, h(async (req, res) => {
  const { postId, kind } = req.params;
  if (!['like', 'fire'].includes(kind)) throw bad('Reação inválida');

  const del = await q(
    'DELETE FROM reactions WHERE post_id = $1 AND user_id = $2 AND kind = $3 RETURNING user_id',
    [postId, req.user.id, kind]
  );
  if (!del.rowCount) {
    await q('INSERT INTO reactions (post_id, user_id, kind) VALUES ($1, $2, $3)',
      [postId, req.user.id, kind]);
  }
  const { rows } = await q(
    `SELECT count(*) FILTER (WHERE kind = 'like')::int AS likes,
            count(*) FILTER (WHERE kind = 'fire')::int AS fires
     FROM reactions WHERE post_id = $1`, [postId]
  );
  res.json({ active: !del.rowCount, ...rows[0] });
}));

/** Republicar. Cria um post novo que aponta para o original. */
postRoutes.post('/:postId/repost', auth, h(async (req, res) => {
  const { rows: orig } = await q(
    'SELECT community_id, body, media_url, palette FROM posts WHERE id = $1 AND hidden_at IS NULL',
    [req.params.postId]
  );
  if (!orig[0]) throw notFound('Publicação não encontrada');

  // Sem isto, republicar metia conteudo em nome de quem nao e membro da
  // comunidade — a mesma regra que POST / ja aplica a publicar de raiz.
  const { rows: mem } = await q(
    'SELECT 1 FROM memberships WHERE community_id = $1 AND user_id = $2',
    [orig[0].community_id, req.user.id]
  );
  if (!mem[0]) throw bad('Só membros desta comunidade republicam aqui', 'not_member');

  const del = await q(
    'DELETE FROM posts WHERE author_id = $1 AND repost_of = $2 RETURNING id',
    [req.user.id, req.params.postId]
  );
  if (del.rowCount) return res.json({ reposted: false });

  const { rows } = await q(
    `INSERT INTO posts (author_id, community_id, body, media_url, palette, repost_of)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [req.user.id, orig[0].community_id, orig[0].body, orig[0].media_url, orig[0].palette, req.params.postId]
  );
  res.status(201).json({ reposted: true, id: rows[0].id });
}));

postRoutes.get('/:postId/comments', auth, requirePostMember, h(async (req, res) => {
  const { rows } = await q(
    `SELECT cm.id, cm.body, cm.created_at, u.handle, u.name, u.palette, u.avatar_url
     FROM comments cm JOIN users u ON u.id = cm.author_id
     WHERE cm.post_id = $1 AND cm.hidden_at IS NULL ORDER BY cm.created_at LIMIT 200`,
    [req.params.postId]
  );
  res.json(rows);
}));

postRoutes.post('/:postId/comments', auth, requirePostMember, h(async (req, res) => {
  const body = String(req.body.body || '').trim();
  if (!body) throw bad('Comentário vazio');
  const { rows } = await q(
    `INSERT INTO comments (post_id, author_id, body) VALUES ($1, $2, $3)
     RETURNING id, body, created_at`,
    [req.params.postId, req.user.id, body]
  );
  res.status(201).json(rows[0]);
}));

postRoutes.delete('/:postId', auth, h(async (req, res) => {
  const { rowCount } = await q('DELETE FROM posts WHERE id = $1 AND author_id = $2',
    [req.params.postId, req.user.id]);
  if (!rowCount) throw notFound('Publicação não encontrada');
  res.json({ deleted: true });
}));
