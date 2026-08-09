-- Lumina · Radar ingestion health and first trusted Portuguese news source.

ALTER TABLE radar_sources
  ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0;

INSERT INTO radar_sources (
  name, kind, url, default_type, active, trusted, config
)
SELECT
  'RTP Notícias',
  'rss',
  'https://www.rtp.pt/noticias/rss',
  'news',
  true,
  true,
  '{"provider":"rtp","region":"PT","maxItems":30}'::jsonb
WHERE NOT EXISTS (
  SELECT 1
  FROM radar_sources
  WHERE kind='rss'
    AND config->>'provider'='rtp'
    AND url='https://www.rtp.pt/noticias/rss'
);
