-- Lumina · publisher recovery after explicit HTTP 403
-- Direct fetch remains disabled for these publishers. We re-enable their Radar
-- presence through a recent news-search RSS constrained to each publisher domain.
-- This does not impersonate a browser or bypass the publisher's HTTP 403.

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
      'https://www.ojogo.pt/')
)
UPDATE radar_sources rs
SET kind='rss',
    url=f.feed_url,
    default_type='news',
    active=true,
    trusted=true,
    config=(COALESCE(rs.config,'{}'::jsonb)
      - 'adapter'
      - 'maxLiveHours'
      - 'integrationStatus'
      - 'manualAllowed')
      || jsonb_build_object(
        'transport','news-search-rss',
        'publisherUrl',f.publisher_url,
        'verified',true,
        'autoPublish',true,
        'maxItems',18,
        'maxAgeDays',3,
        'priority',COALESCE((rs.config->>'priority')::int,14),
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
