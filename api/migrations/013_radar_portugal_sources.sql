-- Lumina · Radar Portugal source pack
-- Usa apenas feeds RSS públicos conhecidos para ingestão automática.
-- Os meios sem endpoint RSS/API validado ficam no catálogo, inativos, até existir conector oficial.

-- Guarda a classe de confiança/publicação usada pelo dedupe. Para itens antigos,
-- o estado efetivo do próprio item tem precedência sobre configurações atuais da fonte.
ALTER TABLE radar_items ADD COLUMN IF NOT EXISTS ingestion_trusted BOOLEAN;
ALTER TABLE radar_items ADD COLUMN IF NOT EXISTS ingestion_publishable BOOLEAN;

UPDATE radar_items ri
SET ingestion_trusted = CASE
      WHEN ri.status = 'published' THEN true
      ELSE rs.trusted
    END,
    ingestion_publishable = CASE
      WHEN ri.status = 'published' THEN true
      WHEN ri.status = 'draft' THEN false
      ELSE rs.trusted AND (rs.config->'autoPublish' IS DISTINCT FROM 'false'::jsonb)
    END
FROM radar_sources rs
WHERE ri.source_id = rs.id
  AND ri.fingerprint LIKE 'rss:%'
  AND (ri.ingestion_trusted IS NULL OR ri.ingestion_publishable IS NULL);

-- Compatibilidade de rolling deploy: instâncias antigas não conhecem as novas colunas.
-- O trigger classifica INSERTs e também reconcilia mudanças de status feitas pelo PATCH legado.
CREATE OR REPLACE FUNCTION radar_fill_ingestion_policy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_trusted boolean := false;
  source_auto_publish boolean := false;
BEGIN
  IF NEW.fingerprint LIKE 'rss:%' THEN
    IF TG_OP = 'UPDATE' THEN
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status = 'published' THEN
          NEW.ingestion_trusted := true;
          NEW.ingestion_publishable := true;
        ELSIF NEW.status = 'draft' THEN
          NEW.ingestion_publishable := false;
        END IF;
        -- Ao arquivar preserva-se a classe anterior para bloquear siblings futuros.
      END IF;
    END IF;

    IF NEW.ingestion_trusted IS NULL OR NEW.ingestion_publishable IS NULL THEN
      SELECT rs.trusted,
             (rs.config->'autoPublish' IS DISTINCT FROM 'false'::jsonb)
        INTO source_trusted, source_auto_publish
        FROM radar_sources rs
       WHERE rs.id = NEW.source_id;

      IF NEW.ingestion_trusted IS NULL THEN
        NEW.ingestion_trusted := CASE
          WHEN NEW.status = 'published' THEN true
          ELSE COALESCE(source_trusted, false)
        END;
      END IF;

      IF NEW.ingestion_publishable IS NULL THEN
        NEW.ingestion_publishable := CASE
          WHEN NEW.status = 'published' THEN true
          WHEN NEW.status = 'draft' THEN false
          ELSE COALESCE(source_trusted, false) AND COALESCE(source_auto_publish, false)
        END;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS radar_fill_ingestion_policy_before_insert ON radar_items;
DROP TRIGGER IF EXISTS radar_reconcile_ingestion_policy_before_status_update ON radar_items;
CREATE TRIGGER radar_fill_ingestion_policy_before_insert
BEFORE INSERT ON radar_items
FOR EACH ROW
EXECUTE FUNCTION radar_fill_ingestion_policy();
CREATE TRIGGER radar_reconcile_ingestion_policy_before_status_update
BEFORE UPDATE OF status ON radar_items
FOR EACH ROW
EXECUTE FUNCTION radar_fill_ingestion_policy();

