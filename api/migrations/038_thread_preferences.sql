CREATE TABLE thread_preferences (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id     UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  muted         BOOLEAN NOT NULL DEFAULT false,
  archived      BOOLEAN NOT NULL DEFAULT false,
  pinned        BOOLEAN NOT NULL DEFAULT false,
  marked_unread BOOLEAN NOT NULL DEFAULT false,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, thread_id)
);

CREATE INDEX thread_preferences_user_view_idx
  ON thread_preferences(user_id, archived, pinned, updated_at DESC);
