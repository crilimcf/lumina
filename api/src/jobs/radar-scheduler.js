import cron from 'node-cron';
import { q } from '../db.js';
import { syncRadarSources } from './radar.js';
import { syncWebRadarSources } from './radar-web.js';

let running = false;

export async function ensureRadarCountrySources() {
  await q(
    `UPDATE radar_sources
     SET config = jsonb_set(
           COALESCE(config, '{}'::jsonb),
           '{tags}',
           CASE
             WHEN jsonb_typeof(config->'tags') = 'array'
               THEN COALESCE(config->'tags', '[]'::jsonb) || '["country:pt"]'::jsonb
             ELSE '["country:pt"]'::jsonb
           END,
           true
         ),
         updated_at = now()
     WHERE lower(COALESCE(config->>'region', '')) = 'portugal'
       AND NOT (COALESCE(config->'tags', '[]'::jsonb) @> '["country:pt"]'::jsonb)`
  );

  const { rowCount } = await q(
    `WITH source_pack(name, kind, url, default_type, active, trusted, config) AS (
       VALUES
         ('franceinfo · Les titres', 'rss', 'https://www.francetvinfo.fr/titres.rss', 'news', true, true,
           '{"maxItems":18,"maxAgeDays":3,"priority":19,"autoPublish":true,"region":"France","tags":["country:fr","france","franceinfo"]}'::jsonb),
         ('France 24 · Français', 'rss', 'https://www.france24.com/fr/rss', 'news', true, true,
           '{"maxItems":18,"maxAgeDays":3,"priority":18,"autoPublish":true,"region":"France","tags":["country:fr","france","france24"]}'::jsonb),
         ('RFI · Français', 'rss', 'https://www.rfi.fr/fr/rss', 'news', true, true,
           '{"maxItems":16,"maxAgeDays":3,"priority":16,"autoPublish":true,"region":"France","tags":["country:fr","france","rfi"]}'::jsonb),
         ('Al Jazeera · English', 'rss', 'https://www.aljazeera.com/xml/rss/all.xml', 'news', true, true,
           '{"maxItems":20,"maxAgeDays":3,"priority":20,"autoPublish":true,"region":"Global","tags":["country:global","world","aljazeera"]}'::jsonb),
         ('Euronews · World News', 'rss', 'https://www.euronews.com/rss?format=mrss&level=theme&name=news', 'news', true, true,
           '{"maxItems":20,"maxAgeDays":3,"priority":19,"autoPublish":true,"region":"Global","tags":["country:global","world","euronews"]}'::jsonb)
     )
     INSERT INTO radar_sources (name, kind, url, default_type, active, trusted, config)
     SELECT name, kind, url, default_type, active, trusted, config
     FROM source_pack incoming
     WHERE NOT EXISTS (
       SELECT 1 FROM radar_sources existing WHERE existing.url = incoming.url
     )
     ON CONFLICT DO NOTHING`
  );

  return { inserted: rowCount || 0 };
}

async function runRadarSync() {
  if (running) return;
  running = true;
  const started = Date.now();
  try {
    const [rss, web] = await Promise.all([
      syncRadarSources(),
      syncWebRadarSources(),
    ]);
    const attempted = (rss.attempted || 0) + (web.attempted || 0);
    const succeeded = (rss.succeeded || 0) + (web.succeeded || 0);
    const failed = (rss.failed || 0) + (web.failed || 0);
    const items = (rss.items || 0) + (web.items || 0);
    if (attempted || failed) {
      console.log(`[radar] sync: ${succeeded}/${attempted} fontes · ${items} itens · ${Date.now() - started} ms`);
    }
  } catch (error) {
    console.error('[radar] sync falhou:', error.message);
  } finally {
    running = false;
  }
}

export function startRadarJobs() {
  ensureRadarCountrySources()
    .then(({ inserted }) => {
      if (inserted) console.log(`[radar] ${inserted} fonte(s) local/global preparada(s) após health`);
    })
    .catch(error => console.error('[radar] preparação de fontes local/global falhou:', error.message));

  if (process.env.RUN_JOBS_IN_PROCESS === 'false' || process.env.RADAR_INGEST_ENABLED === 'false') {
    console.log('[radar] ingestão automática desligada neste processo');
    return;
  }
  cron.schedule('*/15 * * * *', runRadarSync);
  setTimeout(runRadarSync, 30_000).unref();
  console.log('[radar] ingestão RSS + fontes verificadas agendada de 15 em 15 minutos');
}
