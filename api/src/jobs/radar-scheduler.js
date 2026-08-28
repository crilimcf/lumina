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

  await q(
    `UPDATE radar_items
     SET tags = array_append(COALESCE(tags, ARRAY[]::text[]), 'country:pt'),
         updated_at = now()
     WHERE status = 'published'
       AND (fingerprint LIKE 'verified:event:%' OR fingerprint LIKE 'verified:promotion:%')
       AND NOT ('country:pt' = ANY(COALESCE(tags, ARRAY[]::text[])))`
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

         -- Mundo: publishers independentes e de regiões editoriais diferentes.
         ('Al Jazeera · English', 'rss', 'https://www.aljazeera.com/xml/rss/all.xml', 'news', true, true,
           '{"maxItems":16,"maxAgeDays":3,"priority":18,"autoPublish":true,"region":"Global","tags":["country:global","world","aljazeera"]}'::jsonb),
         ('Euronews · World News', 'rss', 'https://www.euronews.com/rss?format=mrss&level=theme&name=news', 'news', true, true,
           '{"maxItems":16,"maxAgeDays":3,"priority":18,"autoPublish":true,"region":"Global","tags":["country:global","world","euronews"]}'::jsonb),
         ('BBC News · World', 'rss', 'https://feeds.bbci.co.uk/news/world/rss.xml', 'news', true, true,
           '{"maxItems":16,"maxAgeDays":3,"priority":18,"autoPublish":true,"region":"Global","tags":["country:global","world","bbc"]}'::jsonb),
         ('The Guardian · World', 'rss', 'https://www.theguardian.com/world/rss', 'news', true, true,
           '{"maxItems":16,"maxAgeDays":3,"priority":17,"autoPublish":true,"region":"Global","tags":["country:global","world","guardian"]}'::jsonb),
         ('NPR · World', 'rss', 'https://feeds.npr.org/1004/rss.xml', 'news', true, true,
           '{"maxItems":14,"maxAgeDays":3,"priority":16,"autoPublish":true,"region":"Global","tags":["country:global","world","npr"]}'::jsonb),
         ('DW · World', 'rss', 'https://rss.dw.com/syndication/feeds/VAS_CB_Eng_OurVoice.31791-cb.html', 'news', true, true,
           '{"maxItems":14,"maxAgeDays":3,"priority":16,"autoPublish":true,"region":"Global","tags":["country:global","world","dw"]}'::jsonb),
         ('Sky News · World', 'rss', 'https://feeds.skynews.com/feeds/rss/world.xml', 'news', true, true,
           '{"maxItems":14,"maxAgeDays":3,"priority":16,"autoPublish":true,"region":"Global","tags":["country:global","world","sky-news"]}'::jsonb),

         -- Google disponibiliza um feed RSS público das pesquisas em alta por país.
         ('Google Trends · Portugal', 'rss', 'https://trends.google.com/trending/rss?geo=PT', 'trend', true, true,
           '{"maxItems":20,"maxAgeDays":2,"priority":24,"autoPublish":true,"region":"Portugal","tags":["country:pt","country:global","google-trends","tendencias"]}'::jsonb),
         ('Google Trends · France', 'rss', 'https://trends.google.com/trending/rss?geo=FR', 'trend', true, true,
           '{"maxItems":20,"maxAgeDays":2,"priority":24,"autoPublish":true,"region":"France","tags":["country:fr","country:global","google-trends","trends"]}'::jsonb),
         ('Google Trends · España', 'rss', 'https://trends.google.com/trending/rss?geo=ES', 'trend', true, true,
           '{"maxItems":20,"maxAgeDays":2,"priority":23,"autoPublish":true,"region":"Spain","tags":["country:es","country:global","google-trends","trends"]}'::jsonb),
         ('Google Trends · United Kingdom', 'rss', 'https://trends.google.com/trending/rss?geo=GB', 'trend', true, true,
           '{"maxItems":20,"maxAgeDays":2,"priority":23,"autoPublish":true,"region":"United Kingdom","tags":["country:gb","country:global","google-trends","trends"]}'::jsonb),
         ('Google Trends · United States', 'rss', 'https://trends.google.com/trending/rss?geo=US', 'trend', true, true,
           '{"maxItems":20,"maxAgeDays":2,"priority":23,"autoPublish":true,"region":"United States","tags":["country:us","country:global","google-trends","trends"]}'::jsonb),
         ('Google Trends · Brasil', 'rss', 'https://trends.google.com/trending/rss?geo=BR', 'trend', true, true,
           '{"maxItems":20,"maxAgeDays":2,"priority":23,"autoPublish":true,"region":"Brazil","tags":["country:br","country:global","google-trends","tendencias"]}'::jsonb)
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
      if (inserted) console.log(`[radar] ${inserted} fonte(s) país/mundo preparada(s) após health`);
    })
    .catch(error => console.error('[radar] preparação de fontes país/mundo falhou:', error.message));

  if (process.env.RUN_JOBS_IN_PROCESS === 'false' || process.env.RADAR_INGEST_ENABLED === 'false') {
    console.log('[radar] ingestão automática desligada neste processo');
    return;
  }
  cron.schedule('*/15 * * * *', runRadarSync);
  setTimeout(runRadarSync, 30_000).unref();
  console.log('[radar] ingestão RSS + fontes verificadas agendada de 15 em 15 minutos');
}
