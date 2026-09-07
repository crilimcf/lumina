-- Lumina AI core: observabilidade e cache sem guardar o texto original.

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  feature TEXT NOT NULL CHECK (feature IN ('translate','rewrite','search','image_generate','image_edit')),
  model VARCHAR(100) NOT NULL,
  input_tokens INT NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INT NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  image_count SMALLINT NOT NULL DEFAULT 0 CHECK (image_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_events_user_created_idx
  ON ai_usage_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_feature_created_idx
  ON ai_usage_events (feature, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_translation_cache (
  source_hash CHAR(64) NOT NULL,
  target_language VARCHAR(16) NOT NULL,
  translated_text TEXT NOT NULL,
  model VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_hash, target_language)
);

CREATE INDEX IF NOT EXISTS ai_translation_cache_created_idx
  ON ai_translation_cache (created_at DESC);
