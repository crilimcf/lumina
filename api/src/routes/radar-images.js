import { Router } from 'express';
import { q } from '../db.js';
import { auth, h, HttpError, notFound } from '../middleware/auth.js';
import { fetchPublicImage } from '../lib/publicImage.js';

export const radarImageRoutes = Router();

radarImageRoutes.get('/:itemId', auth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT image_url, external_url
     FROM radar_items
     WHERE id=$1
       AND status='published'
       AND published_at<=now()
       AND (ends_at IS NULL OR ends_at>now())
     LIMIT 1`,
    [req.params.itemId]
  );
  const item = rows[0];
  if (!item?.image_url) throw notFound('Imagem Radar não encontrada');

  let image;
  try {
    image = await fetchPublicImage(item.image_url, { referer:item.external_url });
  } catch {
    throw new HttpError(502, 'Imagem Radar indisponível', 'radar_image_unavailable');
  }

  res.setHeader('Content-Type', image.contentType);
  res.setHeader('Cache-Control', 'private, max-age=900, stale-while-revalidate=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (image.etag) res.setHeader('ETag', image.etag);
  if (image.lastModified) res.setHeader('Last-Modified', image.lastModified);
  res.send(image.buffer);
}));
