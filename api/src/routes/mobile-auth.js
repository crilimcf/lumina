import crypto from 'node:crypto';
import { Router } from 'express';
import { q, tx } from '../db.js';
import { env } from '../env.js';
import {
  audit,
  auth,
  bad,
  csrfOf,
  h,
  HttpError,
  recordSession,
  setSessionCookie,
  signToken,
} from '../middleware/auth.js';

export const mobileAuthRoutes = Router();

const USER_FIELDS = 'id,handle,email,name,bio,palette,avatar_url,stars,created_at,session_version,is_staff';
const hash = value => crypto.createHash('sha256').update(String(value || '')).digest('base64url');
const randomCode = () => crypto.randomBytes(32).toString('base64url');
const validB64Url = value => /^[A-Za-z0-9_-]{43,128}$/.test(String(value || ''));
const canonicalAppUrl = () => {
  const configured = String(env.CORS_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean);
  for (const candidate of [...configured, env.APP_URL, 'https://lumina-snowy-ten.vercel.app']) {
    try {
      const url = new URL(candidate);
      if (env.NODE_ENV !== 'production' || url.protocol === 'https:') return url.origin;
    } catch {}
  }
  return 'https://lumina-snowy-ten.vercel.app';
};

async function activeUser(userId, query = q) {
  const { rows } = await query(`SELECT ${USER_FIELDS} FROM users WHERE id=$1 AND suspended_at IS NULL`, [userId]);
  return rows[0] || null;
}

async function issueSession(user, req, res, action) {
  const token = signToken(user);
  await recordSession(user.id, token, req);
  setSessionCookie(res, token);
  audit(user.id, action, user.id);
  return { token, csrf:csrfOf(token), user };
}

mobileAuthRoutes.post('/start', h(async (req, res) => {
  const codeChallenge = String(req.body?.codeChallenge || '');
  if (!validB64Url(codeChallenge)) throw bad('Pedido móvel inválido', 'bad_mobile_challenge');
  await q('DELETE FROM mobile_auth_handoffs WHERE expires_at < now() OR exchanged_at IS NOT NULL');
  const { rows } = await q(
    `INSERT INTO mobile_auth_handoffs (code_challenge)
     VALUES ($1) RETURNING id,expires_at`,
    [codeChallenge]
  );
  const login = new URL(canonicalAppUrl());
  login.searchParams.set('mobileAuth', rows[0].id);
  res.status(201).json({ id:rows[0].id, expiresAt:rows[0].expires_at, loginUrl:login.toString() });
}));

mobileAuthRoutes.post('/:handoffId/complete', auth, h(async (req, res) => {
  const code = randomCode();
  const { rows } = await q(
    `UPDATE mobile_auth_handoffs
        SET user_id=$2,exchange_code_hash=$3,completed_at=now()
      WHERE id=$1 AND expires_at>now() AND completed_at IS NULL AND exchanged_at IS NULL
      RETURNING id`,
    [req.params.handoffId, req.user.id, hash(code)]
  );
  if (!rows[0]) throw new HttpError(404, 'Pedido móvel expirado', 'mobile_handoff_expired');
  const redirect = new URL('lumina://auth');
  redirect.searchParams.set('handoff', rows[0].id);
  redirect.searchParams.set('code', code);
  res.json({ redirectUrl:redirect.toString() });
}));

mobileAuthRoutes.post('/exchange', h(async (req, res) => {
  const id = String(req.body?.handoff || '');
  const code = String(req.body?.code || '');
  const verifier = String(req.body?.verifier || '');
  if (!id || !validB64Url(code) || !validB64Url(verifier)) throw bad('Troca móvel inválida', 'bad_mobile_exchange');

  const userId = await tx(async c => {
    const { rows } = await c.query(
      `SELECT user_id,code_challenge,exchange_code_hash
       FROM mobile_auth_handoffs
       WHERE id=$1 AND expires_at>now() AND completed_at IS NOT NULL AND exchanged_at IS NULL
       FOR UPDATE`,
      [id]
    );
    const handoff = rows[0];
    if (!handoff || hash(code) !== handoff.exchange_code_hash || hash(verifier) !== handoff.code_challenge) {
      throw new HttpError(401, 'Código móvel inválido ou expirado', 'mobile_exchange_invalid');
    }
    await c.query('UPDATE mobile_auth_handoffs SET exchanged_at=now() WHERE id=$1', [id]);
    return handoff.user_id;
  });

  const user = await activeUser(userId);
  if (!user) throw new HttpError(401, 'Conta indisponível');
  res.json(await issueSession(user, req, res, 'auth:mobile-passkey-login'));
}));

mobileAuthRoutes.post('/browser-session', auth, h(async (req, res) => {
  const code = randomCode();
  await q('DELETE FROM mobile_browser_sessions WHERE expires_at < now() OR used_at IS NOT NULL');
  await q(
    `INSERT INTO mobile_browser_sessions (user_id,code_hash) VALUES ($1,$2)`,
    [req.user.id, hash(code)]
  );
  const url = new URL(canonicalAppUrl());
  url.searchParams.set('security', '1');
  url.hash = new URLSearchParams({ nativeSession:code }).toString();
  res.status(201).json({ url:url.toString() });
}));

mobileAuthRoutes.post('/browser-exchange', h(async (req, res) => {
  const code = String(req.body?.code || '');
  if (!validB64Url(code)) throw bad('Sessão móvel inválida', 'bad_browser_session');
  const userId = await tx(async c => {
    const { rows } = await c.query(
      `SELECT id,user_id FROM mobile_browser_sessions
       WHERE code_hash=$1 AND expires_at>now() AND used_at IS NULL FOR UPDATE`,
      [hash(code)]
    );
    if (!rows[0]) throw new HttpError(401, 'Sessão móvel inválida ou expirada', 'browser_session_expired');
    await c.query('UPDATE mobile_browser_sessions SET used_at=now() WHERE id=$1', [rows[0].id]);
    return rows[0].user_id;
  });
  const user = await activeUser(userId);
  if (!user) throw new HttpError(401, 'Conta indisponível');
  res.json(await issueSession(user, req, res, 'auth:mobile-browser-session'));
}));
