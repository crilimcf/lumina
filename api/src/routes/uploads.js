import { Router } from 'express';
import crypto from 'node:crypto';
import { q } from '../db.js';
import { auth, h, bad } from '../middleware/auth.js';
import { signedUploadUrl, publicUrl, verifyStoredImage, removeObject } from '../lib/storage.js';

export const uploadRoutes = Router();

const ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Pede um URL para enviar a imagem.
 *
 * O telemovel envia o ficheiro diretamente para o armazenamento; a API nunca
 * lhe toca. Poupa largura de banda e memoria, e evita que um upload grande
 * prenda o servidor.
 */
uploadRoutes.post('/sign', auth, h(async (req, res) => {
  const { mime, bytes } = req.body;
  const ext = ALLOWED[mime];
  if (!ext) throw bad('So aceitamos JPEG, PNG ou WebP', 'bad_type');
  if (!bytes || bytes > MAX_BYTES) throw bad('A imagem tem de ter menos de 8 MB', 'too_big');

  const key = `${req.user.id}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  const url = await signedUploadUrl(key, mime);

  await q(
    'INSERT INTO uploads (owner_id, key, url, mime, bytes) VALUES ($1, $2, $3, $4, $5)',
    [req.user.id, key, publicUrl(key), mime, bytes]
  );

  res.json({ uploadUrl: url, publicUrl: publicUrl(key), key });
}));

/**
 * Confirmar o upload.
 *
 * O cliente diz que enviou uma imagem; ate aqui ninguem verificou. Lemos os
 * primeiros bytes do ficheiro guardado e comparamos com a assinatura do
 * formato. Um executavel com o nome acabado em .jpg nao passa.
 *
 * So depois de confirmado e que o URL pode ser usado num post — ver
 * assertUploadConfirmed em posts.js.
 */
uploadRoutes.post('/confirm', auth, h(async (req, res) => {
  const key = String(req.body.key || '');
  if (!key) throw bad('Falta a chave');

  const { rows } = await q(
    'SELECT * FROM uploads WHERE key = $1 AND owner_id = $2',
    [key, req.user.id]
  );
  if (!rows[0]) throw bad('Upload desconhecido', 'unknown_upload');
  if (rows[0].confirmed_at) return res.json({ url: rows[0].url, confirmed: true });

  const check = await verifyStoredImage(key, rows[0].mime);
  if (!check.ok) {
    await q('UPDATE uploads SET rejected_reason = $2 WHERE key = $1', [key, check.reason]);
    removeObject(key).catch(() => {});   // nao deixamos lixo no armazenamento
    throw bad('O ficheiro nao e uma imagem valida', 'not_an_image');
  }

  await q('UPDATE uploads SET confirmed_at = now() WHERE key = $1', [key]);
  res.json({ url: rows[0].url, confirmed: true });
}));
