-- Feed social sem Comunidades visíveis.
-- Mantemos uma comunidade técnica interna apenas para compatibilidade com o
-- schema histórico de posts; ela nunca deve aparecer na experiência da app.

ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE communities
  ALTER COLUMN founder_id DROP NOT NULL;

INSERT INTO communities (slug, name, description, timezone, founder_id, member_count, is_system)
VALUES ('lumina-core', 'Lumina', 'Espaço técnico interno do Feed social.', 'Europe/Lisbon', NULL, 0, true)
ON CONFLICT (slug) DO UPDATE
  SET is_system = true,
      name = EXCLUDED.name,
      description = EXCLUDED.description;

CREATE INDEX IF NOT EXISTS communities_system_idx ON communities(is_system);

-- Uma publicação do Feed notifica seguidores do autor. A antiga fronteira por
-- membership de comunidade deixa de existir para posts sociais.
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
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN NEW;
END $$;
