import { Router } from 'express';
import { q, tx } from '../db.js';
import { env } from '../env.js';
import { auth, h, bad, notFound, requireModerator, audit } from '../middleware/auth.js';

export const reportRoutes = Router();

const TABLE = { post: 'posts', comment: 'comments', proposal: 'proposals' };

/**
 * Confirma que o alvo existe e, no caso de conteúdo de comunidade, que quem
 * denuncia o poderia realmente ver. Sem isto, bastava conhecer/adivinhar um
 * UUID para criar denúncias e até auto-ocultar conteúdo de outra comunidade.
 */
async function assertReportable(user, targetType, targetId) {
  if (targetType === 'user') {
    if (targetId === user.id) throw bad('Não te podes denunciar a ti próprio');
    const { rows } = await q('SELECT 1 FROM users WHERE id = $1 AND suspended_at IS NULL', [targetId]);
    if (!rows[0]) throw notFound('Alvo não encontrado');
    return;
  }

  let sql;
  if (targetType === 'post') {
    sql = `SELECT 1 FROM posts p
           JOIN memberships m ON m.community_id = p.community_id
           WHERE p.id = $1 AND m.user_id = $2`;
  } else if (targetType === 'proposal') {
    sql = `SELECT 1 FROM proposals p
           JOIN memberships m ON m.community_id = p.community_id
           WHERE p.id = $1 AND m.user_id = $2`;
  } else {
    sql = `SELECT 1 FROM comments cm
           JOIN posts p ON p.id = cm.post_id
           JOIN memberships m ON m.community_id = p.community_id
           WHERE cm.id = $1 AND m.user_id = $2`;
  }

  if (user.is_staff) {
    const table = TABLE[targetType];
    const { rows } = await q(`SELECT 1 FROM ${table} WHERE id = $1`, [targetId]);
    if (!rows[0]) throw notFound('Alvo não encontrado');
    return;
  }

  const { rows } = await q(sql, [targetId, user.id]);
  // 404 em vez de 403: não confirmamos a existência de conteúdo que a pessoa
  // não tem autorização para ver.
  if (!rows[0]) throw notFound('Alvo não encontrado');
}

/**
 * Denunciar. Ao fim de REPORTS_TO_AUTOHIDE denuncias distintas o conteudo sai
 * de vista automaticamente, a espera de um moderador.
 *
 * Ocultar nao e decidir. Tres pessoas incomodadas chegam para tirar da frente;
 * quem decide se volta e um moderador. Deliberadamente nao e por votacao: uma
 * proposta ofensiva pode ser popular.
 */
reportRoutes.post('/', auth, h(async (req, res) => {
  const { targetType, targetId, reason, note = null } = req.body;
  if (!['post', 'comment', 'proposal', 'user'].includes(targetType)) throw bad('Tipo invalido');
  if (!['spam', 'abuso', 'ilegal', 'outro'].includes(reason)) throw bad('Motivo invalido');
  if (!targetId) throw bad('Falta o alvo');

  await assertReportable(req.user, targetType, targetId);

  const out = await tx(async (c) => {
    await c.query(
      `INSERT INTO reports (reporter_id, target_type, target_id, reason, note)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (reporter_id, target_type, target_id) DO NOTHING`,
      [req.user.id, targetType, targetId, reason, note]
    );

    const { rows } = await c.query(
      `SELECT count(*)::int AS n FROM reports
       WHERE target_type = $1 AND target_id = $2 AND resolved_at IS NULL`,
      [targetType, targetId]
    );

    let hidden = false;
    const table = TABLE[targetType];
    if (table && rows[0].n >= env.REPORTS_TO_AUTOHIDE) {
      const upd = await c.query(
        `UPDATE ${table} SET hidden_at = now() WHERE id = $1 AND hidden_at IS NULL RETURNING id`,
        [targetId]
      );
      hidden = upd.rowCount > 0;
    }
    return { reports: rows[0].n, hidden };
  });

  res.status(201).json(out);
}));

