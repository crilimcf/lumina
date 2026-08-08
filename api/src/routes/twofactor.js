import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { q, tx } from '../db.js';
import { auth, h, bad, notFound, signToken, audit, setSessionCookie, SESSION_COOKIE, csrfOf, recordSession } from '../middleware/auth.js';
import { generateSecret, verifyTotp, otpauthUri, generateRecoveryCodes, hashCode } from '../lib/totp.js';

export const twoFactorRoutes = Router();

/**
 * Passo 1: gerar o segredo e mostrar o QR code.
 * Só fica ativo depois de a pessoa provar que consegue gerar um código —
 * senão bastava um engano para ficar trancada fora da própria conta.
 */
twoFactorRoutes.post('/setup', auth, h(async (req, res) => {
  const { rows } = await q('SELECT totp_enabled_at FROM users WHERE id = $1', [req.user.id]);
  if (rows[0].totp_enabled_at) throw bad('Já tens dois passos ativos', 'already_enabled');

  const secret = generateSecret();
  await q('UPDATE users SET totp_secret = $2 WHERE id = $1', [req.user.id, secret]);

  res.json({
    secret,
    uri: otpauthUri(secret, req.user.email),
    instructions: 'Lê o código na tua app de autenticação e confirma com um código de seis dígitos.',
  });
}));

/** Passo 2: confirmar e receber os códigos de emergência. */
twoFactorRoutes.post('/enable', auth, h(async (req, res) => {
  const { code } = req.body;
  const { rows } = await q('SELECT totp_secret, totp_enabled_at FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0].totp_secret) throw bad('Começa pelo passo de configuração', 'no_secret');
  if (rows[0].totp_enabled_at) throw bad('Já está ativo', 'already_enabled');
  if (!verifyTotp(rows[0].totp_secret, code)) throw bad('Código errado', 'bad_code');

  const codes = generateRecoveryCodes();
  await tx(async (c) => {
    await c.query('UPDATE users SET totp_enabled_at = now() WHERE id = $1', [req.user.id]);
    for (const code of codes) {
      await c.query('INSERT INTO recovery_codes (code_hash, user_id) VALUES ($1, $2)',
        [hashCode(code), req.user.id]);
    }
  });

  audit(req.user.id, '2fa:ativado', req.user.id);
  // Os códigos só aparecem aqui. Guardamos apenas o hash.
  res.json({ enabled: true, recoveryCodes: codes });
}));

/** Desligar exige a password: sem isso, um separador esquecido aberto chegava. */
twoFactorRoutes.post('/disable', auth, h(async (req, res) => {
  const { password } = req.body;
  const { rows } = await q('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!password || !await bcrypt.compare(password, rows[0].password_hash)) {
    throw bad('Password errada');
  }
  await tx(async (c) => {
    await c.query('UPDATE users SET totp_secret = NULL, totp_enabled_at = NULL WHERE id = $1', [req.user.id]);
    await c.query('DELETE FROM recovery_codes WHERE user_id = $1', [req.user.id]);
  });
  audit(req.user.id, '2fa:desativado', req.user.id);
  res.json({ enabled: false });
}));

twoFactorRoutes.get('/status', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT totp_enabled_at,
       (SELECT count(*) FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL)::int AS codes_left
     FROM users WHERE id = $1`,
    [req.user.id]
  );
  res.json({ enabled: !!rows[0].totp_enabled_at, codesLeft: rows[0].codes_left });
}));

/* ─────────────────────────── sessões */

export const sessionRoutes = Router();

sessionRoutes.get('/', auth, h(async (req, res) => {
  const header = req.headers.authorization || '';
  const rawToken = req.cookies?.[SESSION_COOKIE] || (header.startsWith('Bearer ') ? header.slice(7) : '');
  const current = crypto.createHash('sha256').update(rawToken).digest('hex');
  const { rows } = await q(
    `SELECT id, user_agent, ip, last_seen, created_at, token_hash = $2 AS current
     FROM sessions WHERE user_id = $1 AND revoked_at IS NULL
     ORDER BY last_seen DESC LIMIT 30`,
    [req.user.id, current]
  );
  res.json(rows.map(({ token_hash, ...r }) => r));
}));

sessionRoutes.delete('/:id', auth, h(async (req, res) => {
  const { rowCount } = await q(
    'UPDATE sessions SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL',
    [req.params.id, req.user.id]
  );
  if (!rowCount) throw notFound('Sessão não encontrada');
  res.json({ revoked: true });
}));

/** Fechar tudo em todo o lado. Sobe a versão e invalida todos os tokens. */
sessionRoutes.post('/revoke-all', auth, h(async (req, res) => {
  const { rows } = await q(
    `UPDATE users SET session_version = session_version + 1 WHERE id = $1
     RETURNING id, handle, session_version`,
    [req.user.id]
  );
  await q('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [req.user.id]);
  audit(req.user.id, 'sessoes:todas-fechadas', req.user.id);
  // Token novo para quem pediu não ficar de fora — e regista-o antes de
  // responder para Segurança o mostrar imediatamente como sessão atual.
  const token = signToken(rows[0]);
  await recordSession(rows[0].id, token, req);
  setSessionCookie(res, token);
  res.json({ token, csrf: csrfOf(token) });
}));
