import { Router } from 'express';
import { q, tx } from '../db.js';
import { env } from '../env.js';
import { auth, h, bad, notFound, forbidden, requireMember } from '../middleware/auth.js';

export const communityRoutes = Router();

function validTimezone(tz) {
  try {
    new Intl.DateTimeFormat('pt-PT', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

communityRoutes.post('/', auth, h(async (req, res) => {
  const cleanSlug = String(req.body.slug || '').trim().toLowerCase();
  const cleanName = String(req.body.name || '').trim();
  const description = String(req.body.description || '').trim();
  const timezone = String(req.body.timezone || 'Europe/Lisbon').trim();
  const seedProposals = req.body.seedProposals;

  if (!/^[a-z0-9-]{2,32}$/.test(cleanSlug)) {
    throw bad('O identificador tem 2 a 32 caracteres: letras minúsculas, números ou hífen', 'bad_slug');
  }
  if (cleanName.length < 2 || cleanName.length > 60) {
    throw bad('O nome da comunidade tem entre 2 e 60 caracteres', 'bad_name');
  }
  if (description.length > 300) throw bad('A descrição tem no máximo 300 caracteres', 'bad_description');
  if (!validTimezone(timezone)) throw bad('Fuso horário inválido (usa formato IANA, ex: Europe/Lisbon)');

  const seeds = Array.isArray(seedProposals) ? seedProposals.map(s => String(s).trim()).filter(Boolean) : [];
  if (seeds.length < env.SEED_PROPOSALS_REQUIRED) {
    throw bad(`Escreve ${env.SEED_PROPOSALS_REQUIRED} convites de arranque para a comunidade`, 'seeds_required');
  }
  if (seeds.length > 20) throw bad('No máximo 20 convites de arranque', 'too_many_seeds');
  if (seeds.some(s => s.length < 3 || s.length > 120)) throw bad('Cada convite tem entre 3 e 120 caracteres');
  if (seeds.some(s => /https?:\/\/|www\./i.test(s))) throw bad('Sem ligações nos convites');

  const community = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO communities (slug, name, description, timezone, founder_id, member_count)
       VALUES ($1, $2, $3, $4, $5, 1) RETURNING *`,
      [cleanSlug, cleanName, description, timezone, req.user.id]
    );
    const com = rows[0];

    await c.query(
      `INSERT INTO memberships (community_id, user_id, role) VALUES ($1, $2, 'founder')`,
      [com.id, req.user.id]
    );

    for (const text of seeds) {
      await c.query(
        `INSERT INTO proposals (community_id, author_id, text, is_seed, vote_count)
         VALUES ($1, $2, $3, true, 0)`,
        [com.id, req.user.id, text]
      );
    }
    return com;
  });

  res.status(201).json(community);
}));

/** Comunidades legadas públicas. A comunidade técnica do Feed nunca é exposta. */
communityRoutes.get('/', h(async (_req, res) => {
  const { rows } = await q(
    `SELECT id, slug, name, description, timezone, member_count
     FROM communities
     WHERE COALESCE(is_system, false) = false
     ORDER BY member_count DESC LIMIT 100`
  );
  res.json(rows);
}));

communityRoutes.get('/mine', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT c.id, c.slug, c.name, c.timezone, c.member_count, m.role,
            i.id AS invite_id, i.text AS invite_text, i.closes_at, i.reply_count,
            EXISTS (SELECT 1 FROM posts p WHERE p.invite_id = i.id AND p.author_id = $1) AS answered
     FROM memberships m
     JOIN communities c ON c.id = m.community_id
     LEFT JOIN invites i ON i.community_id = c.id AND now() BETWEEN i.opens_at AND i.closes_at
     WHERE m.user_id = $1 AND COALESCE(c.is_system, false) = false
     ORDER BY m.joined_at`,
    [req.user.id]
  );
  res.json(rows);
}));

/** Aceita UUID ou slug sem expor o espaço técnico do Feed. */
communityRoutes.get('/:communityId', h(async (req, res) => {
  const { rows } = await q(
    `SELECT * FROM communities
     WHERE (id::text = $1 OR slug = $1) AND COALESCE(is_system, false) = false`,
    [String(req.params.communityId)]
  );
  if (!rows[0]) throw notFound('Comunidade não encontrada');
  res.json(rows[0]);
}));

communityRoutes.post('/:communityId/join', auth, h(async (req, res) => {
  await tx(async (c) => {
    const { rows: exists } = await c.query(
      'SELECT 1 FROM communities WHERE id = $1 AND COALESCE(is_system, false) = false',
      [req.params.communityId]
    );
    if (!exists[0]) throw notFound('Comunidade não encontrada');

    const ins = await c.query(
      `INSERT INTO memberships (community_id, user_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING user_id`,
      [req.params.communityId, req.user.id]
    );
    if (ins.rowCount) {
      await c.query('UPDATE communities SET member_count = member_count + 1 WHERE id = $1',
        [req.params.communityId]);
    }
  });
  res.json({ joined: true });
}));

communityRoutes.post('/:communityId/leave', auth, h(async (req, res) => {
  const left = await tx(async (c) => {
    const del = await c.query(
      `DELETE FROM memberships WHERE community_id = $1 AND user_id = $2 AND role <> 'founder'
       AND community_id IN (SELECT id FROM communities WHERE COALESCE(is_system, false) = false)
       RETURNING user_id`,
      [req.params.communityId, req.user.id]
    );
    if (del.rowCount) {
      await c.query('UPDATE communities SET member_count = GREATEST(member_count - 1, 0) WHERE id = $1',
        [req.params.communityId]);
      return true;
    }

    const { rows: membership } = await c.query(
      `SELECT m.role FROM memberships m JOIN communities c ON c.id=m.community_id
       WHERE m.community_id = $1 AND m.user_id = $2 AND COALESCE(c.is_system, false) = false`,
      [req.params.communityId, req.user.id]
    );
    if (membership[0]?.role === 'founder') {
      throw bad('Quem fundou a comunidade não pode sair sem transferir a responsabilidade', 'founder_cannot_leave');
    }
    return false;
  });
  res.json({ left });
}));

communityRoutes.post('/:communityId/moderators', auth, h(async (req, res) => {
  const { userId, role = 'moderator' } = req.body;
  if (!userId) throw bad('Falta a pessoa', 'user_required');
  if (!['member', 'moderator'].includes(role)) throw bad('Papel inválido');

  if (!req.user.is_staff) {
    const { rows: founder } = await q(
      `SELECT 1 FROM memberships m JOIN communities c ON c.id=m.community_id
       WHERE m.community_id = $1 AND m.user_id = $2 AND m.role = 'founder'
         AND COALESCE(c.is_system, false) = false`,
      [req.params.communityId, req.user.id]
    );
    if (!founder[0]) throw forbidden('Só quem fundou esta comunidade gere moderadores');
  }

  const { rows } = await q(
    `UPDATE memberships SET role = $3
     WHERE community_id = $1 AND user_id = $2 AND role <> 'founder' RETURNING *`,
    [req.params.communityId, userId, role]
  );
  if (!rows[0]) throw notFound('Essa pessoa não é membro');
  res.json(rows[0]);
}));

communityRoutes.get('/:communityId/members', auth, requireMember(), h(async (req, res) => {
  const { rows } = await q(
    `SELECT u.id, u.handle, u.name, u.palette, m.role, m.joined_at
     FROM memberships m JOIN users u ON u.id = m.user_id
     JOIN communities c ON c.id=m.community_id
     WHERE m.community_id = $1 AND COALESCE(c.is_system, false) = false
     ORDER BY m.joined_at LIMIT 200`,
    [req.params.communityId]
  );
  res.json(rows);
}));
