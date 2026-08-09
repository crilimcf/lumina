CREATE TABLE IF NOT EXISTS moment_reactions (
  moment_id uuid NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('like','fire')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (moment_id, user_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_moment_reactions_moment
  ON moment_reactions(moment_id, created_at DESC);
