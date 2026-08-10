-- Lumina · fallback de transporte para publishers que bloqueiam/atrasam fetch direto.
-- Mantemos a identidade editorial do publisher e usamos um RSS de pesquisa por
-- domínio apenas como transporte de manchete/link. O artigo continua externo.

WITH fallback(name, feed_url, publisher_url) AS (
  VALUES
    ('SIC Notícias',
      'https://news.google.com/rss/search?q=site%3Asicnoticias.pt%20when%3A2d&hl=pt-PT&gl=PT&ceid=PT%3Apt-150',
      'https://sicnoticias.pt/'),
    ('Expresso',
      'https://news.google.com/rss/search?q=site%3Aexpresso.pt%20when%3A2d&hl=pt-PT&gl=PT&ceid=PT%3Apt-150',
      'https://expresso.pt/'),
    ('PÚBLICO',
      'https://news.google.com/rss/search?q=site%3Apublico.pt%20when%3A2d&hl=pt-PT&gl=PT&ceid=PT%3Apt-150',
      'https://www.publico.pt/'),
    ('Jornal de Notícias',
      'https://news.google.com/rss/search?q=site%3Ajn.pt%20when%3A2d&hl=pt-PT&gl=PT&ceid=PT%3Apt-150',
      'https://www.jn.pt/'),
    ('TSF',
      'https://news.google.com/rss/search?q=site%3Atsf.pt%20when%3A2d&hl=pt-PT&gl=PT&ceid=PT%3Apt-150',
      'https://www.tsf.pt/'),
    ('O Jogo',
      'https://news.google.com/rss/search?q=site%3Aojogo.pt%20when%3A2d&hl=pt-PT&gl=PT&ceid=PT%3Apt-150',
      'https://www.ojogo.pt/'),
    ('Renascença · Informação',
      'https://news.google.com/rss/search?q=site%3Arr.pt%20when%3A2d&hl=pt-PT&gl=PT&ceid=PT%3Apt-150',
      'https://rr.pt/')
)
UPDATE radar_sources rs
SET kind='rss',
    url=f.feed_url,
    default_type='news',
    active=true,
    trusted=true,
    config=COALESCE(rs.config,'{}'::jsonb) || jsonb_build_object(
      'transport','google-news-rss',
      'publisherUrl',f.publisher_url,
      'verified',true,
      'autoPublish',true,
      'maxItems',18,
      'maxAgeDays',3,
      'region','Portugal'
    ),
    etag=NULL,
    last_modified=NULL,
    last_fetched_at=NULL,
    last_success_at=NULL,
    last_fetch_error=NULL,
    last_item_count=0,
    updated_at=now()
FROM fallback f
WHERE rs.name=f.name;
