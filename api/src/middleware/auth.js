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
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
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
  return q('UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
    [sessionTokenHash(token)]);
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

/** Compatibilidade apenas para funcionalidades legadas de comunidade. */
export function requireMember(paramName = 'communityId') {
  return async (req, _res, next) => {
    try {
      const communityId = req.params[paramName] || req.body[paramName];
      if (!communityId) throw bad('Comunidade em falta');
      const { rows } = await q(
        `SELECT m.role FROM memberships m JOIN communities c ON c.id=m.community_id
         WHERE m.community_id=$1 AND m.user_id=$2 AND COALESCE(c.is_system,false)=false`,
        [communityId, req.user.id]
      );
      if (!rows[0]) throw forbidden('Sem acesso a este espaço');
      req.membership = { communityId, role: rows[0].role };
      next();
    } catch (err) { next(err); }
  };
}

/**
 * Posts do Feed técnico obedecem à privacidade da pessoa: o próprio autor,
 * qualquer pessoa num perfil público, ou seguidores aceites num perfil privado.
 * Posts legados continuam limitados aos membros da comunidade antiga.
 */
export async function requirePostMember(req, _res, next) {
  try {
    const { rows } = await q(
      `SELECT 1
       FROM posts p
       JOIN communities c ON c.id=p.community_id
       JOIN users author ON author.id=p.author_id
       WHERE p.id=$1 AND p.hidden_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM blocks b
                         WHERE (b.blocker_id=$2 AND b.blocked_id=p.author_id)
                            OR (b.blocked_id=$2 AND b.blocker_id=p.author_id))
         AND (
           (COALESCE(c.is_system,false)=false AND EXISTS (
              SELECT 1 FROM memberships m WHERE m.community_id=p.community_id AND m.user_id=$2
           ))
           OR
           (c.is_system=true AND (
              p.author_id=$2 OR author.is_private=false OR EXISTS (
                SELECT 1 FROM follows f WHERE f.follower_id=$2 AND f.following_id=p.author_id
              )
           ))
         )`,
      [req.params.postId, req.user.id]
    );
    if (!rows[0]) throw forbidden('Não tens acesso a esta publicação');
    next();
  } catch (err) { next(err); }
}

export function requireModerator(paramName = 'communityId') {
  return async (req, _res, next) => {
    try {
      if (req.user.is_staff) return next();
      const communityId = req.params[paramName] || req.body[paramName];
      const { rows } = await q(
        `SELECT m.role FROM memberships m JOIN communities c ON c.id=m.community_id
         WHERE m.community_id=$1 AND m.user_id=$2 AND m.role IN ('moderator','founder')
           AND COALESCE(c.is_system,false)=false`,
        [communityId, req.user.id]
      );
      if (!rows[0]) throw forbidden('So moderadores deste espaço');
      next();
    } catch (err) { next(err); }
  };
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
