import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, pool, q } from '../src/db.js';
import { assertRtpFeedUrl, parseRtpRss, runRadarIngestion } from '../src/jobs/radar.js';

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>RTP Notícias</title>
    <item>
      <title><![CDATA[Notícia &amp; teste]]></title>
      <description><![CDATA[<p>Resumo <b>seguro</b> da notícia.</p>]]></description>
      <link>https://www.rtp.pt/noticias/pais/noticia-um_d123456</link>
      <guid>rtp-123456</guid>
      <pubDate>Sun, 09 Aug 2026 18:00:00 GMT</pubDate>
      <category>País</category>
    </item>
    <item>
      <title>Segunda notícia</title>
      <description>Outro resumo</description>
      <link>https://www.rtp.pt/noticias/economia/noticia-dois_d123457</link>
      <guid>rtp-123457</guid>
      <pubDate>Sun, 09 Aug 2026 17:30:00 GMT</pubDate>
      <category>Economia</category>
    </item>
  </channel>
</rss>`;

before(async () => {
  await migrate();
  const { rows } = await q(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`
  );
  if (rows.length) {
    const tables = rows.map(({ tablename }) => `"${String(tablename).replaceAll('"', '""')}"`).join(', ');
    await q(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  }
});

after(async () => {
  await pool.end();
});

test('RTP RSS fica limitado a HTTPS, host e secções autorizadas', () => {
  assert.equal(assertRtpFeedUrl('https://www.rtp.pt/noticias/rss'), 'https://www.rtp.pt/noticias/rss');
  assert.equal(assertRtpFeedUrl('https://www.rtp.pt/noticias/rss/economia'), 'https://www.rtp.pt/noticias/rss/economia');
  assert.throws(() => assertRtpFeedUrl('http://www.rtp.pt/noticias/rss'), /não autorizada/);
  assert.throws(() => assertRtpFeedUrl('https://evil.example/noticias/rss'), /não autorizada/);
  assert.throws(() => assertRtpFeedUrl('https://www.rtp.pt/noticias/rss?redirect=http://127.0.0.1'), /não autorizada/);
  assert.throws(() => assertRtpFeedUrl('https://www.rtp.pt/noticias/rss/outra'), /não autorizada/);
});

test('parser RTP extrai apenas metadados limpos e links RTP', () => {
  const items = parseRtpRss(SAMPLE_RSS);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Notícia & teste');
  assert.equal(items[0].summary, 'Resumo seguro da notícia.');
  assert.equal(items[0].category, 'País');
  assert.match(items[0].link, /^https:\/\/www\.rtp\.pt\//);

  const hostile = SAMPLE_RSS.replace(
    'https://www.rtp.pt/noticias/pais/noticia-um_d123456',
    'https://evil.example/noticia'
  );
  assert.equal(parseRtpRss(hostile).length, 1);
});

test('coletor RTP deduplica, atualiza saúde da fonte e não cria conteúdo patrocinado', async () => {
  const { rows: sources } = await q(
    `INSERT INTO radar_sources (name, kind, url, default_type, active, trusted, config)
     VALUES ('RTP Notícias','rss','https://www.rtp.pt/noticias/rss','news',true,true,$1)
     RETURNING *`,
    [{ provider: 'rtp', region: 'PT', maxItems: 30 }]
  );
  const source = sources[0];
  let requests = 0;
  const fetchImpl = async (url, options) => {
    requests += 1;
    assert.equal(url, 'https://www.rtp.pt/noticias/rss');
    assert.equal(options.redirect, 'manual');
    return new Response(SAMPLE_RSS, {
      status: 200,
      headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
    });
  };

  const first = await runRadarIngestion({ fetchImpl });
  assert.deepEqual(first, { sources: 1, fetched: 2, upserted: 2, failures: 0 });
  const second = await runRadarIngestion({ fetchImpl });
  assert.equal(second.failures, 0);
  assert.equal(requests, 2);

  const { rows: items } = await q(
    `SELECT type, title, summary, body, external_url, source_name, sponsored, region, fingerprint
     FROM radar_items ORDER BY published_at DESC`
  );
  assert.equal(items.length, 2, 'o mesmo feed não pode criar duplicados');
  assert.equal(items[0].type, 'news');
  assert.equal(items[0].source_name, 'RTP Notícias');
  assert.equal(items[0].sponsored, false);
  assert.equal(items[0].body, '');
  assert.equal(items[0].region, 'PT');
  assert.match(items[0].fingerprint, /^rtp:[a-f0-9]{64}$/);

  const { rows: health } = await q(
    `SELECT last_fetched_at, last_success_at, last_error, consecutive_failures
     FROM radar_sources WHERE id=$1`,
    [source.id]
  );
  assert.ok(health[0].last_fetched_at);
  assert.ok(health[0].last_success_at);
  assert.equal(health[0].last_error, null);
  assert.equal(health[0].consecutive_failures, 0);
});

test('falha de validação da fonte fica registada sem derrubar o ciclo inteiro', async () => {
  await q(
    `UPDATE radar_sources
     SET url='https://www.rtp.pt/noticias/rss?unsafe=1'
     WHERE config->>'provider'='rtp'`
  );
  const out = await runRadarIngestion({ fetchImpl: async () => { throw new Error('não devia chamar fetch'); } });
  assert.equal(out.sources, 1);
  assert.equal(out.failures, 1);

  const { rows } = await q(
    `SELECT last_error, consecutive_failures FROM radar_sources WHERE config->>'provider'='rtp'`
  );
  assert.match(rows[0].last_error, /não autorizada/);
  assert.equal(rows[0].consecutive_failures, 1);
});
