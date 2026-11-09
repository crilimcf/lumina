import { Router } from 'express';
import { q } from '../db.js';
import { env } from '../env.js';
import { auth, h, bad, HttpError } from '../middleware/auth.js';

export const creatorRoutes = Router();

creatorRoutes.use((_req, _res, next) => {
  if (!env.FEATURE_SUBSCRIPTIONS) return next(new HttpError(404, 'Funcionalidade indisponível', 'feature_off'));
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

// Deliberately no client-controlled membership activation, paid-content unlock,
// or payment endpoints. Only verified provider webhooks may grant entitlements.
