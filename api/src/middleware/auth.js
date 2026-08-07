import jwt from 'jsonwebtoken';
import { env } from '../env.js';
import { q } from '../db.js';

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

/**
 * O token carrega a versao da sessao. Quando a password muda, a versao sobe
 * na base e todos os tokens emitidos antes deixam de servir.
 */
export function signToken(user) {
  return jwt.sign(
    { sub: user.id, handle: user.handle, v: user.session_version ?? 1 },
    env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

export async function auth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    // So o cabecalho. Um token na query string fica em logs de acesso,
    // proxies e no Referer de qualquer link de saida — o download de dados
    // usa fetch() com o cabecalho, por isso este fallback nunca e preciso.
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new HttpError(401, 'Sessao em falta');

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET);
    } catch {
      throw new HttpError(401, 'Sessao invalida');
    }

    const { rows } = await q(
      `SELECT id, handle, email, name, is_staff, suspended_at, created_at, session_version
       FROM users WHERE id = $1`,
      [payload.sub]
    );
    if (!rows[0]) throw new HttpError(401, 'Sessao invalida');
    if (rows[0].suspended_at) throw new HttpError(403, 'Conta suspensa');

    // Password trocada depois de este token ser emitido: fecha a sessao.
    if ((payload.v ?? 1) !== rows[0].session_version) {
      throw new HttpError(401, 'A sessao expirou. Entra outra vez.', 'session_revoked');
    }

    req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

/** Exige que o utilizador seja membro da comunidade. Poe req.membership. */
export function requireMember(paramName = 'communityId') {
  return async (req, _res, next) => {
    try {
      const communityId = req.params[paramName] || req.body[paramName];
      if (!communityId) throw bad('Comunidade em falta');
      const { rows } = await q(
        'SELECT role FROM memberships WHERE community_id = $1 AND user_id = $2',
        [communityId, req.user.id]
      );
      if (!rows[0]) throw forbidden('So membros desta comunidade podem fazer isto');
      req.membership = { communityId, role: rows[0].role };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Exige que o utilizador seja membro da comunidade a que o post pertence.
 * Usado para ler e escrever comentarios: sem isto, o conteudo de uma
 * comunidade fechada era legivel por qualquer pessoa com o id do post.
 */
export async function requirePostMember(req, _res, next) {
  try {
    const { rows } = await q(
      `SELECT 1 FROM posts p
       JOIN memberships m ON m.community_id = p.community_id
       WHERE p.id = $1 AND m.user_id = $2`,
      [req.params.postId, req.user.id]
    );
    if (!rows[0]) throw forbidden('So membros desta comunidade veem isto');
    next();
  } catch (err) {
    next(err);
  }
}

export function requireModerator(paramName = 'communityId') {
  return async (req, _res, next) => {
    try {
      if (req.user.is_staff) return next();
      const communityId = req.params[paramName] || req.body[paramName];
      const { rows } = await q(
        `SELECT role FROM memberships
         WHERE community_id = $1 AND user_id = $2 AND role IN ('moderator','founder')`,
        [communityId, req.user.id]
      );
      if (!rows[0]) throw forbidden('So moderadores desta comunidade');
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Regista uma acao de moderacao. Se houver queixa sobre uma decisao, e isto que responde. */
export const audit = (actorId, action, target, detail = {}) =>
  q('INSERT INTO audit_log (actor_id, action, target, detail) VALUES ($1, $2, $3, $4)',
    [actorId, action, target, detail]).catch(e => console.error('[audit]', e.message));

export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err.code === '23505') return res.status(409).json({ error: 'Ja existe', code: 'duplicate' });
  if (err.code === '23514') return res.status(400).json({ error: 'Dados invalidos', code: 'check' });
  if (err.code === '23503') return res.status(400).json({ error: 'Referencia invalida', code: 'fk' });
  console.error(err);
  res.status(500).json({ error: 'Erro interno' });
}

export const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
