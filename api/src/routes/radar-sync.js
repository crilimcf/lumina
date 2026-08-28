import { Router } from 'express';
import { q } from '../db.js';
import { audit, auth, bad, forbidden, h, notFound } from '../middleware/auth.js';
import { syncRadarSources } from '../jobs/radar.js';
import { syncWebRadarSources } from '../jobs/radar-web.js';
import { loadNearbyNews } from '../lib/nearby-news.js';

export const radarSyncRoutes = Router();
const AUTO_RSS_TYPES = new Set(['news', 'trend', 'editorial']);
const RADAR_TYPES = new Set(['news', 'promotion', 'event', 'trend', 'editorial']);
const EXPLICIT_SCOPES = new Set(['nearby', 'country', 'global']);
const LEGACY_COUNTRY_REGIONS = Object.freeze({ pt:'portugal', fr:'france' });

function requireStaff(req, _res, next) {
  if (!req.user?.is_staff) return next(forbidden('Apenas a equipa Lumina pode sincronizar o Radar'));
  next();
}

function assertRssType(kind, defaultType, config = null) {
  if (kind === 'rss' && !AUTO_RSS_TYPES.has(String(defaultType || 'news').toLowerCase())) {
    throw bad('RSS automático suporta notícias, tendências ou editorial', 'bad_rss_type');
  }
  if (kind === 'partner' && config?.adapter === 'headline-links' && String(defaultType || 'news').toLowerCase() !== 'news') {
    throw bad('Publishers verificados suportam manchetes de notícias', 'bad_partner_type');
  }
}

function cleanCountry(value) {
  const code = String(value || '').trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(code)) throw bad('País inválido', 'bad_country');
  return code;
}

function cleanRadarType(value) {
  const type = String(value || '').trim().toLowerCase();
  if (!RADAR_TYPES.has(type)) throw bad('Tipo de Radar inválido', 'bad_radar_type');
  return type;
}

function optionalDate(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw bad(`${field} inválido`, 'bad_date');
  return date.toISOString();
}

function cleanRegion(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value).trim().slice(0, 80) || null;
}

