import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { migrate, pool, q } from '../src/db.js';
import { fetchPublicFeed, ingestRssSource, parseSyndicationFeed, resolvePublicFeedTarget, resolveRedirectUrl, withDeadline } from '../src/jobs/radar.js';

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Fonte Teste</title>
    <item>
      <title>Notícia &amp; segura</title>
      <link>https://news.example.test/story-1</link>
      <guid>story-1</guid>
      <pubDate>Sun, 09 Aug 2026 18:00:00 GMT</pubDate>
      <description><![CDATA[<p>Resumo <strong>limpo</strong> sem artigo completo.</p>]]></description>
      <media:thumbnail url="https://cdn.example.test/story-1.jpg" />
      <category>Tecnologia</category>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Teste</title>
  <entry>
    <title>Sinal Atom</title>
    <id>tag:example.test,2026:atom-1</id>
    <updated>2026-08-09T18:10:00Z</updated>
    <link rel="alternate" href="https://news.example.test/atom-1" />
    <summary>Resumo Atom</summary>
    <category term="Cultura" />
  </entry>
</feed>`;

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

test('parser normaliza RSS e Atom sem guardar HTML', () => {
  const rss = parseSyndicationFeed(RSS, { now: Date.parse('2026-08-09T19:00:00Z') });
  assert.equal(rss.length, 1);
  assert.equal(rss[0].title, 'Notícia & segura');
  assert.equal(rss[0].summary, 'Resumo limpo sem artigo completo.');
  assert.equal(rss[0].externalUrl, 'https://news.example.test/story-1');
  assert.equal(rss[0].imageUrl, 'https://cdn.example.test/story-1.jpg');
  assert.deepEqual(rss[0].tags, ['tecnologia']);

  const atom = parseSyndicationFeed(ATOM, { now: Date.parse('2026-08-09T19:00:00Z') });
  assert.equal(atom.length, 1);
  assert.equal(atom[0].title, 'Sinal Atom');
  assert.equal(atom[0].externalUrl, 'https://news.example.test/atom-1');
  assert.deepEqual(atom[0].tags, ['cultura']);
});

test('parser rejeita DTD/entidades de XML não confiável', () => {
  assert.throws(
    () => parseSyndicationFeed('<!DOCTYPE rss [<!ENTITY x "boom">]><rss><channel><item><title>&x;</title></item></channel></rss>'),
    /DTD\/entidades/
  );
});

test('GUID vazio cai para o link e não colide entre artigos', () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title>Um</title><guid>   </guid><link>https://example.test/um</link></item>
    <item><title>Dois</title><guid></guid><link>https://example.test/dois</link></item>
  </channel></rss>`;
  const entries = parseSyndicationFeed(xml, { now: Date.parse('2026-08-09T19:00:00Z') });
  assert.equal(entries.length, 2);
  assert.equal(entries[0].stableId, 'https://example.test/um');
  assert.equal(entries[1].stableId, 'https://example.test/dois');
  assert.notEqual(entries[0].stableId, entries[1].stableId);
});

test('entradas sem data não recebem um relógio novo a cada parse', () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title>Sem data</title><guid>sem-data-1</guid><link>https://example.test/sem-data</link></item>
    <item><title>Data inválida</title><guid>sem-data-2</guid><link>https://example.test/data-invalida</link><pubDate>isto-nao-e-data</pubDate></item>
  </channel></rss>`;
  const entries = parseSyndicationFeed(xml, { now: Date.parse('2026-08-09T19:00:00Z') });
  assert.equal(entries.length, 2);
  assert.equal(entries[0].publishedAt, null);
  assert.equal(entries[1].publishedAt, null);
});

test('redirect inválido vira erro controlado', () => {
  assert.throws(() => resolveRedirectUrl('http://[::1', 'https://example.test/feed'), /Redirect RSS inválido/);
});

test('resposta RSS truncada rejeita sem ficar pendurada', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/rss+xml', 'content-length': '500' });
    res.write('<rss><channel><item>');
    setTimeout(() => res.destroy(), 10);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  try {
    await assert.rejects(
      () => fetchPublicFeed(`http://127.0.0.1:${port}/feed`, {
        deadlineAt: Date.now() + 500,
        resolveTargetImpl: async (input) => ({ url: new URL(input), address: '127.0.0.1', family: 4 }),
      }),
      /interrompida|truncada/
    );
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('deadline cobre também uma resolução DNS bloqueada', async () => {
  const deadlineAt = Date.now() + 25;
  await assert.rejects(
    () => resolvePublicFeedTarget('https://feed.example.test/rss', {
      deadlineAt,
      lookup: () => new Promise(() => {}),
    }),
    /Timeout ao resolver DNS/
  );
  await assert.rejects(
    () => withDeadline(new Promise(() => {}), Date.now() + 25, 'deadline teste'),
    /deadline teste/
  );
});

