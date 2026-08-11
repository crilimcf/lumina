-- Lumina Live · directos escaláveis + replay no perfil/feed.

CREATE TABLE IF NOT EXISTS live_streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title varchar(140) NOT NULL,
  privacy text NOT NULL DEFAULT 'public' CHECK (privacy IN ('public','followers')),
  status text NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing','live','ended','ready','failed')),
  provider text NOT NULL DEFAULT 'cloudflare_stream',
  provider_input_id text,
  playback_url text,
  recording_url text,
  recording_mime text,
  post_id uuid REFERENCES posts(id) ON DELETE SET NULL,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS live_streams_one_active_per_creator
  ON live_streams (creator_id)
  WHERE status IN ('preparing','live');
CREATE INDEX IF NOT EXISTS live_streams_active_idx
  ON live_streams (started_at DESC, created_at DESC)
  WHERE status = 'live';
CREATE INDEX IF NOT EXISTS live_streams_creator_idx
  ON live_streams (creator_id, created_at DESC);

CREATE TABLE IF NOT EXISTS live_viewers (
  stream_id uuid NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (stream_id, user_id)
);
CREATE INDEX IF NOT EXISTS live_viewers_recent_idx ON live_viewers (stream_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS live_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body varchar(500) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_comments_stream_idx ON live_comments (stream_id, created_at, id);

CREATE TABLE IF NOT EXISTS live_reactions (
  id bigserial PRIMARY KEY,
  stream_id uuid NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('like','fire')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_reactions_stream_idx ON live_reactions (stream_id, created_at DESC);

-- Mantém as contagens de espectadores honestas sem depender de sockets persistentes.
CREATE OR REPLACE FUNCTION lumina_live_prune_viewers(target_stream uuid)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE removed integer;
BEGIN
  DELETE FROM live_viewers
   WHERE stream_id = target_stream
     AND last_seen_at < now() - interval '35 seconds';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END $$;