function dedupeByUrl(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = String(item?.external_url || item?.id || '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// The product exposes three explicit news scopes:
// nearby = strict city/region match, country = whole current country, global = international.
// Nearby deliberately never falls back to national content.
radarSyncRoutes.get('/', auth, h(async (req, res, next) => {
  const scope = String(req.query.scope || '').trim().toLowerCase();
  if (!EXPLICIT_SCOPES.has(scope)) return next();

  const country = scope === 'global' ? null : cleanCountry(req.query.country);
  const countryTag = country ? `country:${country}` : null;
  const region = cleanRegion(req.query.region);
  if (scope === 'nearby' && !region) throw bad('Radar perto de mim precisa da cidade/região atual', 'missing_radar_region');

  const requestedType = req.query.type ? cleanRadarType(req.query.type) : null;
  const before = optionalDate(req.query.before, 'Cursor');
  const regionNeedle = region ? `%${region}%` : null;
  const asked = Number(req.query.limit);
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, 50) : 20;

  const { rows } = await q(
    `WITH candidates AS (
       SELECT ri.id, ri.type, ri.title, ri.summary, ri.body, ri.image_url, ri.external_url,
              COALESCE(ri.source_name, rs.name) AS source_name,
              COALESCE(ri.source_url, rs.url) AS source_url,
              ri.sponsored, ri.sponsor_label, ri.tags, ri.region,
              ri.starts_at, ri.ends_at, ri.published_at, ri.priority,
              row_number() OVER (
                PARTITION BY COALESCE(ri.source_name, rs.name, 'Radar')
                ORDER BY ri.priority DESC, ri.published_at DESC, ri.id DESC
              ) AS publisher_rank
       FROM radar_items ri
       LEFT JOIN radar_sources rs ON rs.id = ri.source_id
       WHERE ri.status = 'published'
         AND ri.published_at <= now()
         AND (
           (ri.type = 'promotion'
             AND (ri.starts_at IS NULL OR ri.starts_at <= now())
             AND (ri.ends_at IS NULL OR ri.ends_at > now()))
           OR
           (ri.type = 'event'
             AND COALESCE(ri.ends_at, ri.starts_at + interval '12 hours') > now())
           OR
           (ri.type NOT IN ('promotion','event')
             AND (ri.ends_at IS NULL OR ri.ends_at > now()))
         )
         AND ($1::text IS NULL OR ri.type = $1)
         AND ($2::timestamptz IS NULL OR ri.published_at < $2)
         AND (
           ($5::text = 'global' AND 'country:global' = ANY(COALESCE(ri.tags, ARRAY[]::text[])))
           OR ($5::text = 'country' AND $3::text = ANY(COALESCE(ri.tags, ARRAY[]::text[])))
           OR ($5::text = 'nearby'
             AND $3::text = ANY(COALESCE(ri.tags, ARRAY[]::text[]))
             AND $4::text IS NOT NULL
             AND (
               COALESCE(ri.region, '') ILIKE $4
               OR EXISTS (
                 SELECT 1 FROM unnest(COALESCE(ri.tags, ARRAY[]::text[])) tag
                 WHERE tag ILIKE $4
               )
             )
           )
         )
     )
     SELECT id, type, title, summary, body, image_url, external_url,
            source_name, source_url, sponsored, sponsor_label, tags, region,
            starts_at, ends_at, published_at, priority
     FROM candidates
     ORDER BY
       CASE WHEN $5::text = 'global' THEN publisher_rank ELSE 0 END ASC,
       priority DESC, published_at DESC, id DESC
     LIMIT $6`,
    [requestedType, before, countryTag, regionNeedle, scope, limit]
  );

  let items = rows;
  if (scope === 'nearby' && !before && (!requestedType || requestedType === 'news') && rows.length < limit) {
    try {
      const live = await loadNearbyNews({ country, region, limit:limit - rows.length });
      items = dedupeByUrl([...rows, ...live]).slice(0, limit);
    } catch (error) {
      console.warn(`[radar] notícias próximas de ${region} indisponíveis:`, error.message);
    }
  }

  res.json({
    items,
    // Global is deliberately interleaved by publisher. A timestamp-only cursor cannot
    // represent that ordering safely, so do not advertise pagination for this scope.
    nextCursor: scope === 'global' ? null : (rows.length === limit ? rows.at(-1).published_at : null),
    country: country ? country.toUpperCase() : null,
    region,
    scope,
  });
}));

// Country-aware compatibility path for older clients without an explicit scope.
radarSyncRoutes.get('/', auth, h(async (req, res, next) => {
  if (req.query.scope !== undefined && req.query.scope !== null && req.query.scope !== '') return next();
  if (req.query.country === undefined || req.query.country === null || req.query.country === '') return next();

  const country = cleanCountry(req.query.country);
  const countryTag = `country:${country}`;
  const countryRegion = LEGACY_COUNTRY_REGIONS[country] || null;
  const requestedType = req.query.type ? cleanRadarType(req.query.type) : null;
  const before = optionalDate(req.query.before, 'Cursor');
  const region = cleanRegion(req.query.region);
  const regionNeedle = region ? `%${region}%` : null;
  const asked = Number(req.query.limit);
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, 50) : 20;

  const { rows } = await q(
    `SELECT ri.id, ri.type, ri.title, ri.summary, ri.body, ri.image_url, ri.external_url,
            COALESCE(ri.source_name, rs.name) AS source_name,
            COALESCE(ri.source_url, rs.url) AS source_url,
            ri.sponsored, ri.sponsor_label, ri.tags, ri.region,
            ri.starts_at, ri.ends_at, ri.published_at, ri.priority
     FROM radar_items ri
     LEFT JOIN radar_sources rs ON rs.id = ri.source_id
     WHERE ri.status = 'published'
       AND ri.published_at <= now()
       AND (
         (ri.type = 'promotion'
           AND (ri.starts_at IS NULL OR ri.starts_at <= now())
           AND (ri.ends_at IS NULL OR ri.ends_at > now()))
         OR
         (ri.type = 'event'
           AND COALESCE(ri.ends_at, ri.starts_at + interval '12 hours') > now())
         OR
         (ri.type NOT IN ('promotion','event')
           AND (ri.ends_at IS NULL OR ri.ends_at > now()))
       )
       AND ($1::text IS NULL OR ri.type = $1)
       AND ($2::timestamptz IS NULL OR ri.published_at < $2)
       AND (
         $3 = ANY(COALESCE(ri.tags, ARRAY[]::text[]))
         OR 'country:global' = ANY(COALESCE(ri.tags, ARRAY[]::text[]))
         OR (
           $4::text IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
             FROM unnest(COALESCE(ri.tags, ARRAY[]::text[])) tag
             WHERE tag LIKE 'country:%'
           )
           AND (
             lower(COALESCE(ri.region, '')) = $4
             OR lower(COALESCE(rs.config->>'region', '')) = $4
           )
         )
       )
     ORDER BY
       CASE WHEN $5::text IS NOT NULL AND (
         COALESCE(ri.region, '') ILIKE $5
         OR EXISTS (
           SELECT 1 FROM unnest(COALESCE(ri.tags, ARRAY[]::text[])) tag
           WHERE tag ILIKE $5
         )
       ) THEN 0 ELSE 1 END,
       ri.priority DESC, ri.published_at DESC, ri.id DESC
     LIMIT $6`,
    [requestedType, before, countryTag, countryRegion, regionNeedle, limit]
  );

  res.json({
    items: rows,
    nextCursor: rows.length === limit ? rows.at(-1).published_at : null,
    country: country.toUpperCase(),
    region,
  });
}));

