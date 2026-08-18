-- Lumina · Radar follows the current physical country.
-- Country targeting lives in source/item metadata so publisher content remains untouched.
-- Keep this startup migration deliberately light: production can contain many historical
-- Radar items, so legacy item scoping is handled by the read path instead of rewriting
-- the whole radar_items table while Railway is waiting for the health check.

-- Tag Portugal sources for newly ingested items. This only touches the small source catalog.
UPDATE radar_sources
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
  AND NOT (COALESCE(config->'tags', '[]'::jsonb) @> '["country:pt"]'::jsonb);

-- Initial France pack. Only headlines/summary/link are ingested; the article stays at its publisher.
WITH source_pack(name, kind, url, default_type, active, trusted, config) AS (
  VALUES
    ('franceinfo · Les titres', 'rss', 'https://www.francetvinfo.fr/titres.rss', 'news', true, true,
      '{"maxItems":18,"maxAgeDays":3,"priority":19,"autoPublish":true,"region":"France","tags":["country:fr","france","franceinfo"]}'::jsonb),
    ('France 24 · Français', 'rss', 'https://www.france24.com/fr/rss', 'news', true, true,
      '{"maxItems":18,"maxAgeDays":3,"priority":18,"autoPublish":true,"region":"France","tags":["country:fr","france","france24"]}'::jsonb),
    ('RFI · Français', 'rss', 'https://www.rfi.fr/fr/rss', 'news', true, true,
      '{"maxItems":16,"maxAgeDays":3,"priority":16,"autoPublish":true,"region":"France","tags":["country:fr","france","rfi"]}'::jsonb)
)
INSERT INTO radar_sources (name, kind, url, default_type, active, trusted, config)
SELECT name, kind, url, default_type, active, trusted, config
FROM source_pack incoming
WHERE NOT EXISTS (
  SELECT 1 FROM radar_sources existing WHERE existing.url = incoming.url
)
ON CONFLICT DO NOTHING;
