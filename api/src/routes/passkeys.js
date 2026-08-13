import { Router } from 'express';
import { q } from '../db.js';
import { auth, audit, csrfOf, h, HttpError, recordSession, setSessionCookie, signToken } from '../middleware/auth.js';
import { authenticationOptions, registrationOptions, verifyAuthentication, verifyRegistration } from '../lib/webauthn.js';

export const passkeyRoutes = Router();

passkeyRoutes.get('/options', h(async (_req, res) => {
  res.json(await authenticationOptions());
}));

passkeyRoutes.post('/login', h(async (req, res) => {
  const user = await verifyAuthentication(req.body?.credential);
  await q('UPDATE deletion_requests SET cancelled_at = now() WHERE user_id = $1 AND cancelled_at IS NULL', [user.id]).catch(() => {});
  const token = signToken(user);
  await recordSession(user.id, token, req);
  setSessionCookie(res, token);
  audit(user.id, 'auth:passkey-login', user.id);
  res.json({ token, csrf: csrfOf(token), user });
}));

passkeyRoutes.get('/', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT id, device_name, transports, created_at, last_used_at
     FROM passkeys WHERE user_id = $1 ORDER BY created_at DESC`, [req.user.id]
  );
  res.json(rows);
}));

passkeyRoutes.get('/register-options', auth, h(async (req, res) => {
  res.json(await registrationOptions(req.user));
}));

passkeyRoutes.post('/register', auth, h(async (req, res) => {
  const passkey = await verifyRegistration(req.user, req.body?.credential, req.body?.deviceName);
  audit(req.user.id, 'auth:passkey-added', passkey.id, { deviceName: passkey.device_name });
  res.status(201).json(passkey);
}));

passkeyRoutes.delete('/:id', auth, h(async (req, res) => {
  const { rows } = await q('DELETE FROM passkeys WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
  if (!rows[0]) throw new HttpError(404, 'Passkey não encontrada');
  audit(req.user.id, 'auth:passkey-removed', rows[0].id);
  res.status(204).end();
}));
