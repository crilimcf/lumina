-- Lumina · dedicated persistent groups for group video calls.
-- New group video calls no longer create private Salas.
-- Legacy groups created by the old GroupCallHub are moved out of Salas automatically.

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

-- The old GroupCallHub always created a private room with this exact topic,
-- no description/image and at least one invite. Reuse the same UUID so active/history
-- call references can move without changing the group's identity.
INSERT INTO group_call_groups (id,creator_id,name,image_url,created_at,updated_at)
SELECT r.id,r.creator_id,left(r.name,60),NULL,r.created_at,r.updated_at
  FROM rooms r
 WHERE r.visibility='private'
   AND r.topic='Grupo de videochamada'
   AND COALESCE(r.description,'')=''
   AND r.image_url IS NULL
   AND EXISTS (SELECT 1 FROM room_invites ri WHERE ri.room_id=r.id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO group_call_group_members (group_id,user_id,role,added_at)
SELECT r.id,rm.user_id,
       CASE WHEN rm.user_id=r.creator_id THEN 'owner' ELSE 'member' END,
       rm.joined_at
  FROM rooms r
  JOIN group_call_groups g ON g.id=r.id
  JOIN room_members rm ON rm.room_id=r.id
ON CONFLICT (group_id,user_id) DO UPDATE
SET role=CASE WHEN EXCLUDED.role='owner' THEN 'owner' ELSE group_call_group_members.role END;

INSERT INTO group_call_group_members (group_id,user_id,role,added_at)
SELECT r.id,ri.user_id,
       CASE WHEN ri.user_id=r.creator_id THEN 'owner' ELSE 'member' END,
       ri.created_at
  FROM rooms r
  JOIN group_call_groups g ON g.id=r.id
  JOIN room_invites ri ON ri.room_id=r.id
ON CONFLICT (group_id,user_id) DO NOTHING;

UPDATE group_call_sessions gc
   SET group_id=gc.room_id,
       room_id=NULL
 WHERE gc.room_id IN (SELECT id FROM group_call_groups);

-- Remove only rooms positively identified as old GroupCallHub artefacts.
-- Their members/calls already live in the dedicated group tables above.
DELETE FROM rooms r
 USING group_call_groups g
 WHERE r.id=g.id
   AND r.visibility='private'
   AND r.topic='Grupo de videochamada'
   AND COALESCE(r.description,'')=''
   AND r.image_url IS NULL;
