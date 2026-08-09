import { Router } from 'express';
import { q } from '../db.js';
import { audit, auth, forbidden, h, notFound } from '../middleware/auth.js';
import { syncRadarSources } from '../jobs/radar.js';

export const radarSyncRoutes = Router();

function requireStaff(req, _res, next) {
  if (!req.user?.is_staff) return next(forbidden('Apenas a equipa Lumina pode sincronizar o Radar'));
  next();
}

radarSyncRoutes.get('/sources/ingestion', auth, requireStaff, h(async (_req, res) => {
  const { rows } = await q(
    `SELECT id, name, kind, url, default_type, active, trusted, config,
            last_fetched_at, last_success_at, last_fetch_error, last_item_count,
            created_at, updated_at
     FROM radar_sources
     ORDER BY active DESC, name ASC`
  );
  res.json({ sources: rows });
}));

radarSyncRoutes.post('/sources/:sourceId/sync', auth, requireStaff, h(async (req, res) => {
  const { rows } = await q('SELECT id, name, kind FROM radar_sources WHERE id=$1', [req.params.sourceId]);
  const source = rows[0];
  if (!source) throw notFound('Fonte Radar não encontrada');
  if (source.kind !== 'rss') throw forbidden('Só fontes RSS podem ser sincronizadas por este coletor');

  const result = await syncRadarSources({ sourceId: source.id });
  audit(req.user.id, 'radar_source_sync', `radar_source:${source.id}`, result);
  res.status(result.skipped ? 202 : 200).json(result);
}));
