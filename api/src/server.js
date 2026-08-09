import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './env.js';
import { pool } from './db.js';
import { errorHandler, auth, h, HttpError, csrfGuard } from './middleware/auth.js';
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
import { momentRoutes } from './routes/moments.js';
import { roomRoutes } from './routes/rooms.js';
import { callRoutes } from './routes/calls.js';
import { paymentRoutes } from './routes/payments.js';
import { notificationRoutes } from './routes/notifications.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
const origins = env.CORS_ORIGIN?.split(',').map(s => s.trim()).filter(Boolean);
if (env.NODE_ENV === 'production' && !origins?.length) {
  throw new Error('Em producao e obrigatorio definir CORS_ORIGIN');
}
app.use(cors({ origin: origins?.length ? origins : true, credentials: true, maxAge: 86400 }));
// Guardamos os bytes exatos para validar webhooks Stripe sem enfraquecer o
// parser JSON usado no resto da API.
app.use(express.json({
  limit: '256kb',
  verify: (req, _res, buf) => { req.rawBody = Buffer.from(buf); },
}));
app.use(cookieParser());

/**
 * Estas rotas criam/recuperam a sessão e não autorizam nenhuma ação com o
 * cookie que já possa existir no browser. Exigir o CSRF da sessão anterior
 * aqui cria um deadlock: um cookie válido mas já revogado/expirado bloqueia o
 * próprio login antes de este poder substituí-lo.
 *
 * Continuam protegidas contra pedidos cross-site pelo contrato JSON + CORS:
 * um formulário HTML de terceiro não produz application/json e um fetch JSON
 * cross-origin precisa de preflight aprovado. Todas as rotas autenticadas e
 * o logout continuam a passar pelo csrfGuard normal.
 */
const CSRF_PUBLIC_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/account/forgot-password',
  '/account/reset-password',
]);
app.use((req, res, next) => {
  if (CSRF_PUBLIC_PATHS.has(req.path)) return next();
  return csrfGuard(req, res, next);
});

const localE2E = (() => {
  if (env.NODE_ENV !== 'development') return false;
  try {
    const url = new URL(process.env.E2E_BASE_URL || '');
    return ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
})();
const skipInTests = () => env.NODE_ENV === 'test' || localE2E;
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false, skip: skipInTests }));
app.use('/auth/login', rateLimit({
  windowMs: 15 * 60_000, limit: 10,
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email || '').toLowerCase()}`,
  skip: skipInTests,
}));
app.use('/auth/register', rateLimit({ windowMs: 60 * 60_000, limit: 5, skip: skipInTests }));
app.use('/account/forgot-password', rateLimit({ windowMs: 60 * 60_000, limit: 5, skip: skipInTests }));

app.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true }); }
  catch { res.status(503).json({ ok: false }); }
});

app.use('/auth', authRoutes);
app.use('/communities', communityRoutes);
app.use('/invites', inviteRoutes); // legado: deixa de ser uma aba principal no cliente
app.use('/posts', postRoutes);
app.use('/messages', messageRoutes);
app.use('/rooms', roomRoutes);
app.use('/calls', callRoutes);
app.use('/payments', paymentRoutes);
app.use('/notifications', notificationRoutes);
app.use('/reports', reportRoutes);
app.use('/account', accountRoutes);
app.use('/uploads', uploadRoutes);
app.use('/users', userRoutes);
app.use('/2fa', twoFactorRoutes);
app.use('/sessions', sessionRoutes);
app.use('/moments', momentRoutes);

app.use('/subscriptions', auth, h(async () => {
  if (!env.FEATURE_SUBSCRIPTIONS) throw new HttpError(403, 'Ainda não disponível', 'feature_off');
  throw new HttpError(501, 'Por implementar');
}));

app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  const { migrate } = await import('./db.js');
  await migrate();
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    console.log(`Lumina API na porta ${env.PORT}`);
    startJobs();
  });
  const shutdown = () => {
    console.log('[servidor] a fechar');
    server.close(() => pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

export default app;