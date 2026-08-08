-- Lumina · migração 7
-- Um upload confirmado passa a ser consumido por um único conteúdo criado pelo
-- utilizador. Referências derivadas pelo servidor (ex.: repost) podem continuar
-- a apontar para o mesmo URL, por isso a limpeza física confirma sempre que já
-- não existe nenhuma referência antes de remover ficheiros antigos.

ALTER TABLE uploads ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS purpose TEXT;

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

INSERT INTO schema_migrations (version) VALUES (7) ON CONFLICT DO NOTHING;
