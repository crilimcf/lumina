-- Lumina · Radar RSS timestamp stability
-- A data de publicação de um item RSS representa a data/primeira descoberta original.
-- Re-sincronizações podem atualizar metadados, mas nunca devem tornar conteúdo antigo "novo".

CREATE OR REPLACE FUNCTION radar_preserve_rss_published_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.fingerprint LIKE 'rss:%'
     AND NEW.published_at IS DISTINCT FROM OLD.published_at THEN
    NEW.published_at := OLD.published_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS radar_items_preserve_rss_published_at ON radar_items;
CREATE TRIGGER radar_items_preserve_rss_published_at
BEFORE UPDATE OF published_at ON radar_items
FOR EACH ROW
EXECUTE FUNCTION radar_preserve_rss_published_at();
