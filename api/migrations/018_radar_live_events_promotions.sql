-- Lumina · conteúdo Radar real e verificável para Eventos/Promoções.
-- Estes itens apontam sempre para a fonte externa e NÃO são classificados como patrocinados.

WITH live_items(type,title,summary,external_url,source_name,source_url,region,starts_at,ends_at,priority,fingerprint) AS (
  VALUES
    (
      'event',
      'Festival Altitudes 2026',
      'Teatro, música e criação cultural na aldeia de Campo Benfeito, em plena Serra de Montemuro. Edição de 8 a 15 de agosto.',
      'https://www.e-cultura.pt/',
      'e-cultura',
      'https://www.e-cultura.pt/',
      'Campo Benfeito',
      '2026-08-08 00:00:00+01'::timestamptz,
      '2026-08-15 23:59:59+01'::timestamptz,
      24,
      'verified:event:altitudes-2026'
    ),
    (
      'event',
      '18ª Edição das Palavras Andarilhas',
      'Festa da Palavra Contada organizada pela Câmara Municipal de Beja, de 28 a 30 de agosto, no Jardim Público de Beja.',
      'https://www.e-cultura.pt/',
      'e-cultura',
      'https://www.e-cultura.pt/',
      'Beja',
      '2026-08-28 00:00:00+01'::timestamptz,
      '2026-08-30 23:59:59+01'::timestamptz,
      22,
      'verified:event:palavras-andarilhas-2026'
    ),
    (
      'event',
      'Canoagem e Caminhada no Parque Natural da Arrábida',
      'Atividade de caminhada e canoagem na região de Setúbal e Parque Natural da Arrábida, marcada para 23 de agosto às 09h30.',
      'https://www.e-cultura.pt/',
      'e-cultura',
      'https://www.e-cultura.pt/',
      'Setúbal',
      '2026-08-23 09:30:00+01'::timestamptz,
      '2026-08-23 20:00:00+01'::timestamptz,
      20,
      'verified:event:arrabida-canoagem-2026-08-23'
    ),
    (
      'promotion',
      'Oportunidades da semana no Continente',
      'Seleção oficial do Continente Online com oportunidades, campanhas e produtos em promoção atualizados ao longo da semana.',
      'https://www.continente.pt/oportunidades/',
      'Continente',
      'https://www.continente.pt/oportunidades/',
      'Portugal',
      NULL,
      NULL,
      18,
      'verified:promotion:continente-oportunidades'
    ),
    (
      'promotion',
      '10€ na primeira subscrição da Newsletter Worten',
      'A Worten anuncia 10€ de desconto para novas subscrições da newsletter, em compras superiores a 50€. Não acumulável com outras promoções e exclui pré-vendas.',
      'https://www.worten.pt/newsletter',
      'Worten',
      'https://www.worten.pt/newsletter',
      'Portugal',
      NULL,
      NULL,
      17,
      'verified:promotion:worten-newsletter-10eur'
    ),
    (
      'promotion',
      'Dezcontão — desconto extra em talão',
      'Campanha oficial Worten com desconto extra em talão. Consulta na fonte as condições e produtos abrangidos antes de comprar.',
      'https://www.worten.pt/promocoes/dezcontao',
      'Worten',
      'https://www.worten.pt/promocoes/dezcontao',
      'Portugal',
      NULL,
      NULL,
      16,
      'verified:promotion:worten-dezcontao'
    )
)
INSERT INTO radar_items (
  type,title,summary,body,external_url,source_name,source_url,sponsored,tags,region,
  starts_at,ends_at,published_at,status,priority,fingerprint
)
SELECT
  type,title,summary,'',external_url,source_name,source_url,false,
  CASE WHEN type='event' THEN ARRAY['portugal','eventos']::text[] ELSE ARRAY['portugal','promocoes']::text[] END,
  region,starts_at,ends_at,now(),'published',priority,fingerprint
FROM live_items
ON CONFLICT (fingerprint) DO UPDATE SET
  title=EXCLUDED.title,
  summary=EXCLUDED.summary,
  external_url=EXCLUDED.external_url,
  source_name=EXCLUDED.source_name,
  source_url=EXCLUDED.source_url,
  region=EXCLUDED.region,
  starts_at=EXCLUDED.starts_at,
  ends_at=EXCLUDED.ends_at,
  priority=EXCLUDED.priority,
  status='published',
  updated_at=now();
