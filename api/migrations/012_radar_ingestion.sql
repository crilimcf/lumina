-- Lumina · Radar automatic ingestion state
-- Guarda metadados HTTP/operacionais sem misturar credenciais no schema.

ALTER TABLE radar_sources
  ADD COLUMN IF NOT EXISTS etag TEXT,
  ADD COLUMN IF NOT EXISTS last_modified TEXT,
  ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_fetch_error VARCHAR(500),
  ADD COLUMN IF NOT EXISTS last_item_count INTEGER NOT NULL DEFAULT 0 CHECK (last_item_count >= 0);

CREATE INDEX IF NOT EXISTS radar_sources_ingestion_idx
  ON radar_sources(kind, active, last_fetched_at)
  WHERE kind = 'rss' AND active = true;
