import { Router } from 'express';
import { q } from '../db.js';
import { audit, auth, bad, forbidden, h, notFound } from '../middleware/auth.js';

export const radarRoutes = Router();

const ITEM_TYPES = new Set(['news', 'promotion', 'event', 'trend', 'editorial']);
const SOURCE_KINDS = new Set(['manual', 'rss', 'api', 'partner']);
const STATUSES = new Set(['draft', 'published', 'archived']);

function requireStaff(req, _res, next) {
  if (!req.user?.is_staff) return next(forbidden('Apenas a equipa Lumina pode gerir o Radar'));
  next();
}

function optionalUrl(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  let parsed;
  try { parsed = new URL(text); }
  catch { throw bad(`${field} inválido`, 'bad_url'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw bad(`${field} inválido`, 'bad_url');
  return parsed.toString();
}

function optionalDate(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw bad(`${field} inválido`, 'bad_date');
  return date.toISOString();
}

function cleanTags(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw bad('Tags inválidas', 'bad_tags');
  return [...new Set(value.map(v => String(v).trim().toLowerCase()).filter(Boolean))].slice(0, 12);
}

function cleanType(value) {
  const type = String(value || '').trim().toLowerCase();
  if (!ITEM_TYPES.has(type)) throw bad('Tipo de Radar inválido', 'bad_radar_type');
  return type;
}

function cleanPriority(value) {
  const priority = Number(value ?? 0);
  if (!Number.isInteger(priority) || priority < 0 || priority > 100) throw bad('Prioridade inválida', 'bad_priority');
  return priority;
}

function validateWindow(type, startsAt, endsAt) {
  if (type === 'event' && !startsAt) throw bad('Um evento precisa de data de início', 'missing_event_start');
  if (endsAt && startsAt && new Date(endsAt) < new Date(startsAt)) {
    throw bad('A data de fim não pode ser anterior ao início', 'bad_date_range');
  }
}

radarRoutes.get('/', auth, h(async (req, res) => {
  const requestedType = req.query.type ? cleanType(req.query.type) : null;
  const before = req.query.before || null;
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
     ORDER BY ri.published_at DESC, ri.priority DESC, ri.id DESC
     LIMIT $3`,
    [requestedType, before, limit]
  );

  res.json({ items: rows, nextCursor: rows.length === limit ? rows.at(-1).published_at : null });
}));

radarRoutes.get('/manage', auth, requireStaff, h(async (req, res) => {
  const status = req.query.status ? String(req.query.status).trim().toLowerCase() : null;
  if (status && !STATUSES.has(status)) throw bad('Estado inválido', 'bad_status');
  const { rows } = await q(
    `SELECT ri.id, ri.type, ri.title, ri.summary, ri.body, ri.image_url, ri.external_url,
            ri.source_id, COALESCE(ri.source_name, rs.name) AS source_name,
            COALESCE(ri.source_url, rs.url) AS source_url,
            ri.sponsored, ri.sponsor_label, ri.tags, ri.region, ri.starts_at, ri.ends_at,
            ri.published_at, ri.status, ri.priority, ri.created_at, ri.updated_at
     FROM radar_items ri
     LEFT JOIN radar_sources rs ON rs.id = ri.source_id
     WHERE ($1::text IS NULL OR ri.status = $1)
     ORDER BY ri.created_at DESC
     LIMIT 100`,
    [status]
  );
  res.json({ items: rows });
}));

radarRoutes.get('/sources', auth, requireStaff, h(async (_req, res) => {
  const { rows } = await q(
    `SELECT id, name, kind, url, default_type, active, trusted, config, last_fetched_at, created_at, updated_at
     FROM radar_sources ORDER BY active DESC, name ASC`
  );
  res.json({ sources: rows });
}));

radarRoutes.post('/sources', auth, requireStaff, h(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const kind = String(req.body.kind || 'manual').trim().toLowerCase();
  const defaultType = cleanType(req.body.defaultType || 'news');
  const url = optionalUrl(req.body.url, 'URL da fonte');
  if (!name || name.length > 120) throw bad('Nome da fonte inválido', 'bad_source_name');
  if (!SOURCE_KINDS.has(kind)) throw bad('Tipo de fonte inválido', 'bad_source_kind');
  if (kind === 'rss' && !url) throw bad('Uma fonte RSS precisa de URL', 'missing_source_url');

  const { rows } = await q(
    `INSERT INTO radar_sources (name, kind, url, default_type, active, trusted, config)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, name, kind, url, default_type, active, trusted, config, created_at, updated_at`,
    [name, kind, url, defaultType, req.body.active !== false, !!req.body.trusted, req.body.config || {}]
  );
  audit(req.user.id, 'radar_source_create', `radar_source:${rows[0].id}`, { name, kind });
  res.status(201).json(rows[0]);
}));

radarRoutes.patch('/sources/:sourceId', auth, requireStaff, h(async (req, res) => {
  const current = await q('SELECT * FROM radar_sources WHERE id=$1', [req.params.sourceId]);
  if (!current.rows[0]) throw notFound('Fonte Radar não encontrada');
  const source = current.rows[0];

  const name = req.body.name === undefined ? source.name : String(req.body.name || '').trim();
  const kind = req.body.kind === undefined ? source.kind : String(req.body.kind || '').trim().toLowerCase();
  const url = req.body.url === undefined ? source.url : optionalUrl(req.body.url, 'URL da fonte');
  const defaultType = req.body.defaultType === undefined ? source.default_type : cleanType(req.body.defaultType);
  if (!name || name.length > 120) throw bad('Nome da fonte inválido', 'bad_source_name');
  if (!SOURCE_KINDS.has(kind)) throw bad('Tipo de fonte inválido', 'bad_source_kind');
  if (kind === 'rss' && !url) throw bad('Uma fonte RSS precisa de URL', 'missing_source_url');

  const { rows } = await q(
    `UPDATE radar_sources
     SET name=$2, kind=$3, url=$4, default_type=$5, active=$6, trusted=$7, config=$8, updated_at=now()
     WHERE id=$1
     RETURNING id, name, kind, url, default_type, active, trusted, config, last_fetched_at, created_at, updated_at`,
    [
      req.params.sourceId, name, kind, url, defaultType,
      req.body.active === undefined ? source.active : !!req.body.active,
      req.body.trusted === undefined ? source.trusted : !!req.body.trusted,
      req.body.config === undefined ? source.config : req.body.config,
    ]
  );
  audit(req.user.id, 'radar_source_update', `radar_source:${req.params.sourceId}`);
  res.json(rows[0]);
}));

radarRoutes.post('/', auth, requireStaff, h(async (req, res) => {
  const type = cleanType(req.body.type);
  const title = String(req.body.title || '').trim();
  const summary = String(req.body.summary || '').trim();
  const body = String(req.body.body || '').trim();
  const imageUrl = optionalUrl(req.body.imageUrl, 'Imagem');
  const externalUrl = optionalUrl(req.body.externalUrl, 'Link externo');
  const sourceUrl = optionalUrl(req.body.sourceUrl, 'Link da fonte');
  const sourceName = req.body.sourceName ? String(req.body.sourceName).trim().slice(0, 120) : null;
  const sponsored = !!req.body.sponsored;
  const sponsorLabel = req.body.sponsorLabel ? String(req.body.sponsorLabel).trim().slice(0, 120) : null;
  const startsAt = optionalDate(req.body.startsAt, 'Data de início');
  const endsAt = optionalDate(req.body.endsAt, 'Data de fim');
  const publishedAt = optionalDate(req.body.publishedAt, 'Data de publicação') || new Date().toISOString();
  const tags = cleanTags(req.body.tags) || [];
  const priority = cleanPriority(req.body.priority);
  const status = String(req.body.status || 'published').trim().toLowerCase();

  if (!title || title.length > 180) throw bad('Título inválido', 'bad_title');
  if (summary.length > 1200) throw bad('Resumo demasiado longo', 'bad_summary');
  if (body.length > 10_000) throw bad('Conteúdo demasiado longo', 'bad_body');
  if (!STATUSES.has(status)) throw bad('Estado inválido', 'bad_status');
  validateWindow(type, startsAt, endsAt);

  const { rows } = await q(
    `INSERT INTO radar_items (
       type, title, summary, body, image_url, external_url, source_id, source_name, source_url,
       sponsored, sponsor_label, tags, region, starts_at, ends_at, published_at, status, priority, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING *`,
    [
      type, title, summary, body, imageUrl, externalUrl, req.body.sourceId || null, sourceName, sourceUrl,
      sponsored, sponsorLabel, tags, req.body.region ? String(req.body.region).trim().slice(0, 80) : null,
      startsAt, endsAt, publishedAt, status, priority, req.user.id,
    ]
  );
  audit(req.user.id, 'radar_item_create', `radar_item:${rows[0].id}`, { type, sponsored });
  res.status(201).json(rows[0]);
}));

radarRoutes.patch('/:itemId', auth, requireStaff, h(async (req, res) => {
  const current = await q('SELECT * FROM radar_items WHERE id=$1', [req.params.itemId]);
  if (!current.rows[0]) throw notFound('Item Radar não encontrado');
  const item = current.rows[0];

  const type = req.body.type === undefined ? item.type : cleanType(req.body.type);
  const title = req.body.title === undefined ? item.title : String(req.body.title || '').trim();
  const summary = req.body.summary === undefined ? item.summary : String(req.body.summary || '').trim();
  const body = req.body.body === undefined ? item.body : String(req.body.body || '').trim();
  const imageUrl = req.body.imageUrl === undefined ? item.image_url : optionalUrl(req.body.imageUrl, 'Imagem');
  const externalUrl = req.body.externalUrl === undefined ? item.external_url : optionalUrl(req.body.externalUrl, 'Link externo');
  const sourceUrl = req.body.sourceUrl === undefined ? item.source_url : optionalUrl(req.body.sourceUrl, 'Link da fonte');
  const sourceName = req.body.sourceName === undefined ? item.source_name : (req.body.sourceName ? String(req.body.sourceName).trim().slice(0, 120) : null);
  const sponsored = req.body.sponsored === undefined ? item.sponsored : !!req.body.sponsored;
  const sponsorLabel = req.body.sponsorLabel === undefined ? item.sponsor_label : (req.body.sponsorLabel ? String(req.body.sponsorLabel).trim().slice(0, 120) : null);
  const tags = cleanTags(req.body.tags) ?? item.tags;
  const startsAt = req.body.startsAt === undefined ? item.starts_at : optionalDate(req.body.startsAt, 'Data de início');
  const endsAt = req.body.endsAt === undefined ? item.ends_at : optionalDate(req.body.endsAt, 'Data de fim');
  const publishedAt = req.body.publishedAt === undefined ? item.published_at : optionalDate(req.body.publishedAt, 'Data de publicação');
  const priority = req.body.priority === undefined ? item.priority : cleanPriority(req.body.priority);
  const status = req.body.status === undefined ? item.status : String(req.body.status || '').trim().toLowerCase();

  if (!title || title.length > 180) throw bad('Título inválido', 'bad_title');
  if (summary.length > 1200) throw bad('Resumo demasiado longo', 'bad_summary');
  if (body.length > 10_000) throw bad('Conteúdo demasiado longo', 'bad_body');
  if (!STATUSES.has(status)) throw bad('Estado inválido', 'bad_status');
  validateWindow(type, startsAt, endsAt);

  const { rows } = await q(
    `UPDATE radar_items SET
       type=$2, title=$3, summary=$4, body=$5, image_url=$6, external_url=$7,
       source_id=$8, source_name=$9, source_url=$10, sponsored=$11, sponsor_label=$12,
       tags=$13, region=$14, starts_at=$15, ends_at=$16, published_at=$17,
       status=$18, priority=$19, updated_at=now()
     WHERE id=$1 RETURNING *`,
    [
      req.params.itemId, type, title, summary, body, imageUrl, externalUrl,
      req.body.sourceId === undefined ? item.source_id : (req.body.sourceId || null), sourceName, sourceUrl,
      sponsored, sponsorLabel, tags,
      req.body.region === undefined ? item.region : (req.body.region ? String(req.body.region).trim().slice(0, 80) : null),
      startsAt, endsAt, publishedAt, status, priority,
    ]
  );
  audit(req.user.id, 'radar_item_update', `radar_item:${req.params.itemId}`, { status });
  res.json(rows[0]);
}));

radarRoutes.delete('/:itemId', auth, requireStaff, h(async (req, res) => {
  const { rows } = await q(
    `UPDATE radar_items SET status='archived', updated_at=now()
     WHERE id=$1 AND status <> 'archived' RETURNING id`,
    [req.params.itemId]
  );
  if (!rows[0]) throw notFound('Item Radar não encontrado');
  audit(req.user.id, 'radar_item_archive', `radar_item:${req.params.itemId}`);
  res.json({ archived: true });
}));