radarSyncRoutes.get('/', auth, h(async (req, res, next) => {
  if (String(req.query.type || '').toLowerCase() !== 'trend') return next();

  const explicit = await q(
    `SELECT 1 FROM radar_items
     WHERE type='trend' AND status='published' AND published_at<=now()
       AND (ends_at IS NULL OR ends_at>now()) LIMIT 1`
  );
  if (explicit.rows[0]) return next();

  const asked = Number(req.query.limit);
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, 30) : 20;
  const { rows } = await q(
    `WITH recent AS (
       SELECT ri.id,ri.title,ri.summary,ri.image_url,ri.external_url,ri.source_id,
              COALESCE(ri.source_name,rs.name) AS source_name,ri.published_at
       FROM radar_items ri
       LEFT JOIN radar_sources rs ON rs.id=ri.source_id
       WHERE ri.type='news' AND ri.status='published'
         AND ri.published_at BETWEEN now()-interval '40 hours' AND now()
     ), tokens AS (
       SELECT r.*,
              lower(regexp_replace(word, '[^[:alpha:]-]', '', 'g')) AS token
       FROM recent r,
            LATERAL regexp_split_to_table(r.title, E'\\s+') AS word
     ), ranked AS (
       SELECT token,
              count(*)::int AS mentions,
              count(DISTINCT source_id)::int AS sources,
              max(published_at) AS latest,
              (array_agg(title ORDER BY published_at DESC))[1] AS latest_title,
              (array_agg(summary ORDER BY published_at DESC))[1] AS latest_summary,
              (array_agg(image_url ORDER BY published_at DESC))[1] AS image_url,
              (array_agg(external_url ORDER BY published_at DESC))[1] AS external_url,
              (array_agg(source_name ORDER BY published_at DESC))[1] AS source_name
       FROM tokens
       WHERE char_length(token) BETWEEN 5 AND 28
         AND token NOT IN (
           'sobre','entre','depois','antes','desde','ainda','muito','muita','muitos','muitas','mais','menos',
           'como','para','pela','pelo','pelas','pelos','este','esta','estes','estas','aquele','aquela',
           'portugal','português','portuguesa','notícias','noticia','mundo','país','video','vídeo','agora',
           'ontem','hoje','amanhã','também','quando','onde','porque','contra','durante','primeiro','segunda',
           'presidente','governo','ministro','disse','afirma','após','nova','novo','novas','novos'
         )
       GROUP BY token
       HAVING count(*) >= 2 AND count(DISTINCT source_id) >= 2
     )
     SELECT 'trend:'||md5(token||':'||date_trunc('hour',latest)::text) AS id,
            'Em alta: '||upper(left(token,1))||substring(token from 2) AS title,
            mentions||' notícias de '||sources||' fontes estão a falar deste tema nas últimas horas.' AS summary,
            latest_summary AS body,
            image_url,external_url,source_name,NULL::text AS source_url,
            false AS sponsored,NULL::text AS sponsor_label,ARRAY[token]::text[] AS tags,
            'Portugal'::text AS region,NULL::timestamptz AS starts_at,NULL::timestamptz AS ends_at,
            latest AS published_at,LEAST(100,mentions*10+sources*5)::int AS priority,'trend'::text AS type
     FROM ranked
     ORDER BY sources DESC,mentions DESC,latest DESC
     LIMIT $1`,
    [limit]
  );

  res.json({ items: rows, nextCursor: null, derived: true });
}));

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
  const { rows } = await q('SELECT id, name, kind, config FROM radar_sources WHERE id=$1', [req.params.sourceId]);
  const source = rows[0];
  if (!source) throw notFound('Fonte Radar não encontrada');
  const publisher = source.kind === 'partner' && source.config?.adapter === 'headline-links';
  if (source.kind !== 'rss' && !publisher) throw forbidden('Esta fonte não tem sincronização automática');

  const result = publisher
    ? await syncWebRadarSources({ sourceId: source.id })
    : await syncRadarSources({ sourceId: source.id });
  audit(req.user.id, 'radar_source_sync', `radar_source:${source.id}`, result);
  if (result.failed) {
    const { rows: state } = await q('SELECT last_fetch_error FROM radar_sources WHERE id=$1', [source.id]);
    return res.status(502).json({
      ...result,
      error: state[0]?.last_fetch_error || 'A sincronização da fonte falhou',
      code: 'radar_sync_failed',
    });
  }
  res.status(result.skipped ? 202 : 200).json(result);
}

