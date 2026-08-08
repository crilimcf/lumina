import { Router } from 'express';
import crypto from 'node:crypto';
import { q } from '../db.js';
import { auth, h, bad } from '../middleware/auth.js';
import { signedUploadUrl, publicUrl, verifyStoredMedia, removeObject, maxUploadBytes } from '../lib/storage.js';

export const uploadRoutes = Router();

const ALLOWED = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

uploadRoutes.post('/sign', auth, h(async (req, res) => {
  const { mime } = req.body;
  const bytes = Number(req.body.bytes);
  const ext = ALLOWED[mime];
  if (!ext) throw bad('Aceitamos JPEG, PNG, WebP, MP4, MOV ou WebM', 'bad_type');

  const maxBytes = maxUploadBytes(mime);
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > maxBytes) {
    const maxMb = Math.round(maxBytes / 1024 / 1024);
    throw bad(`O ficheiro tem de ter menos de ${maxMb} MB`, 'too_big');
  }

  const key = `${req.user.id}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  const url = await signedUploadUrl(key, mime);

  await q(
    'INSERT INTO uploads (owner_id, key, url, mime, bytes) VALUES ($1, $2, $3, $4, $5)',
    [req.user.id, key, publicUrl(key), mime, bytes]
  );

  res.json({ uploadUrl: url, publicUrl: publicUrl(key), key });
}));

uploadRoutes.post('/confirm', auth, h(async (req, res) => {
  const key = String(req.body.key || '');
  if (!key) throw bad('Falta a chave');

  const { rows } = await q(
    'SELECT * FROM uploads WHERE key = $1 AND owner_id = $2',
    [key, req.user.id]
  );
  if (!rows[0]) throw bad('Upload desconhecido', 'unknown_upload');
  if (rows[0].confirmed_at) return res.json({ url: rows[0].url, confirmed: true });

  const check = await verifyStoredMedia(key, rows[0].mime, rows[0].bytes);
  if (!check.ok) {
    await q('UPDATE uploads SET rejected_reason = $2 WHERE key = $1', [key, check.reason]);
    removeObject(key).catch(() => {});
    throw bad('O ficheiro enviado não é válido', 'invalid_media');
  }

  await q('UPDATE uploads SET confirmed_at = now() WHERE key = $1', [key]);
  res.json({ url: rows[0].url, confirmed: true });
}));
