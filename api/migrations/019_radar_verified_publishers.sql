-- Lumina · Radar verified publisher adapters
-- RSS continua preferido; `web` serve apenas para manchetes/link das páginas oficiais.

ALTER TABLE radar_sources DROP CONSTRAINT IF EXISTS radar_sources_kind_check;
ALTER TABLE radar_sources ADD CONSTRAINT radar_sources_kind_check
  CHECK (kind IN ('manual','rss','web','api','partner'));

-- Renascença disponibiliza RSS oficial para Informação.
INSERT INTO radar_sources (name, kind, url, default_type, active, trusted, config)
VALUES (
  'Renascença · Informação', 'rss', 'https://rr.pt/rss/rssfeed.aspx?section=section_noticias',
  'news', true, true,
  '{"maxItems":16,"maxAgeDays":3,"priority":14,"autoPublish":true,"region":"Portugal","verified":true,"tags":["renascenca","rr","portugal"]}'::jsonb
)
ON CONFLICT DO NOTHING;

-- Converte o catálogo existente em adaptadores web oficiais. Estes adaptadores
-- só recolhem manchete/link público; o corpo integral continua no publisher.
WITH verified(name, url, priority) AS (
  VALUES
    ('SIC Notícias', 'https://sicnoticias.pt/ultimas', 20),
    ('TVI', 'https://tvi.iol.pt/', 17),
    ('PÚBLICO', 'https://www.publico.pt/', 18),
    ('Expresso', 'https://expresso.pt/', 18),
    ('Jornal de Notícias', 'https://www.jn.pt/', 16),
    ('Diário de Notícias', 'https://www.dn.pt/', 15),
    ('TSF', 'https://www.tsf.pt/', 15),
    ('Correio da Manhã', 'https://www.cmjornal.pt/', 14),
    ('Record', 'https://www.record.pt/', 13),
    ('A Bola', 'https://www.abola.pt/', 13),
    ('O Jogo', 'https://www.ojogo.pt/', 13),
    ('Notícias ao Minuto', 'https://www.noticiasaominuto.com/', 13)
)
UPDATE radar_sources rs
SET kind='web', url=v.url, active=true, trusted=true,
    config = COALESCE(rs.config,'{}'::jsonb)
      || jsonb_build_object(
        'adapter','headline-links',
        'maxItems',14,
        'maxLiveHours',72,
        'priority',v.priority,
        'region','Portugal',
        'verified',true,
        'autoPublish',true
      ),
    updated_at=now()
FROM verified v
WHERE rs.name=v.name;

-- Insere os que não existiam no catálogo anterior (por exemplo TSF).
WITH verified(name, url, priority) AS (
  VALUES
    ('SIC Notícias', 'https://sicnoticias.pt/ultimas', 20),
    ('TVI', 'https://tvi.iol.pt/', 17),
    ('PÚBLICO', 'https://www.publico.pt/', 18),
    ('Expresso', 'https://expresso.pt/', 18),
    ('Jornal de Notícias', 'https://www.jn.pt/', 16),
    ('Diário de Notícias', 'https://www.dn.pt/', 15),
    ('TSF', 'https://www.tsf.pt/', 15),
    ('Correio da Manhã', 'https://www.cmjornal.pt/', 14),
    ('Record', 'https://www.record.pt/', 13),
    ('A Bola', 'https://www.abola.pt/', 13),
    ('O Jogo', 'https://www.ojogo.pt/', 13),
    ('Notícias ao Minuto', 'https://www.noticiasaominuto.com/', 13)
)
INSERT INTO radar_sources (name, kind, url, default_type, active, trusted, config)
SELECT v.name,'web',v.url,'news',true,true,
       jsonb_build_object(
         'adapter','headline-links','maxItems',14,'maxLiveHours',72,
         'priority',v.priority,'region','Portugal','verified',true,'autoPublish',true
       )
FROM verified v
WHERE NOT EXISTS (SELECT 1 FROM radar_sources rs WHERE rs.name=v.name);
