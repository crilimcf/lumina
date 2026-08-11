import { Router } from 'express';
import { auth, forbidden, h } from '../middleware/auth.js';
import { q } from '../db.js';

export const telemetryRoutes = Router();

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

const ALLOWED_KINDS = new Set(['react_boundary', 'window_error', 'unhandled_rejection']);

telemetryRoutes.post('/errors', auth, h(async (req, res) => {
  const kind = ALLOWED_KINDS.has(req.body?.kind) ? req.body.kind : 'window_error';
  const message = clip(req.body?.message, 800);
  if (!message) return res.status(400).json({ error: 'Erro sem mensagem', code: 'bad_error_event' });

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

telemetryRoutes.get('/errors', auth, h(async (req, res) => {
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
