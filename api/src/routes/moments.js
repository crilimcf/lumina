import { Router } from 'express';
import { q } from '../db.js';
import { auth, h, bad, notFound, forbidden } from '../middleware/auth.js';

export const momentRoutes = Router();

/**
 * Momentos. Duram 24 horas (o valor por omissão já vem da base) e desaparecem
 * mesmo — `purgeMoments`, em jobs/daily.js, apaga a linha ao expirar.
 *
 * Sem comunidade própria: são pessoais, não de uma comunidade. A visibilidade
 * segue a mesma regra do resto da app — quem partilha pelo menos uma
 * comunidade contigo, e não há bloqueio nos dois sentidos.
 */

const VISIBLE_TO = `
  (m.author_id = $1 OR EXISTS (
    SELECT 1 FROM memberships m1 JOIN memberships m2 ON m1.community_id = m2.community_id
    WHERE m1.user_id = $1 AND m2.user_id = m.author_id
  ))
  AND NOT EXISTS (SELECT 1 FROM blocks b
    WHERE (b.blocker_id = $1 AND b.blocked_id = m.author_id)
       OR (b.blocked_id = $1 AND b.blocker_id = m.author_id))
`;

momentRoutes.post('/', auth, h(async (req, res) => {
  const { mediaUrl = null, palette = 0 } = req.body;
  const p = Number(palette);
  if (!Number.isInteger(p) || p < 0 || p > 4) throw bad('Cor inválida');

  // Como nos posts: a imagem tem de ser tua e já verificada. Sem isto,
  // bastava apontar mediaUrl para qualquer coisa na internet.
  if (mediaUrl) {
    const { rows: up } = await q(
      'SELECT 1 FROM uploads WHERE url = $1 AND owner_id = $2 AND confirmed_at IS NOT NULL',
      [mediaUrl, req.user.id]
    );
    if (!up[0]) throw bad('Imagem não verificada', 'unconfirmed_upload');
  }

  const { rows } = await q(
    `INSERT INTO moments (author_id, media_url, palette) VALUES ($1, $2, $3)
     RETURNING id, media_url, palette, created_at, expires_at`,
    [req.user.id, mediaUrl, p]
  );
  res.status(201).json(rows[0]);
}));

/** Os momentos ainda vivos de quem partilha comunidade contigo (e o teu). */
momentRoutes.get('/', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT m.id, m.media_url, m.palette, m.created_at, m.expires_at,
            u.id AS author_id, u.handle, u.name, u.palette AS author_palette,
            EXISTS (SELECT 1 FROM moment_views v WHERE v.moment_id = m.id AND v.user_id = $1) AS viewed
     FROM moments m JOIN users u ON u.id = m.author_id
     WHERE m.expires_at > now() AND ${VISIBLE_TO}
     ORDER BY m.created_at ASC`,
    [req.user.id]
  );
  res.json(rows);
}));

/**
 * Marca como visto. Não conta a visita de quem é o próprio autor.
 *
 * Sujeito à mesma regra de visibilidade da listagem — sem isto, alguém fora
 * das tuas comunidades (ou que bloqueaste) conseguia marcar-se como tendo
 * visto um momento que nunca devia sequer saber que existe.
 */
momentRoutes.post('/:momentId/view', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT m.author_id FROM moments m
     WHERE m.id = $2 AND m.expires_at > now() AND ${VISIBLE_TO}`,
    [req.user.id, req.params.momentId]
  );
  if (!rows[0]) throw notFound('Momento não encontrado');
  if (rows[0].author_id !== req.user.id) {
    await q(
      'INSERT INTO moment_views (moment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.momentId, req.user.id]
    );
  }
  res.json({ viewed: true });
}));

/** Quem viu, só para o autor — como nas Stories, é o autor que quer saber. */
momentRoutes.get('/:momentId/viewers', auth, h(async (req, res) => {
  const { rows: own } = await q('SELECT author_id FROM moments WHERE id = $1', [req.params.momentId]);
  if (!own[0]) throw notFound('Momento não encontrado');
  if (own[0].author_id !== req.user.id) throw forbidden('Só o autor vê quem viu');

  const { rows } = await q(
    `SELECT u.id, u.handle, u.name, u.palette, v.seen_at
     FROM moment_views v JOIN users u ON u.id = v.user_id
     WHERE v.moment_id = $1 ORDER BY v.seen_at DESC`,
    [req.params.momentId]
  );
  res.json(rows);
}));

momentRoutes.delete('/:momentId', auth, h(async (req, res) => {
  const { rowCount } = await q('DELETE FROM moments WHERE id = $1 AND author_id = $2',
    [req.params.momentId, req.user.id]);
  if (!rowCount) throw notFound('Momento não encontrado');
  res.json({ deleted: true });
}));
