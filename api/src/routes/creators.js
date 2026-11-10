import { Router } from 'express';
import { q, tx } from '../db.js';
import { env } from '../env.js';
import { auth, h, bad, HttpError } from '../middleware/auth.js';

export const creatorRoutes = Router();

creatorRoutes.use((_req, _res, next) => {
  if (!env.FEATURE_CREATORS) return next(new HttpError(404, 'Funcionalidade indisponível', 'feature_off'));
  next();
});

const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

creatorRoutes.get('/me/plans', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT id, title, description, price_cents, currency, billing_period, status, created_at
       FROM creator_plans WHERE creator_id=$1 ORDER BY created_at DESC LIMIT 10`,
    [req.user.id]
  );
  res.json({ plans: rows });
}));

creatorRoutes.post('/me/plans', auth, h(async (req, res) => {
  const { title, description = '', price_cents: cents, billing_period: period } = req.body || {};
  if (typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 80) throw bad('Título inválido');
  if (typeof description !== 'string' || description.length > 500) throw bad('Descrição inválida');
  if (!Number.isInteger(cents) || cents < 100 || cents > 100000) throw bad('Preço inválido');
  if (!['month','year'].includes(period)) throw bad('Periodicidade inválida');
  const { rows } = await q(
    `INSERT INTO creator_plans (creator_id,title,description,price_cents,billing_period)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id,title,description,price_cents,currency,billing_period,status`,
    [req.user.id,title.trim(),description,cents,period]
  );
  res.status(201).json({ plan: rows[0] });
}));

creatorRoutes.get('/:creatorId/plans', h(async (req, res) => {
  if (!uuid(req.params.creatorId)) throw bad('Criador inválido');
  const { rows } = await q(
    `SELECT id, title, description, price_cents, currency, billing_period
       FROM creator_plans WHERE creator_id=$1 AND status='published'
       ORDER BY price_cents ASC LIMIT 10`,
    [req.params.creatorId]
  );
  res.json({ plans: rows });
}));


creatorRoutes.post('/me/content', auth, h(async (req, res) => {
  const { title, body = '' } = req.body || {};
  if (typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 160) throw bad('Título inválido');
  if (typeof body !== 'string' || body.length > 10000) throw bad('Conteúdo inválido');
  const content = await tx(async client => {
    // Serialise a creator's writes and cap drafts/posts to protect small DB volumes.
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
    const { rows: count } = await client.query(
      'SELECT COUNT(*)::int AS total FROM creator_member_content WHERE creator_id=$1',
      [req.user.id]
    );
    if (count[0].total >= 50) {
      throw new HttpError(429, 'Limite de 50 conteúdos atingido', 'creator_content_limit');
    }
    const { rows } = await client.query(
      `INSERT INTO creator_member_content (creator_id,title,body)
       VALUES ($1,$2,$3) RETURNING id,title,body,status,created_at`,
      [req.user.id, title.trim(), body]
    );
    return rows[0];
  });
  res.status(201).json({ content });
}));

creatorRoutes.get('/me/content', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT id,title,body,status,created_at,published_at
     FROM creator_member_content WHERE creator_id=$1
     ORDER BY created_at DESC LIMIT 100`, [req.user.id]
  );
  res.json({ content: rows });
}));

creatorRoutes.post('/me/content/:contentId/publish', auth, h(async (req, res) => {
  if (!uuid(req.params.contentId)) throw bad('Conteúdo inválido');
  const { rows } = await q(
    `UPDATE creator_member_content
     SET status='published',published_at=COALESCE(published_at,now())
     WHERE id=$1 AND creator_id=$2 AND status='draft'
     RETURNING id,title,status,published_at`, [req.params.contentId,req.user.id]
  );
  if (!rows[0]) throw new HttpError(404,'Rascunho não encontrado');
  res.json({ content: rows[0] });
}));

creatorRoutes.get('/:creatorId/content', auth, h(async (req, res) => {
  if (!uuid(req.params.creatorId)) throw bad('Criador inválido');
  const { rows } = await q(
    `SELECT c.id,c.title,c.body,c.published_at
       FROM creator_member_content c
      WHERE c.creator_id=$1 AND c.status='published'
        AND (
          c.creator_id=$2
          OR (
            NOT EXISTS (
              SELECT 1 FROM blocks b WHERE
              (b.blocker_id=$1 AND b.blocked_id=$2)
              OR (b.blocker_id=$2 AND b.blocked_id=$1)
            )
            AND EXISTS (
              SELECT 1 FROM creator_memberships m
              WHERE m.creator_id=$1 AND m.subscriber_id=$2
                AND m.status='active' AND m.current_period_end>now()
                AND m.provider_subscription_id IS NOT NULL
            )
          )
        )
      ORDER BY c.published_at DESC LIMIT 50`,
    [req.params.creatorId, req.user.id]
  );
  res.json({ content: rows });
}));

// Deliberately no client-controlled membership activation, paid-content unlock,
// or payment endpoints. Only verified provider webhooks may grant entitlements.
