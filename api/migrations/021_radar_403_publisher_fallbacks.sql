-- Lumina · recovery for publishers that explicitly reject direct server fetches.
-- We do not spoof a browser or bypass the publisher's 403. Instead, use a
-- news-search RSS feed constrained to the publisher domain as the transport for
-- recent headline/link metadata. The publisher remains clearly attributed and
-- the full article stays on the external news surface.

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
    config=(COALESCE(rs.config,'{}'::jsonb) - 'adapter' - 'maxLiveHours') || jsonb_build_object(
      'transport','news-search-rss',
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
