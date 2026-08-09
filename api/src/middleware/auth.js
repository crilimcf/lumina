import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../env.js';
import { q } from '../db.js';

export const SESSION_COOKIE = '__Host-lumina-session';
const cookieBase = { secure: true, sameSite: 'lax', path: '/' };

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, { ...cookieBase, httpOnly: true, maxAge: 30 * 24 * 3600_000 });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, cookieBase);
}

export const csrfOf = (token) => jwt.decode(token)?.csrf;
const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfGuard(req, _res, next) {
  if (CSRF_SAFE_METHODS.has(req.method)) return next();
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next();
  let payload;
  try { payload = jwt.verify(token, env.JWT_SECRET); }
  catch { return next(); }
  const header = req.headers['x-csrf-token'];
  if (!header || header !== payload.csrf) return next(new HttpError(403, 'Pedido invalido (CSRF)', 'csrf'));
  next();
}

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const bad = (msg, code) => new HttpError(400, msg, code);
export const forbidden = (msg = 'Sem permissao') => new HttpError(403, msg);
export const notFound = (msg = 'Nao encontrado') => new HttpError(404, msg);

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, handle: user.handle, v: user.session_version ?? 1, csrf: crypto.randomBytes(24).toString('base64url') },
    env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

const sessionTokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');

export const recordSession = (userId, token, req) =>
  q(`INSERT INTO sessions (user_id, token_hash, user_agent, ip)
     VALUES ($1, $2, $3, $4) ON CONFLICT (token_hash) DO UPDATE SET last_seen = now(), revoked_at = NULL`,
    [userId, sessionTokenHash(token), String(req.headers['user-agent'] || '').slice(0, 200), req.ip]);

export const revokeSessionToken = (token) => {
  if (!token) return Promise.resolve();
  return q('UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [sessionTokenHash(token)]);
};

export async function auth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = req.cookies?.[SESSION_COOKIE] || (header.startsWith('Bearer ') ? header.slice(7) : null);
    if (!token) throw new HttpError(401, 'Sessao em falta');

    let payload;
    try { payload = jwt.verify(token, env.JWT_SECRET); }
    catch { throw new HttpError(401, 'Sessao invalida'); }

    const tokenHash = sessionTokenHash(token);
    const { rows } = await q(
      `SELECT u.id, u.handle, u.email, u.name, u.is_staff, u.suspended_at, u.created_at, u.session_version,
              s.id AS tracked_session_id, s.revoked_at AS tracked_session_revoked
       FROM users u
       LEFT JOIN sessions s ON s.user_id = u.id AND s.token_hash = $2
       WHERE u.id = $1`,
      [payload.sub, tokenHash]
    );
    if (!rows[0]) throw new HttpError(401, 'Sessao invalida');
    if (rows[0].suspended_at) throw new HttpError(403, 'Conta suspensa');
    if ((payload.v ?? 1) !== rows[0].session_version) throw new HttpError(401, 'A sessao expirou. Entra outra vez.', 'session_revoked');
    if (rows[0].tracked_session_revoked) throw new HttpError(401, 'A sessao foi fechada. Entra outra vez.', 'session_revoked');
    if (rows[0].tracked_session_id) await q('UPDATE sessions SET last_seen = now() WHERE id = $1', [rows[0].tracked_session_id]);

    delete rows[0].tracked_session_id;
    delete rows[0].tracked_session_revoked;
    req.user = rows[0];
    req.sessionCsrf = payload.csrf;
    next();
  } catch (err) { next(err); }
}

/**
 * Autoriza interações num post apenas quando ele está visível no grafo social:
 * o próprio autor, alguém que o segue, ou staff. Bloqueios vencem sempre.
 */
export async function requireVisiblePost(req, _res, next) {
  try {
    const { rows } = await q(
      `SELECT p.author_id
       FROM posts p
       JOIN users u ON u.id = p.author_id AND u.suspended_at IS NULL
       WHERE p.id = $1 AND p.hidden_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM blocks b
                         WHERE (b.blocker_id = $2 AND b.blocked_id = p.author_id)
                            OR (b.blocked_id = $2 AND b.blocker_id = p.author_id))
         AND ($3::boolean OR p.author_id = $2 OR EXISTS (
               SELECT 1 FROM follows f WHERE f.follower_id = $2 AND f.following_id = p.author_id
             ))`,
      [req.params.postId, req.user.id, !!req.user.is_staff]
    );
    if (!rows[0]) throw forbidden('Esta publicação não está disponível');
    next();
  } catch (err) { next(err); }
}

export const audit = (actorId, action, target, detail = {}) =>
  q('INSERT INTO audit_log (actor_id, action, target, detail) VALUES ($1, $2, $3, $4)',
    [actorId, action, target, detail]).catch(e => console.error('[audit]', e.message));

export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
  if (err.code === '23505') return res.status(409).json({ error: 'Ja existe', code: 'duplicate' });
  if (err.code === '23514') return res.status(400).json({ error: 'Dados invalidos', code: 'check' });
  if (err.code === '23503') return res.status(400).json({ error: 'Referencia invalida', code: 'fk' });
  if (err.code === '22P02') return res.status(400).json({ error: 'Identificador invalido', code: 'bad_id' });
  console.error(err);
  res.status(500).json({ error: 'Erro interno' });
}

export const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
