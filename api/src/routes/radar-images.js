import { Router } from 'express';
import { q } from '../db.js';
import { auth, h, HttpError, notFound } from '../middleware/auth.js';
import { pipePublicImage } from '../lib/publicImage.js';

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

  try {
    await pipePublicImage(item.image_url, res, {
      referer: item.external_url,
      onHeaders: ({ contentType, etag, lastModified }) => {
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'private, max-age=900, stale-while-revalidate=3600');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (etag) res.setHeader('ETag', etag);
        if (lastModified) res.setHeader('Last-Modified', lastModified);
      },
    });
  } catch {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    throw new HttpError(502, 'Imagem Radar indisponível', 'radar_image_unavailable');
  }
}));