WITH source_pack(name, kind, url, default_type, active, trusted, config) AS (
  VALUES
    ('RTP Notícias · País', 'rss', 'https://www.rtp.pt/noticias/rss/pais', 'news', true, true,
      '{"maxItems":14,"maxAgeDays":3,"priority":18,"autoPublish":true,"region":"Portugal","tags":["portugal","rtp","pais"]}'::jsonb),
    ('RTP Notícias · Mundo', 'rss', 'https://www.rtp.pt/noticias/rss/mundo', 'news', true, true,
      '{"maxItems":12,"maxAgeDays":3,"priority":16,"autoPublish":true,"region":"Portugal","tags":["rtp","mundo"]}'::jsonb),
    ('RTP Notícias · Desporto', 'rss', 'https://www.rtp.pt/noticias/rss/desporto', 'news', true, true,
      '{"maxItems":12,"maxAgeDays":3,"priority":15,"autoPublish":true,"region":"Portugal","tags":["rtp","desporto"]}'::jsonb),
    ('RTP Notícias · Economia', 'rss', 'https://www.rtp.pt/noticias/rss/economia', 'news', true, true,
      '{"maxItems":10,"maxAgeDays":4,"priority":14,"autoPublish":true,"region":"Portugal","tags":["rtp","economia"]}'::jsonb),
    ('RTP Notícias · Cultura', 'rss', 'https://www.rtp.pt/noticias/rss/cultura', 'news', true, true,
      '{"maxItems":10,"maxAgeDays":5,"priority":12,"autoPublish":true,"region":"Portugal","tags":["rtp","cultura"]}'::jsonb),
    ('RTP Notícias · Vídeos', 'rss', 'https://www.rtp.pt/noticias/rss/videos', 'news', true, true,
      '{"maxItems":10,"maxAgeDays":3,"priority":11,"autoPublish":true,"region":"Portugal","tags":["rtp","video"]}'::jsonb),

    ('CNN Portugal', 'rss', 'https://cnnportugal.iol.pt/rss.xml', 'news', true, true,
      '{"maxItems":18,"maxAgeDays":3,"priority":18,"autoPublish":true,"region":"Portugal","tags":["portugal","cnn-portugal","tvi"]}'::jsonb),
    ('MaisFutebol', 'rss', 'https://maisfutebol.iol.pt/rss.xml', 'news', true, true,
      '{"maxItems":14,"maxAgeDays":3,"priority":14,"autoPublish":true,"region":"Portugal","tags":["maisfutebol","tvi","desporto","futebol"]}'::jsonb),
    ('ECO', 'rss', 'https://eco.sapo.pt/feed/feed', 'news', true, true,
      '{"maxItems":14,"maxAgeDays":4,"priority":13,"autoPublish":true,"region":"Portugal","tags":["eco","economia","negocios"]}'::jsonb),

    ('Observador · País', 'rss', 'https://observador.pt/seccao/pais/feed', 'news', true, true,
      '{"maxItems":12,"maxAgeDays":3,"priority":12,"autoPublish":true,"region":"Portugal","tags":["observador","pais"]}'::jsonb),
    ('Observador · Mundo', 'rss', 'https://observador.pt/seccao/mundo/feed', 'news', true, true,
      '{"maxItems":10,"maxAgeDays":3,"priority":11,"autoPublish":true,"region":"Portugal","tags":["observador","mundo"]}'::jsonb),
    ('Observador · Ciência', 'rss', 'https://observador.pt/seccao/ciencia/feed', 'news', true, true,
      '{"maxItems":8,"maxAgeDays":5,"priority":9,"autoPublish":true,"region":"Portugal","tags":["observador","ciencia","tecnologia"]}'::jsonb),
    ('Observador · Lifestyle', 'rss', 'https://observador.pt/seccao/lifestyle/feed', 'news', true, true,
      '{"maxItems":8,"maxAgeDays":5,"priority":8,"autoPublish":true,"region":"Portugal","tags":["observador","lifestyle","entretenimento"]}'::jsonb),

    -- Catálogo preparado. Não é consultado pelo scheduler enquanto não houver feed/API oficial validado.
    ('SIC Notícias', 'manual', 'https://sicnoticias.pt/rss', 'news', false, true,
      '{"region":"Portugal","status":"official_feed_endpoint_required","tags":["sic-noticias","sic"]}'::jsonb),
    ('TVI', 'manual', 'https://tvi.iol.pt/', 'news', false, true,
      '{"region":"Portugal","status":"official_feed_or_api_required","tags":["tvi","entretenimento"]}'::jsonb),
    ('PÚBLICO', 'manual', 'https://www.publico.pt/', 'news', false, true,
      '{"region":"Portugal","status":"official_feed_or_api_required","tags":["publico"]}'::jsonb),
    ('Expresso', 'manual', 'https://expresso.pt/', 'news', false, true,
      '{"region":"Portugal","status":"official_feed_or_api_required","tags":["expresso"]}'::jsonb),
    ('Jornal de Notícias', 'manual', 'https://www.jn.pt/', 'news', false, true,
      '{"region":"Portugal","status":"official_feed_or_api_required","tags":["jn"]}'::jsonb),
    ('Diário de Notícias', 'manual', 'https://www.dn.pt/', 'news', false, true,
      '{"region":"Portugal","status":"official_feed_or_api_required","tags":["dn"]}'::jsonb),
    ('Correio da Manhã', 'manual', 'https://www.cmjornal.pt/', 'news', false, true,
      '{"region":"Portugal","status":"official_feed_or_api_required","tags":["cm"]}'::jsonb),
    ('Record', 'manual', 'https://www.record.pt/', 'news', false, true,
      '{"region":"Portugal","status":"official_feed_or_api_required","tags":["record","desporto"]}'::jsonb),
    ('A Bola', 'manual', 'https://www.abola.pt/', 'news', false, true,
      '{"region":"Portugal","status":"official_feed_or_api_required","tags":["abola","desporto"]}'::jsonb),
    ('O Jogo', 'manual', 'https://www.ojogo.pt/', 'news', false, true,
      '{"region":"Portugal","status":"official_feed_or_api_required","tags":["ojogo","desporto"]}'::jsonb),
    ('Notícias ao Minuto', 'manual', 'https://www.noticiasaominuto.com/', 'news', false, true,
      '{"region":"Portugal","status":"official_feed_or_api_required","tags":["noticias-ao-minuto"]}'::jsonb)
)
INSERT INTO radar_sources (name, kind, url, default_type, active, trusted, config)
SELECT name, kind, url, default_type, active, trusted, config
FROM source_pack incoming
WHERE NOT EXISTS (
  SELECT 1
  FROM radar_sources existing
  WHERE existing.url = incoming.url
);
