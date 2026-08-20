-- Lumina · dedicated persistent groups for group video calls.
-- Group video calls no longer create private Salas. Existing room-backed calls remain valid.

CREATE TABLE group_call_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 60),
  image_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX group_call_groups_creator_idx
  ON group_call_groups(creator_id, created_at DESC);

CREATE TABLE group_call_group_members (
  group_id   UUID NOT NULL REFERENCES group_call_groups(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX group_call_group_members_user_idx
  ON group_call_group_members(user_id, added_at DESC);

ALTER TABLE group_call_sessions
  ADD COLUMN group_id UUID REFERENCES group_call_groups(id) ON DELETE CASCADE;

ALTER TABLE group_call_sessions
  ALTER COLUMN room_id DROP NOT NULL;

ALTER TABLE group_call_sessions
  ADD CONSTRAINT group_call_sessions_parent_check
  CHECK ((room_id IS NULL) <> (group_id IS NULL));

CREATE INDEX group_call_sessions_group_status_idx
  ON group_call_sessions(group_id, status, created_at DESC)
  WHERE group_id IS NOT NULL;
