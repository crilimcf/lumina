import { Router } from 'express';
import { q } from '../db.js';
import { auth, h, bad } from '../middleware/auth.js';

export const nativePushRoutes = Router();

const normalizePlatform = value => {
  const platform = String(value || '').trim().toLowerCase();
  if (!['ios', 'android'].includes(platform)) throw bad('Plataforma push inválida', 'bad_push_platform');
  return platform;
};

const normalizeToken = value => {
  const token = String(value || '').trim();
  if (token.length < 16 || token.length > 4096) throw bad('Token push inválido', 'bad_push_token');
  return token;
};

const normalizeLocale = value => {
  const locale = String(value || '').trim().slice(0, 32);
  return locale || null;
};

nativePushRoutes.get('/status', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT platform, count(*)::int AS devices
       FROM native_push_tokens
      WHERE user_id=$1
      GROUP BY platform
      ORDER BY platform`,
    [req.user.id]
  );
  res.json({ subscribed:rows.length > 0, platforms:rows });
}));

nativePushRoutes.post('/subscribe', auth, h(async (req, res) => {
  const platform = normalizePlatform(req.body?.platform);
  const token = normalizeToken(req.body?.token);
  const deviceId = String(req.body?.deviceId || '').trim().slice(0, 200) || null;
  const locale = normalizeLocale(req.body?.locale);

  await q(
    `INSERT INTO native_push_tokens (token,user_id,platform,device_id,locale)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (token) DO UPDATE
       SET user_id=EXCLUDED.user_id,
           platform=EXCLUDED.platform,
           device_id=EXCLUDED.device_id,
           locale=EXCLUDED.locale,
           updated_at=now()`,
    [token, req.user.id, platform, deviceId, locale]
  );
  res.status(201).json({ subscribed:true, platform });
}));

nativePushRoutes.post('/unsubscribe', auth, h(async (req, res) => {
  const token = normalizeToken(req.body?.token);
  await q('DELETE FROM native_push_tokens WHERE token=$1 AND user_id=$2', [token, req.user.id]);
  res.json({ subscribed:false });
}));
