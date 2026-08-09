-- Perfis públicos/privados, pedidos de seguimento e centro de notificações.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS follow_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  UNIQUE (requester_id, target_id),
  CHECK (requester_id <> target_id)
);

CREATE INDEX IF NOT EXISTS follow_requests_target_status_idx
  ON follow_requests(target_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS follow_requests_requester_status_idx
  ON follow_requests(requester_id, status, created_at DESC);

-- A migração 002 já criou `notifications` com as colunas `kind` e `payload`.
-- Evoluímos essa tabela em vez de a substituir para preservar notificações que
-- já existam numa base de produção.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS post_id UUID REFERENCES posts(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES rooms(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS follow_request_id UUID REFERENCES follow_requests(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
-- Novas notificações usam `type`; `kind` fica apenas para compatibilidade com
-- linhas antigas e por isso deixa de ser obrigatório.
ALTER TABLE notifications ALTER COLUMN kind DROP NOT NULL;

-- UNIQUE permite vários NULL em PostgreSQL, por isso podemos ter linhas antigas
-- sem dedupe_key e continuar a usar ON CONFLICT(dedupe_key) nas novas.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key_idx
  ON notifications(dedupe_key);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;

-- Uma publicação nova aparece nos alertas dos seguidores que também podem
-- vê-la pela fronteira da comunidade. Assim uma notificação nunca fura a
-- privacidade de uma comunidade.
CREATE OR REPLACE FUNCTION lumina_notify_new_post()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(NEW.kind, 'post') <> 'post' OR NEW.hidden_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, type, actor_id, post_id, dedupe_key)
  SELECT f.follower_id, 'new_post', NEW.author_id, NEW.id,
         'post:' || NEW.id::text || ':' || f.follower_id::text
  FROM follows f
  JOIN memberships m
    ON m.user_id = f.follower_id AND m.community_id = NEW.community_id
  WHERE f.following_id = NEW.author_id
    AND f.follower_id <> NEW.author_id
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lumina_notify_new_post ON posts;
CREATE TRIGGER trg_lumina_notify_new_post
AFTER INSERT ON posts
FOR EACH ROW EXECUTE FUNCTION lumina_notify_new_post();

-- Salas públicas são descobertas por toda a comunidade Lumina. As privadas e
-- Ultra só notificam quando existe um convite explícito.
CREATE OR REPLACE FUNCTION lumina_notify_new_public_room()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.visibility = 'public' AND NEW.billing_state = 'active' THEN
    INSERT INTO notifications (user_id, type, actor_id, room_id, dedupe_key)
    SELECT u.id, 'new_room', NEW.creator_id, NEW.id,
           'room:new:' || NEW.id::text || ':' || u.id::text
    FROM users u
    WHERE u.id <> NEW.creator_id AND u.suspended_at IS NULL
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lumina_notify_new_public_room ON rooms;
CREATE TRIGGER trg_lumina_notify_new_public_room
AFTER INSERT ON rooms
FOR EACH ROW EXECUTE FUNCTION lumina_notify_new_public_room();

CREATE OR REPLACE FUNCTION lumina_notify_room_invite()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO notifications (user_id, type, actor_id, room_id, dedupe_key, read_at, created_at)
  VALUES (
    NEW.user_id, 'room_invite', NEW.invited_by, NEW.room_id,
    'room:invite:' || NEW.room_id::text || ':' || NEW.user_id::text,
    NULL, now()
  )
  ON CONFLICT (dedupe_key) DO UPDATE
    SET actor_id = EXCLUDED.actor_id, read_at = NULL, created_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lumina_notify_room_invite ON room_invites;
CREATE TRIGGER trg_lumina_notify_room_invite
AFTER INSERT OR UPDATE OF invited_by, created_at ON room_invites
FOR EACH ROW EXECUTE FUNCTION lumina_notify_room_invite();
