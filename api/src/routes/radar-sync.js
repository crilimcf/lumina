import { Router } from 'express';
import { q } from '../db.js';
import { audit, auth, bad, forbidden, h, notFound } from '../middleware/auth.js';
import { syncRadarSources } from '../jobs/radar.js';

export const radarSyncRoutes = Router();
const AUTO_RSS_TYPES = new Set(['news', 'trend', 'editorial']);

function requireStaff(req, _res, next) {
  if (!req.user?.is_staff) return next(forbidden('Apenas a equipa Lumina pode sincronizar o Radar'));
  next();
}

function assertRssType(kind, defaultType) {
  if (kind === 'rss' && !AUTO_RSS_TYPES.has(String(defaultType || 'news').toLowerCase())) {
    throw bad('RSS automático suporta notícias, tendências ou editorial', 'bad_rss_type');
  }
}

async function sourceStatus(_req, res) {
  const { rows } = await q(
    `SELECT id, name, kind, url, default_type, active, trusted, config,
            last_fetched_at, last_success_at, last_fetch_error, last_item_count,
            created_at, updated_at
     FROM radar_sources
     ORDER BY active DESC, name ASC`
  );
  res.json({ sources: rows });
}

async function syncSource(req, res) {
  const { rows } = await q('SELECT id, name, kind FROM radar_sources WHERE id=$1', [req.params.sourceId]);
  const source = rows[0];
  if (!source) throw notFound('Fonte Radar não encontrada');
  if (source.kind !== 'rss') throw forbidden('Só fontes RSS podem ser sincronizadas por este coletor');

  const result = await syncRadarSources({ sourceId: source.id });
  audit(req.user.id, 'radar_source_sync', `radar_source:${source.id}`, result);
  res.status(result.skipped ? 202 : 200).json(result);
}

// Montado antes de radarRoutes: enriquece o GET já usado pelo painel sem mudar o cliente.
radarSyncRoutes.get('/sources', auth, requireStaff, h(sourceStatus));
radarSyncRoutes.get('/sources/ingestion', auth, requireStaff, h(sourceStatus));
radarSyncRoutes.post('/sources/:sourceId/sync', auth, requireStaff, h(syncSource));

// Validação adicional do coletor antes de deixar o router principal criar a fonte.
radarSyncRoutes.post('/sources', auth, requireStaff, (req, _res, next) => {
  try {
    assertRssType(String(req.body?.kind || 'manual').toLowerCase(), req.body?.defaultType || 'news');
    next();
  } catch (error) { next(error); }
});

// Reutiliza api.radar.editSource(...). `syncNow` é intercetado; edições normais seguem para radarRoutes.
radarSyncRoutes.patch('/sources/:sourceId', auth, requireStaff, h(async (req, res, next) => {
  if (req.body?.syncNow === true) return syncSource(req, res);

  if (req.body?.kind !== undefined || req.body?.defaultType !== undefined) {
    const { rows } = await q('SELECT kind, default_type FROM radar_sources WHERE id=$1', [req.params.sourceId]);
    if (!rows[0]) throw notFound('Fonte Radar não encontrada');
    const kind = req.body.kind === undefined ? rows[0].kind : String(req.body.kind || '').toLowerCase();
    const defaultType = req.body.defaultType === undefined ? rows[0].default_type : req.body.defaultType;
    assertRssType(kind, defaultType);
  }
  next();
}));
