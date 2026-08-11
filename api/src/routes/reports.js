import { Router } from 'express';
import { q, tx } from '../db.js';
import { env } from '../env.js';
import { auth, h, bad, notFound, forbidden, audit } from '../middleware/auth.js';

export const reportRoutes = Router();
const TABLE = { post: 'posts', comment: 'comments' };
const ERROR_KINDS = new Set(['react_boundary', 'window_error', 'unhandled_rejection']);

const clip = (value, max) => {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
};

const cleanPath = (value) => {
  const raw = clip(value, 1200);
  if (!raw) return null;
  try { return new URL(raw, 'https://lumina.invalid').pathname.slice(0, 500); }
  catch { return raw.split('?')[0].split('#')[0].slice(0, 500); }
};

async function assertReportable(user, targetType, targetId) {
  if (targetType === 'user') {
    if (targetId === user.id) throw bad('Não te podes denunciar a ti próprio');
    const { rows } = await q('SELECT 1 FROM users WHERE id = $1 AND suspended_at IS NULL', [targetId]);
    if (!rows[0]) throw notFound('Alvo não encontrado');
    return;
  }

  if (user.is_staff) {
    const table = TABLE[targetType];
    const { rows } = await q(`SELECT 1 FROM ${table} WHERE id = $1`, [targetId]);
    if (!rows[0]) throw notFound('Alvo não encontrado');
    return;
  }

  const sql = targetType === 'post'
    ? `SELECT 1 FROM posts p
       WHERE p.id=$1 AND p.hidden_at IS NULL
         AND (p.author_id=$2 OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id=$2 AND f.following_id=p.author_id))
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=p.author_id) OR (b.blocked_id=$2 AND b.blocker_id=p.author_id))`
    : `SELECT 1 FROM comments cm
       JOIN posts p ON p.id=cm.post_id
       WHERE cm.id=$1 AND cm.hidden_at IS NULL AND p.hidden_at IS NULL
         AND (p.author_id=$2 OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id=$2 AND f.following_id=p.author_id))
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=p.author_id) OR (b.blocked_id=$2 AND b.blocker_id=p.author_id))`;
  const { rows } = await q(sql, [targetId, user.id]);
  if (!rows[0]) throw notFound('Alvo não encontrado');
}

reportRoutes.post('/client-error', auth, h(async (req, res) => {
  const kind = ERROR_KINDS.has(req.body?.kind) ? req.body.kind : 'window_error';
  const message = clip(req.body?.message, 800);
  if (!message) throw bad('Erro sem mensagem', 'bad_error_event');

  const context = {};
  if (typeof req.body?.asset === 'string') context.asset = clip(req.body.asset, 500);
  if (typeof req.body?.online === 'boolean') context.online = req.body.online;

  await q(
    `INSERT INTO app_errors
      (source, kind, message, stack, component_stack, path, release, user_id, user_agent, context)
     VALUES ('web', $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      kind,
      message,
      clip(req.body?.stack, 8000),
      clip(req.body?.componentStack, 6000),
      cleanPath(req.body?.path),
      clip(req.body?.release, 160),
      req.user.id,
      clip(req.headers['user-agent'], 240),
      context,
    ]
  );

  res.status(202).json({ accepted: true });
}));

reportRoutes.get('/errors', auth, h(async (req, res) => {
  if (!req.user.is_staff) throw forbidden('Apenas a equipa Lumina pode consultar diagnósticos');
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const { rows } = await q(
    `SELECT id, source, kind, message, stack, component_stack, path, method,
            release, user_id, user_agent, context, created_at
       FROM app_errors
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit]
  );
  res.json({ errors: rows });
}));

reportRoutes.post('/', auth, h(async (req, res) => {
  const { targetType, targetId, reason, note = null } = req.body;
  if (!['post', 'comment', 'user'].includes(targetType)) throw bad('Tipo invalido');
  if (!['spam', 'abuso', 'ilegal', 'outro'].includes(reason)) throw bad('Motivo invalido');
  if (!targetId) throw bad('Falta o alvo');

  await assertReportable(req.user, targetType, targetId);

  const out = await tx(async (c) => {
    await c.query(
      `INSERT INTO reports (reporter_id, target_type, target_id, reason, note)
       VALUES ($1, $2, $3, $4, $5)`,
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
      const upd = await c.query(`UPDATE ${table} SET hidden_at = now() WHERE id = $1 AND hidden_at IS NULL RETURNING id`, [targetId]);
      hidden = upd.rowCount > 0;
    }
    return { reports: rows[0].n, hidden };
  });

  res.status(201).json(out);
}));

/** A fila global é reservada à equipa Lumina. */
reportRoutes.get('/queue', auth, h(async (req, res) => {
  if (!req.user.is_staff) throw forbidden('Só a equipa Lumina pode moderar conteúdo global');
  const { rows } = await q(
    `SELECT r.id,r.target_type,r.target_id,r.reason,r.note,r.created_at,
            count(*) OVER (PARTITION BY r.target_type,r.target_id)::int AS total,
            CASE r.target_type
              WHEN 'post' THEN (SELECT body FROM posts WHERE id=r.target_id)
              WHEN 'comment' THEN (SELECT body FROM comments WHERE id=r.target_id)
            END AS content
     FROM reports r
     WHERE r.resolved_at IS NULL
     ORDER BY total DESC,r.created_at
     LIMIT 200`
  );
  res.json(rows);
}));

reportRoutes.post('/:reportId/resolve', auth, h(async (req, res) => {
  if (!req.user.is_staff) throw forbidden('Só a equipa Lumina pode decidir denúncias');
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
    } else if (!['mantido', 'removido'].includes(resolution)) throw bad('Decisao invalida para conteudo', 'bad_resolution');

    await c.query(
      `UPDATE reports SET resolved_at = now(), resolution = $1, resolved_by = $2
       WHERE target_type = $3 AND target_id = $4 AND resolved_at IS NULL`,
      [resolution, req.user.id, r.target_type, r.target_id]
    );
    if (table && resolution === 'mantido') await c.query(`UPDATE ${table} SET hidden_at = NULL WHERE id = $1`, [r.target_id]);
    if (table && resolution === 'removido') await c.query(`UPDATE ${table} SET hidden_at = now() WHERE id = $1`, [r.target_id]);
    if (resolution === 'suspenso') await c.query('UPDATE users SET suspended_at = now() WHERE id = $1', [r.target_id]);
    return { resolution, target: r.target_id };
  });

  audit(req.user.id, `moderacao:${resolution}`, out.target, { reportId: req.params.reportId });
  res.json(out);
}));
