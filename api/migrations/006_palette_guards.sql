-- Conteúdo vindo de clientes modificados não pode guardar uma paleta que o
-- frontend não sabe renderizar. Antes da constraint normalizamos qualquer
-- valor legado fora do intervalo para a cor base.

UPDATE posts SET palette = 0 WHERE palette < 0 OR palette > 4;
UPDATE messages SET palette = 0 WHERE palette < 0 OR palette > 4;
UPDATE moments SET palette = 0 WHERE palette < 0 OR palette > 4;

ALTER TABLE posts
  ADD CONSTRAINT posts_palette_check CHECK (palette BETWEEN 0 AND 4);

ALTER TABLE messages
  ADD CONSTRAINT messages_palette_check CHECK (palette BETWEEN 0 AND 4);

ALTER TABLE moments
  ADD CONSTRAINT moments_palette_check CHECK (palette BETWEEN 0 AND 4);