radarSyncRoutes.get('/sources', auth, requireStaff, h(sourceStatus));
radarSyncRoutes.get('/sources/ingestion', auth, requireStaff, h(sourceStatus));
radarSyncRoutes.post('/sources/:sourceId/sync', auth, requireStaff, h(syncSource));

radarSyncRoutes.post('/sources', auth, requireStaff, (req, _res, next) => {
  try {
    assertRssType(String(req.body?.kind || 'manual').toLowerCase(), req.body?.defaultType || 'news', req.body?.config);
    next();
  } catch (error) { next(error); }
});

radarSyncRoutes.patch('/sources/:sourceId', auth, requireStaff, h(async (req, res, next) => {
  if (req.body?.syncNow === true) return syncSource(req, res);

  if (req.body?.kind !== undefined || req.body?.defaultType !== undefined || req.body?.config !== undefined) {
    const { rows } = await q('SELECT kind, default_type, config FROM radar_sources WHERE id=$1', [req.params.sourceId]);
    if (!rows[0]) throw notFound('Fonte Radar não encontrada');
    const kind = req.body.kind === undefined ? rows[0].kind : String(req.body.kind || '').toLowerCase();
    const defaultType = req.body.defaultType === undefined ? rows[0].default_type : req.body.defaultType;
    const config = req.body.config === undefined ? rows[0].config : req.body.config;
    assertRssType(kind, defaultType, config);
  }
  next();
}));
