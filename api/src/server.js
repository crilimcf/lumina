import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './env.js';
import { pool } from './db.js';
import { errorHandler, auth, h, HttpError, csrfGuard } from './middleware/auth.js';
import { startJobs } from './jobs/daily.js';
import { startRadarJobs } from './jobs/radar-scheduler.js';

import { authRoutes } from './routes/auth.js';
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
import { radarRoutes } from './routes/radar.js';
import { radarSyncRoutes } from './routes/radar-sync.js';

const app = express();
const webDir = path.resolve(process.cwd(), 'public');
const webIndex = path.join(webDir, 'index.html');

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'https:', 'data:', 'blob:'],
      mediaSrc: ["'self'", 'https:', 'blob:'],
      connectSrc: ["'self'", 'https://4aee2609d2471ffc4def078dcd41d9a7.r2.cloudflarestorage.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}));
const origins = env.CORS_ORIGIN?.split(',').map(s => s.trim()).filter(Boolean);
if (env.NODE_ENV === 'production' && !origins?.length) throw new Error('Em producao e obrigatorio definir CORS_ORIGIN');
app.use(cors({ origin: origins?.length ? origins : true, credentials: true, maxAge: 86400 }));
app.use(express.json({
  limit: '256kb',
  verify: (req, _res, buf) => { req.rawBody = Buffer.from(buf); },
}));
app.use(cookieParser());

const CSRF_PUBLIC_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/account/forgot-password',
  '/account/reset-password',
]);
const withoutApiPrefix = (pathname) => pathname.startsWith('/api/') ? pathname.slice(4) : pathname;
app.use((req, res, next) => {
  if (CSRF_PUBLIC_PATHS.has(withoutApiPrefix(req.path))) return next();
  return csrfGuard(req, res, next);
});

const localE2E = (() => {
  if (env.NODE_ENV !== 'development') return false;
  try {
    const url = new URL(process.env.E2E_BASE_URL || '');
    return ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch { return false; }
})();
const skipInTests = () => env.NODE_ENV === 'test' || localE2E;
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false, skip: skipInTests }));
app.use(['/auth/login', '/api/auth/login'], rateLimit({
  windowMs: 15 * 60_000, limit: 10,
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email || '').toLowerCase()}`,
  skip: skipInTests,
}));
app.use(['/auth/register', '/api/auth/register'], rateLimit({ windowMs: 60 * 60_000, limit: 5, skip: skipInTests }));
app.use(['/account/forgot-password', '/api/account/forgot-password'], rateLimit({ windowMs: 60 * 60_000, limit: 5, skip: skipInTests }));

const health = async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true }); }
  catch { res.status(503).json({ ok: false }); }
};
app.get(['/health', '/api/health'], health);

const mountApi = (prefix = '') => {
  app.use(`${prefix}/auth`, authRoutes);
  app.use(`${prefix}/posts`, postRoutes);
  app.use(`${prefix}/radar`, radarSyncRoutes);
  app.use(`${prefix}/radar`, radarRoutes);
  app.use(`${prefix}/messages`, messageRoutes);
  app.use(`${prefix}/rooms`, roomRoutes);
  app.use(`${prefix}/calls`, callRoutes);
  app.use(`${prefix}/payments`, paymentRoutes);
  app.use(`${prefix}/notifications`, notificationRoutes);
  app.use(`${prefix}/reports`, reportRoutes);
  app.use(`${prefix}/account`, accountRoutes);
  app.use(`${prefix}/uploads`, uploadRoutes);
  app.use(`${prefix}/users`, userRoutes);
  app.use(`${prefix}/2fa`, twoFactorRoutes);
  app.use(`${prefix}/sessions`, sessionRoutes);
  app.use(`${prefix}/moments`, momentRoutes);

  app.use(`${prefix}/subscriptions`, auth, h(async () => {
    if (!env.FEATURE_SUBSCRIPTIONS) throw new HttpError(403, 'Ainda não disponível', 'feature_off');
    throw new HttpError(501, 'Por implementar');
  }));
};

mountApi('');
mountApi('/api');

if (fs.existsSync(webIndex)) {
  app.use(express.static(webDir, {
    index: false,
    etag: true,
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else if (filePath.endsWith('manifest.webmanifest')) res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    },
  }));
  app.get('/', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(webIndex);
  });
}

app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  const { migrate } = await import('./db.js');
  await migrate();

  const server = app.listen(env.PORT, '0.0.0.0', () => {
    console.log(`Lumina API na porta ${env.PORT}`);
    startJobs();
    startRadarJobs();
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