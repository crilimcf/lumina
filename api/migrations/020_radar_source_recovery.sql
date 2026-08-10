-- Lumina · Radar source recovery
-- O endpoint RSS legado da Renascença deixou de responder de forma fiável no
-- runtime de produção. A página oficial /ultimas é pública e mantém a mesma
-- origem editorial; usamos o adapter headline-links que só guarda manchete/link.

UPDATE radar_sources
SET kind='partner',
    url='https://rr.pt/ultimas',
    active=true,
    trusted=true,
    config = COALESCE(config,'{}'::jsonb)
      || '{"adapter":"headline-links","maxItems":16,"maxLiveHours":72,"priority":14,"region":"Portugal","verified":true,"autoPublish":true,"tags":["renascenca","rr","portugal"]}'::jsonb,
    etag=NULL,
    last_modified=NULL,
    last_fetch_error=NULL,
    updated_at=now()
WHERE name='Renascença · Informação';
