-- Lumina · migração 10
-- Remove definitivamente o modelo antigo de grupos do runtime e preserva as
-- publicações existentes como publicações normais do Feed social.

-- A função antiga dependia da pertença a grupos. Retiramo-la antes de apagar
-- as colunas/tabelas em que se apoiava.
DROP TRIGGER IF EXISTS trg_lumina_notify_new_post ON posts;
DROP FUNCTION IF EXISTS lumina_notify_new_post();

-- Publicações antigas continuam a existir; apenas deixam de pertencer a um
-- grupo/convite. O Feed passa a ser definido exclusivamente pelas relações
-- entre pessoas.
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_invite_fk;
DROP INDEX IF EXISTS posts_one_reply_idx;
ALTER TABLE posts DROP COLUMN IF EXISTS invite_id CASCADE;
ALTER TABLE posts DROP COLUMN IF EXISTS community_id CASCADE;

DROP INDEX IF EXISTS posts_feed_idx;
CREATE INDEX IF NOT EXISTS posts_social_feed_idx
  ON posts(created_at DESC) WHERE hidden_at IS NULL;

-- A moderação deixa de ter o alvo legado "proposal".
DELETE FROM reports WHERE target_type = 'proposal';
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE reports ADD CONSTRAINT reports_target_type_check
  CHECK (target_type IN ('post','comment','user'));

-- Dados antigos que deixaram de fazer parte do produto.
DROP TABLE IF EXISTS answer_days CASCADE;
DROP TABLE IF EXISTS proposal_votes CASCADE;
DROP TABLE IF EXISTS invites CASCADE;
DROP TABLE IF EXISTS proposals CASCADE;
DROP TABLE IF EXISTS memberships CASCADE;
DROP TABLE IF EXISTS communities CASCADE;

-- Uma publicação nova avisa apenas quem segue o autor e não está bloqueado em
-- nenhum dos sentidos. Não existe qualquer fronteira adicional por grupo.
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
  WHERE f.following_id = NEW.author_id
    AND f.follower_id <> NEW.author_id
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_id = f.follower_id AND b.blocked_id = NEW.author_id)
         OR (b.blocked_id = f.follower_id AND b.blocker_id = NEW.author_id)
    )
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_lumina_notify_new_post
AFTER INSERT ON posts
FOR EACH ROW EXECUTE FUNCTION lumina_notify_new_post();
