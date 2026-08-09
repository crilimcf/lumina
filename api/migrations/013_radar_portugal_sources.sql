-- Lumina · Radar Portugal source pack
-- Usa apenas feeds RSS públicos conhecidos para ingestão automática.
-- Os meios sem endpoint RSS/API validado ficam no catálogo, inativos, até existir conector oficial.

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
