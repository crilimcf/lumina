import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../env.js';
import { q } from '../db.js';

/**
 * Sessão em cookie HttpOnly em vez de só no corpo da resposta.
 *
 * O token continua também no corpo (para quem testa a API diretamente, e
 * para uma eventual app não-browser, que não tem cookies) — a mudança real
 * é que o browser deixa de precisar de o guardar em localStorage, onde uma
 * falha de XSS o conseguiria ler. Um cookie HttpOnly, não.
 *
 * `__Host-` no nome: o browser recusa aceitar este cookie sem `Secure`, sem
 * `Path=/` e com `Domain` definido — proteção extra contra o cookie ser
 * mal configurado ou "atirado" por um subdomínio.
 */
export const SESSION_COOKIE = '__Host-lumina-session';

/**
 * `SameSite=Lax`, não `None`: o frontend fala com a API através de um proxy
 * da Vercel (`/api/*` reencaminhado para a Railway), por isso o browser vê
 * tudo como a mesma origem. Cookies de terceiros com `SameSite=None`
 * pareciam funcionar em testes automatizados (Chromium), mas o Safari
 * (iOS e desktop) bloqueia-os a sério assim que a app é usada fora de um
 * ambiente de teste — a sessão nunca chegava a ficar gravada. Lax resolve
 * porque deixa de haver "terceiro": é tudo o mesmo site.
 */
const cookieBase = { secure: true, sameSite: 'lax', path: '/' };

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, { ...cookieBase, httpOnly: true, maxAge: 30 * 24 * 3600_000 });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, cookieBase);
}

/**
 * CSRF: nada de cookie legível por JS. A API e o frontend vivem em domínios
 * diferentes (Railway e Vercel) — um cookie posto pela API nunca aparece em
 * `document.cookie` do lado do frontend, por muito que o browser o envie
 * sozinho no pedido. É a política de origem a fazer o que devia: só que aqui
 * também nos tapava a nós.
 *
 * Em vez disso, o valor CSRF vai dentro do próprio token, assinado. O
 * servidor devolve-o no corpo da resposta de login/registo/etc (que só quem
 * fez o pedido consegue ler — outra vez a política de origem, desta vez a
 * favor); o frontend guarda-o em memória e repete-o num cabeçalho em todo o
 * pedido que muda estado. Um site de terceiros nunca o vê: não consegue ler
 * a resposta de um pedido que não é seu, e não consegue adivinhar um valor
 * assinado dentro de um token que também não consegue ler (o cookie de
 * sessão é HttpOnly).
 */
export const csrfOf = (token) => jwt.decode(token)?.csrf;

const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfGuard(req, _res, next) {
  if (CSRF_SAFE_METHODS.has(req.method)) return next();
  const token = req.cookies?.[SESSION_COOKIE];
  // Sem cookie de sessão: autenticação (se houver) vem do cabeçalho
  // Authorization, que um site de terceiros não consegue forjar por si só.
  if (!token) return next();
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    return next(); // token invalido: o auth() da rota da o erro certo
  }
  const header = req.headers['x-csrf-token'];
  if (!header || header !== payload.csrf) {
    return next(new HttpError(403, 'Pedido invalido (CSRF)', 'csrf'));
  }
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

/**
 * O token carrega a versao da sessao. Quando a password muda, a versao sobe
 * na base e todos os tokens emitidos antes deixam de servir.
 */
export function signToken(user) {
  return jwt.sign(
    { sub: user.id, handle: user.handle, v: user.session_version ?? 1, csrf: crypto.randomBytes(24).toString('base64url') },
    env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

const sessionTokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Guarda a impressão digital do token para a pessoa poder ver e fechar
 * sessões. Chamar isto sempre que um token novo é emitido (login, registo,
 * troca de password, "fechar tudo em todo o lado") — esquecer numa dessas
 * rotas deixa a lista de sessões (`GET /sessions`) desatualizada: mostra
 * dispositivos já invalidados como ativos, ou não mostra o dispositivo
 * atual de todo.
 */
export const recordSession = (userId, token, req) =>
  q(`INSERT INTO sessions (user_id, token_hash, user_agent, ip)
     VALUES ($1, $2, $3, $4) ON CONFLICT (token_hash) DO UPDATE SET last_seen = now(), revoked_at = NULL`,
    [userId, sessionTokenHash(token),
     String(req.headers['user-agent'] || '').slice(0, 200), req.ip]).catch(() => {});

/** Revoga uma sessão concreta sem precisar de descodificar ou guardar o JWT. */
export const revokeSessionToken = (token) => {
  if (!token) return Promise.resolve();
  return q('UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
    [sessionTokenHash(token)]).catch(() => {});
};

export async function auth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    // O cookie é o caminho normal agora. O cabeçalho fica como recurso só
    // para quem ainda tiver a versão antiga do site aberta numa aba (o
    // token antigo em localStorage continua válido até expirar) e para
    // quem fala com a API fora do browser, onde não há cookies.
    const token = req.cookies?.[SESSION_COOKIE] || (header.startsWith('Bearer ') ? header.slice(7) : null);
    if (!token) throw new HttpError(401, 'Sessao em falta');

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET);
    } catch {
      throw new HttpError(401, 'Sessao invalida');
    }

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

    // Password trocada depois de este token ser emitido: fecha a sessao.
    if ((payload.v ?? 1) !== rows[0].session_version) {
      throw new HttpError(401, 'A sessao expirou. Entra outra vez.', 'session_revoked');
    }

    // Sessões emitidas desde que passámos a registá-las podem ser fechadas
    // individualmente. Tokens legados que nunca tiveram linha em `sessions`
    // continuam válidos até expirarem, evitando um logout global na migração.
    if (rows[0].tracked_session_revoked) {
      throw new HttpError(401, 'A sessao foi fechada. Entra outra vez.', 'session_revoked');
    }
    if (rows[0].tracked_session_id) {
      await q('UPDATE sessions SET last_seen = now() WHERE id = $1', [rows[0].tracked_session_id]);
    }

    delete rows[0].tracked_session_id;
    delete rows[0].tracked_session_revoked;
    req.user = rows[0];
    req.sessionCsrf = payload.csrf;
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
  // 22P02: sintaxe invalida para o tipo da coluna — normalmente um UUID mal
  // formado (ex: a palavra "undefined" chegou a virar id de comunidade,
  // porque o frontend nao verificou se havia alguma antes de enviar).
  // Sem isto, isto caia direto no 500 generico por baixo.
  if (err.code === '22P02') return res.status(400).json({ error: 'Identificador invalido', code: 'bad_id' });
  console.error(err);
  res.status(500).json({ error: 'Erro interno' });
}

export const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
