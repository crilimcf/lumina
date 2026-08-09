-- Lumina · Radar content platform
-- Separa descoberta editorial/comercial do Feed social e prepara ingestão futura.

CREATE TABLE radar_sources (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(120) NOT NULL,
  kind             TEXT NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual','rss','api','partner')),
  url              TEXT,
  default_type     TEXT NOT NULL DEFAULT 'news' CHECK (default_type IN ('news','promotion','event','trend','editorial')),
  active           BOOLEAN NOT NULL DEFAULT true,
  trusted          BOOLEAN NOT NULL DEFAULT false,
  config           JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_fetched_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX radar_sources_active_idx ON radar_sources(active, kind);

CREATE TABLE radar_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type             TEXT NOT NULL CHECK (type IN ('news','promotion','event','trend','editorial')),
  title            VARCHAR(180) NOT NULL,
  summary          VARCHAR(1200) NOT NULL DEFAULT '',
  body             TEXT NOT NULL DEFAULT '',
  image_url        TEXT,
  external_url     TEXT,
  source_id        UUID REFERENCES radar_sources(id) ON DELETE SET NULL,
  source_name      VARCHAR(120),
  source_url       TEXT,
  sponsored        BOOLEAN NOT NULL DEFAULT false,
  sponsor_label    VARCHAR(120),
  tags             TEXT[] NOT NULL DEFAULT '{}',
  region           VARCHAR(80),
  starts_at        TIMESTAMPTZ,
  ends_at          TIMESTAMPTZ,
  published_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  status           TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  priority         SMALLINT NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 100),
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  legacy_post_id   UUID UNIQUE REFERENCES posts(id) ON DELETE SET NULL,
  fingerprint      TEXT UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX radar_items_feed_idx ON radar_items(status, published_at DESC) WHERE status = 'published';
CREATE INDEX radar_items_type_feed_idx ON radar_items(type, published_at DESC) WHERE status = 'published';
CREATE INDEX radar_items_expiry_idx ON radar_items(ends_at) WHERE status = 'published' AND ends_at IS NOT NULL;
CREATE INDEX radar_items_tags_idx ON radar_items USING GIN (tags);

-- Preserva campanhas antigas que viviam em posts.kind='promotion'.
INSERT INTO radar_items (
  type, title, summary, body, image_url, source_name, sponsored,
  sponsor_label, published_at, created_by, legacy_post_id, fingerprint
)
SELECT
  'promotion',
  left(CASE WHEN position(E'\n' IN p.body) > 0 THEN split_part(p.body, E'\n', 1) ELSE p.body END, 180),
  left(p.body, 1200),
  p.body,
  p.media_url,
  u.name,
  true,
  u.name,
  p.created_at,
  p.author_id,
  p.id,
  'legacy-post:' || p.id::text
FROM posts p
JOIN users u ON u.id = p.author_id
WHERE p.hidden_at IS NULL
  AND COALESCE(p.kind, 'post') = 'promotion'
ON CONFLICT (legacy_post_id) DO NOTHING;
