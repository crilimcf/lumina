import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './env.js';
import { pool } from './db.js';
import { errorHandler, auth, h, HttpError } from './middleware/auth.js';
import { startJobs } from './jobs/daily.js';

import { authRoutes } from './routes/auth.js';
import { communityRoutes } from './routes/communities.js';
import { inviteRoutes } from './routes/invites.js';
import { postRoutes } from './routes/posts.js';
import { messageRoutes } from './routes/messages.js';
import { reportRoutes } from './routes/reports.js';
import { accountRoutes } from './routes/account.js';
import { uploadRoutes } from './routes/uploads.js';
import { userRoutes } from './routes/users.js';
import { twoFactorRoutes, sessionRoutes } from './routes/twofactor.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
// Em producao so aceitamos as origens listadas. O fallback permissivo do
// desenvolvimento nunca deve chegar a um servidor publico.
const origins = env.CORS_ORIGIN?.split(',').map(s => s.trim()).filter(Boolean);
if (env.NODE_ENV === 'production' && !origins?.length) {
  throw new Error('Em producao e obrigatorio definir CORS_ORIGIN');
}
app.use(cors({ origin: origins?.length ? origins : true, maxAge: 86400 }));
app.use(express.json({ limit: '256kb' }));

app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));
// Autenticação apanha mais força bruta do que qualquer outra rota.
app.use('/auth/login', rateLimit({
  windowMs: 15 * 60_000, limit: 10,
  // Por IP e por email: um atacante com muitos IPs nao fica com caminho livre
  // para a mesma conta.
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email || '').toLowerCase()}`,
}));
app.use('/auth/register', rateLimit({ windowMs: 60 * 60_000, limit: 5 }));
app.use('/account/forgot-password', rateLimit({ windowMs: 60 * 60_000, limit: 5 }));

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.use('/auth', authRoutes);
app.use('/communities', communityRoutes);
app.use('/invites', inviteRoutes);
app.use('/posts', postRoutes);
app.use('/messages', messageRoutes);
app.use('/reports', reportRoutes);
app.use('/account', accountRoutes);
app.use('/uploads', uploadRoutes);
app.use('/users', userRoutes);
app.use('/2fa', twoFactorRoutes);
app.use('/sessions', sessionRoutes);

/**
 * Subscrições de criadores. Fica atrás de flag até haver comunidade que as
 * justifique — mexer em dinheiro traz obrigações que não valem a pena antes
 * de haver quem pague.
 */
app.use('/subscriptions', auth, h(async () => {
  if (!env.FEATURE_SUBSCRIPTIONS) {
    throw new HttpError(403, 'Ainda não disponível', 'feature_off');
  }
  throw new HttpError(501, 'Por implementar');
}));

app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  // Migra antes de aceitar pedidos: um deploy novo poe-se em dia sozinho.
  const { migrate } = await import('./db.js');
  await migrate();

  const server = app.listen(env.PORT, '0.0.0.0', () => {
    console.log(`Lumina API na porta ${env.PORT}`);
    startJobs();
  });

  // Railway e Render enviam SIGTERM antes de trocar de instancia.
  const shutdown = () => {
    console.log('[servidor] a fechar');
    server.close(() => pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

export default app;