/** Fila de moderacao da comunidade. */
reportRoutes.get('/community/:communityId', auth, requireModerator(), h(async (req, res) => {
  const { rows } = await q(
    `SELECT r.id, r.target_type, r.target_id, r.reason, r.note, r.created_at,
            count(*) OVER (PARTITION BY r.target_type, r.target_id)::int AS total,
            CASE r.target_type
              WHEN 'post'     THEN (SELECT body FROM posts     WHERE id = r.target_id)
              WHEN 'comment'  THEN (SELECT body FROM comments  WHERE id = r.target_id)
              WHEN 'proposal' THEN (SELECT text FROM proposals WHERE id = r.target_id)
            END AS content
     FROM reports r
     WHERE r.resolved_at IS NULL
       AND (
         (r.target_type = 'post' AND r.target_id IN (SELECT id FROM posts WHERE community_id = $1))
      OR (r.target_type = 'proposal' AND r.target_id IN (SELECT id FROM proposals WHERE community_id = $1))
      OR (r.target_type = 'comment' AND r.target_id IN
            (SELECT cm.id FROM comments cm JOIN posts p ON p.id = cm.post_id WHERE p.community_id = $1))
       )
     ORDER BY total DESC, r.created_at LIMIT 100`,
    [req.params.communityId]
  );
  res.json(rows);
}));

/**
 * Decidir. Conteúdo só pode ser mantido/removido; contas só podem ser
 * mantidas/suspensas. Validar depois de carregar a denúncia impede que uma
 * decisão com nome válido mas sem efeito feche a fila silenciosamente.
 */
reportRoutes.post('/:reportId/resolve', auth, h(async (req, res) => {
  const { resolution } = req.body;
  if (!['removido', 'mantido', 'suspenso'].includes(resolution)) throw bad('Decisao invalida');

  const out = await tx(async (c) => {
    const { rows } = await c.query('SELECT * FROM reports WHERE id = $1 FOR UPDATE', [req.params.reportId]);
    const r = rows[0];
    if (!r) throw notFound('Denuncia nao encontrada');
    if (r.resolved_at) throw bad('Ja foi decidida', 'already_resolved');

    const table = TABLE[r.target_type];
    if (r.target_type === 'user') {
      if (!['mantido', 'suspenso'].includes(resolution)) throw bad('Decisao invalida para uma conta', 'bad_resolution');
    } else if (!['mantido', 'removido'].includes(resolution)) {
      throw bad('Decisao invalida para conteudo', 'bad_resolution');
    }

    // Quem decide: staff, ou moderador da comunidade a que o conteudo pertence.
    if (!req.user.is_staff) {
      if (r.target_type === 'user') throw bad('So a equipa decide sobre contas', 'staff_only');
      const sql = r.target_type === 'comment'
        ? `SELECT 1 FROM comments cm
             JOIN posts p ON p.id = cm.post_id
             JOIN memberships m ON m.community_id = p.community_id
           WHERE cm.id = $1 AND m.user_id = $2 AND m.role IN ('moderator','founder')`
        : `SELECT 1 FROM ${table} x
             JOIN memberships m ON m.community_id = x.community_id
           WHERE x.id = $1 AND m.user_id = $2 AND m.role IN ('moderator','founder')`;
      const { rows: mod } = await c.query(sql, [r.target_id, req.user.id]);
      if (!mod[0]) throw bad('So moderadores desta comunidade', 'not_moderator');
    }

    // Fecha todas as denuncias abertas sobre o mesmo alvo.
    await c.query(
      `UPDATE reports SET resolved_at = now(), resolution = $1, resolved_by = $2
       WHERE target_type = $3 AND target_id = $4 AND resolved_at IS NULL`,
      [resolution, req.user.id, r.target_type, r.target_id]
    );

    if (table && resolution === 'mantido') {
      await c.query(`UPDATE ${table} SET hidden_at = NULL WHERE id = $1`, [r.target_id]);
    }
    if (table && resolution === 'removido') {
      await c.query(`UPDATE ${table} SET hidden_at = now() WHERE id = $1`, [r.target_id]);
    }
    if (resolution === 'suspenso') {
      await c.query('UPDATE users SET suspended_at = now() WHERE id = $1', [r.target_id]);
    }
    return { resolution, target: r.target_id };
  });

  audit(req.user.id, `moderacao:${resolution}`, out.target, { reportId: req.params.reportId });
  res.json(out);
}));
