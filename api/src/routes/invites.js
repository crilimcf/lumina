import { Router } from 'express';
import { q, tx } from '../db.js';
import { env } from '../env.js';
import { auth, h, bad, notFound, requireMember } from '../middleware/auth.js';

export const inviteRoutes = Router();

/** O convite ativo da comunidade (o de hoje, no fuso dela). */
inviteRoutes.get('/:communityId/today', auth, requireMember(), h(async (req, res) => {
  const { rows } = await q(
    `SELECT i.*, u.handle AS author_handle, u.name AS author_name,
       EXISTS (
         SELECT 1 FROM posts p WHERE p.invite_id = i.id AND p.author_id = $2
       ) AS answered
     FROM invites i
     LEFT JOIN users u ON u.id = i.author_id
     WHERE i.community_id = $1 AND now() BETWEEN i.opens_at AND i.closes_at
     ORDER BY i.opens_at DESC LIMIT 1`,
    [req.params.communityId, req.user.id]
  );
  if (!rows[0]) return res.json(null);   // comunidade ainda sem convite hoje
  res.json(rows[0]);
}));

/**
 * A bolsa de propostas em votação, mais votadas primeiro.
 * A primeira da lista é a candidata a convite de amanhã.
 */
inviteRoutes.get('/:communityId/proposals', auth, requireMember(), h(async (req, res) => {
  const { rows } = await q(
    `SELECT p.id, p.text, p.vote_count, p.is_seed, p.created_at,
            u.handle AS author_handle, u.name AS author_name,
            EXISTS (SELECT 1 FROM proposal_votes v
                    WHERE v.proposal_id = p.id AND v.user_id = $2) AS voted
     FROM proposals p
     LEFT JOIN users u ON u.id = p.author_id
     WHERE p.community_id = $1 AND p.used_at IS NULL AND p.hidden_at IS NULL
     ORDER BY p.vote_count DESC, p.created_at ASC
     LIMIT 50`,
    [req.params.communityId, req.user.id]
  );
  res.json({ tomorrow: rows[0] || null, proposals: rows });
}));

/**
 * Propor um convite. Três limites automáticos, por esta ordem de eficácia:
 * conta com idade mínima, teto semanal, e nada de ligações no texto.
 * Isto sozinho apanha quase todo o spam sem envolver ninguém.
 */
inviteRoutes.post('/:communityId/proposals', auth, requireMember(), h(async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (text.length < 3 || text.length > 120) throw bad('O convite tem entre 3 e 120 caracteres');
  if (/https?:\/\/|www\./i.test(text)) throw bad('Sem ligações nos convites');

  const ageHours = (Date.now() - new Date(req.user.created_at)) / 3_600_000;
  if (ageHours < env.MIN_ACCOUNT_AGE_HOURS) {
    throw bad('Contas novas podem propor a partir de amanhã', 'account_too_new');
  }

  // As propostas-semente são obrigatórias para arrancar uma comunidade e não
  // representam spam/atividade semanal. Contá-las aqui bloqueava imediatamente
  // quem acabava de fundar uma comunidade (5 seeds > limite normal de 3).
  const { rows: recent } = await q(
    `SELECT count(*)::int AS n FROM proposals
     WHERE author_id = $1 AND is_seed = false AND created_at > now() - interval '7 days'`,
    [req.user.id]
  );
  if (recent[0].n >= env.PROPOSALS_PER_WEEK) {
    throw bad(`Máximo de ${env.PROPOSALS_PER_WEEK} propostas por semana`, 'weekly_limit');
  }

  // Quem propõe vota automaticamente na sua ideia.
  const proposal = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO proposals (community_id, author_id, text, vote_count)
       VALUES ($1, $2, $3, 1) RETURNING *`,
      [req.params.communityId, req.user.id, text]
    );
    await c.query('INSERT INTO proposal_votes (proposal_id, user_id) VALUES ($1, $2)',
      [rows[0].id, req.user.id]);
    return rows[0];
  });

  res.status(201).json(proposal);
}));

/** Votar / retirar voto. O índice único impede voto duplo mesmo com corrida. */
inviteRoutes.post('/proposals/:proposalId/vote', auth, h(async (req, res) => {
  const out = await tx(async (c) => {
    const { rows: pr } = await c.query(
      `SELECT p.id, p.community_id FROM proposals p
       WHERE p.id = $1 AND p.used_at IS NULL AND p.hidden_at IS NULL FOR UPDATE`,
      [req.params.proposalId]
    );
    if (!pr[0]) throw notFound('Proposta não encontrada');

    const { rows: mem } = await c.query(
      'SELECT 1 FROM memberships WHERE community_id = $1 AND user_id = $2',
      [pr[0].community_id, req.user.id]
    );
    if (!mem[0]) throw bad('Só membros desta comunidade votam aqui', 'not_member');

    const del = await c.query(
      'DELETE FROM proposal_votes WHERE proposal_id = $1 AND user_id = $2 RETURNING user_id',
      [req.params.proposalId, req.user.id]
    );
    const delta = del.rowCount ? -1 : 1;
    if (!del.rowCount) {
      await c.query('INSERT INTO proposal_votes (proposal_id, user_id) VALUES ($1, $2)',
        [req.params.proposalId, req.user.id]);
    }
    const { rows } = await c.query(
      'UPDATE proposals SET vote_count = vote_count + $2 WHERE id = $1 RETURNING vote_count',
      [req.params.proposalId, delta]
    );
    return { voted: delta === 1, voteCount: rows[0].vote_count };
  });
  res.json(out);
}));

/** As respostas ao convite. Só membros podem consultar; só abrem após responder. */
inviteRoutes.get('/:inviteId/replies', auth, h(async (req, res) => {
  const { rows: access } = await q(
    `SELECT i.reply_count
     FROM invites i
     JOIN memberships m ON m.community_id = i.community_id
     WHERE i.id = $1 AND m.user_id = $2`,
    [req.params.inviteId, req.user.id]
  );
  if (!access[0]) throw notFound('Convite não encontrado');

  const { rows: mine } = await q(
    'SELECT 1 FROM posts WHERE invite_id = $1 AND author_id = $2',
    [req.params.inviteId, req.user.id]
  );
  if (!mine[0]) {
    return res.json({ locked: true, replyCount: access[0].reply_count, replies: [] });
  }

  const { rows } = await q(
    `SELECT p.id, p.body, p.media_url, p.palette, p.created_at,
            u.handle, u.name, u.palette AS author_palette
     FROM posts p JOIN users u ON u.id = p.author_id
     WHERE p.invite_id = $1 AND p.hidden_at IS NULL
     ORDER BY p.created_at DESC LIMIT 100`,
    [req.params.inviteId]
  );
  res.json({ locked: false, replyCount: rows.length, replies: rows });
}));
