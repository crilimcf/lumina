-- Lumina · migração 7
-- Um upload confirmado passa a ser consumido por um único conteúdo criado pelo
-- utilizador. Referências derivadas pelo servidor (ex.: repost) podem continuar
-- a apontar para o mesmo URL, por isso a limpeza física confirma sempre que já
-- não existe nenhuma referência antes de remover ficheiros antigos.

ALTER TABLE uploads ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS purpose TEXT;

-- `key` já era UNIQUE. O URL é uma função desse key e também tem de identificar
-- um único objeto: os helpers de lifecycle procuram deliberadamente por URL.
CREATE UNIQUE INDEX IF NOT EXISTS uploads_url_unique_idx ON uploads(url);
CREATE INDEX IF NOT EXISTS uploads_consumed_idx ON uploads(consumed_at);

-- Conteúdo criado antes desta migração já consumiu o respetivo upload. Marcamo-lo
-- como legacy porque pode ter sido reutilizado antes de existir esta regra.
UPDATE uploads u
SET consumed_at = COALESCE(u.confirmed_at, u.created_at), purpose = 'legacy'
WHERE u.consumed_at IS NULL
  AND (
    EXISTS (SELECT 1 FROM users x WHERE x.avatar_url = u.url)
    OR EXISTS (SELECT 1 FROM posts x WHERE x.media_url = u.url)
    OR EXISTS (SELECT 1 FROM moments x WHERE x.media_url = u.url)
    OR EXISTS (SELECT 1 FROM messages x WHERE x.media_url = u.url)
  );

ALTER TABLE uploads DROP CONSTRAINT IF EXISTS uploads_purpose_check;
ALTER TABLE uploads ADD CONSTRAINT uploads_purpose_check
  CHECK (purpose IS NULL OR purpose IN ('legacy','post','moment','message','avatar'));

ALTER TABLE uploads DROP CONSTRAINT IF EXISTS uploads_consumption_pair_check;
ALTER TABLE uploads ADD CONSTRAINT uploads_consumption_pair_check
  CHECK ((consumed_at IS NULL AND purpose IS NULL)
      OR (consumed_at IS NOT NULL AND purpose IS NOT NULL));

INSERT INTO schema_migrations (version) VALUES (7) ON CONFLICT DO NOTHING;
