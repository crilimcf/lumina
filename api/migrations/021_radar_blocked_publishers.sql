-- Lumina · Radar publisher access policy
-- Estes publishers estão verificados e permanecem no catálogo, mas respondem
-- explicitamente HTTP 403 ao coletor identificado da Lumina. Não tentamos
-- contornar WAF/robots mudando para um User-Agent enganador.

UPDATE radar_sources
SET active=false,
    config = COALESCE(config,'{}'::jsonb)
      || '{"verified":true,"integrationStatus":"publisher_blocks_automated_access","manualAllowed":true}'::jsonb,
    last_fetch_error=NULL,
    updated_at=now()
WHERE name IN (
  'SIC Notícias',
  'PÚBLICO',
  'Expresso',
  'Jornal de Notícias',
  'TSF',
  'O Jogo'
)
AND kind='partner'
AND config->>'adapter'='headline-links';