test('validação SSRF bloqueia localhost e redes privadas antes do fetch', async () => {
  await assert.rejects(() => resolvePublicFeedTarget('http://localhost/feed.xml'), /privado/);
  await assert.rejects(() => resolvePublicFeedTarget('http://127.0.0.1/feed.xml'), /privada|reservada/);
  await assert.rejects(() => resolvePublicFeedTarget('https://10.20.30.40/feed.xml'), /privada|reservada/);
  await assert.rejects(() => resolvePublicFeedTarget('http://169.254.169.254/latest/meta-data'), /privada|reservada/);
});

test('ingestão preserva a data original quando o feed não fornece data', async () => {
  const sourceRow = await q(
    `INSERT INTO radar_sources (name, kind, url, default_type, active, trusted)
     VALUES ('Fonte sem data','rss','https://nodate.example.test/rss','news',true,true)
     RETURNING *`
  );
  const source = sourceRow.rows[0];
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title>Evergreen</title><guid>evergreen-1</guid><link>https://example.test/evergreen</link></item>
  </channel></rss>`;
  const fetchFeedImpl = async () => ({ notModified: false, text: xml, etag: null, lastModified: null });

  await ingestRssSource(source, { fetchFeedImpl });
  const inserted = await q('SELECT id FROM radar_items WHERE source_id=$1', [source.id]);
  assert.equal(inserted.rowCount, 1);

  await q("UPDATE radar_items SET published_at='2020-01-02T03:04:05Z' WHERE id=$1", [inserted.rows[0].id]);
  const refreshed = (await q('SELECT * FROM radar_sources WHERE id=$1', [source.id])).rows[0];
  await ingestRssSource(refreshed, { fetchFeedImpl });

  const afterRefresh = await q('SELECT published_at FROM radar_items WHERE id=$1', [inserted.rows[0].id]);
  assert.equal(new Date(afterRefresh.rows[0].published_at).toISOString(), '2020-01-02T03:04:05.000Z');
});

test('ingestão deduplica, auto-publica só fonte verificada e respeita arquivo', async () => {
  const trusted = await q(
    `INSERT INTO radar_sources (name, kind, url, default_type, active, trusted, config)
     VALUES ('Fonte verificada','rss','https://feed.example.test/rss','news',true,true,$1)
     RETURNING *`,
    [{ tags: ['Portugal'], priority: 7, maxItems: 10, maxAgeDays: 30 }]
  );
  const source = trusted.rows[0];
  const fetchFeedImpl = async () => ({ notModified: false, text: RSS, etag: '"v1"', lastModified: 'Sun, 09 Aug 2026 18:30:00 GMT' });

  const first = await ingestRssSource(source, { fetchFeedImpl });
  assert.equal(first.fetched, 1);
  let items = await q('SELECT * FROM radar_items WHERE source_id=$1', [source.id]);
  assert.equal(items.rowCount, 1);
  assert.equal(items.rows[0].status, 'published');
  assert.equal(items.rows[0].body, '');
  assert.equal(items.rows[0].priority, 7);
  assert.deepEqual(items.rows[0].tags.sort(), ['portugal', 'tecnologia']);

  const refreshedSource = (await q('SELECT * FROM radar_sources WHERE id=$1', [source.id])).rows[0];
  await ingestRssSource(refreshedSource, { fetchFeedImpl });
  items = await q('SELECT * FROM radar_items WHERE source_id=$1', [source.id]);
  assert.equal(items.rowCount, 1, 'o mesmo guid/link não pode duplicar');

  await q("UPDATE radar_items SET status='archived' WHERE id=$1", [items.rows[0].id]);
  await ingestRssSource(refreshedSource, { fetchFeedImpl });
  const archived = await q('SELECT status FROM radar_items WHERE id=$1', [items.rows[0].id]);
  assert.equal(archived.rows[0].status, 'archived');

  const untrusted = await q(
    `INSERT INTO radar_sources (name, kind, url, default_type, active, trusted)
     VALUES ('Fonte por rever','rss','https://other.example.test/rss','news',true,false)
     RETURNING *`
  );
  await ingestRssSource(untrusted.rows[0], { fetchFeedImpl });
  const draft = await q('SELECT status FROM radar_items WHERE source_id=$1', [untrusted.rows[0].id]);
  assert.equal(draft.rows[0].status, 'draft');

  const stats = await q(
    'SELECT last_success_at, last_fetch_error, last_item_count, etag FROM radar_sources WHERE id=$1',
    [source.id]
  );
  assert.ok(stats.rows[0].last_success_at);
  assert.equal(stats.rows[0].last_fetch_error, null);
  assert.equal(stats.rows[0].last_item_count, 1);
  assert.equal(stats.rows[0].etag, '"v1"');
});
