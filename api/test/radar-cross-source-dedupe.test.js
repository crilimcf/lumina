import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, pool, q } from '../src/db.js';
import { canonicalArticleUrl, ingestRssSource } from '../src/jobs/radar.js';

const SOURCE_PREFIX = 'Radar Dedupe Test';
const ARTICLE_BASE = 'https://news.example.test/shared-story?id=42';
const TRUST_BASE = 'https://news.example.test/trust-story?id=9';

async function cleanFixtures() {
  await q(`DELETE FROM radar_items WHERE external_url LIKE 'https://news.example.test/shared-story%'`);
  await q(`DELETE FROM radar_items WHERE external_url LIKE 'https://news.example.test/trust-story%'`);
  await q(`DELETE FROM radar_sources WHERE name LIKE $1`, [`${SOURCE_PREFIX}%`]);
}

before(async () => {
  await migrate();
  await cleanFixtures();
});

after(async () => {
  await cleanFixtures().catch(() => {});
  await pool.end();
});

function feed({ guid, link, title }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0"><channel><title>Teste</title><item>
      <title>${title}</title>
      <guid>${guid}</guid>
      <link>${link.replaceAll('&', '&amp;')}</link>
      <pubDate>Sun, 09 Aug 2026 20:00:00 GMT</pubDate>
      <description>Resumo da mesma notícia.</description>
    </item></channel></rss>`;
}

async function createSource(name, url, trusted = true) {
  const { rows } = await q(
    `INSERT INTO radar_sources (name, kind, url, default_type, active, trusted, config)
     VALUES ($1, 'rss', $2, 'news', true, $3, '{"autoPublish":true,"maxAgeDays":3}'::jsonb)
     RETURNING *`,
    [name, url, trusted]
  );
  return rows[0];
}

const fetchFor = ({ guid, link, title }) => async () => ({
  notModified: false,
  text: feed({ guid, link, title }),
  etag: null,
  lastModified: null,
});

test('URL canónica remove apenas fragmento e parâmetros de tracking', () => {
  assert.equal(
    canonicalArticleUrl(`${ARTICLE_BASE}&utm_source=facebook&fbclid=abc#comentarios`),
    ARTICLE_BASE
  );
  assert.equal(canonicalArticleUrl(`${ARTICLE_BASE}&gclid=123`), ARTICLE_BASE);
  assert.equal(
    canonicalArticleUrl('https://news.example.test/shared-story?id=43'),
    'https://news.example.test/shared-story?id=43'
  );
});

test('duas fontes RSS verificadas com GUIDs diferentes publicam uma só linha para a mesma notícia canónica', async () => {
  const sourceA = await createSource(`${SOURCE_PREFIX} A`, 'https://feed-a.example.test/rss');
  const sourceB = await createSource(`${SOURCE_PREFIX} B`, 'https://feed-b.example.test/rss');

  await ingestRssSource(sourceA, {
    fetchFeedImpl: fetchFor({
      guid: 'publisher-a-guid',
      link: `${ARTICLE_BASE}&utm_source=facebook#top`,
      title: 'Notícia partilhada A',
    }),
  });

  await ingestRssSource(sourceB, {
    fetchFeedImpl: fetchFor({
      guid: 'publisher-b-different-guid',
      link: `${ARTICLE_BASE}&fbclid=tracking-only`,
      title: 'Notícia partilhada B',
    }),
  });

  const { rows } = await q(
    `SELECT id, title, external_url, source_id, status
       FROM radar_items
      WHERE external_url LIKE 'https://news.example.test/shared-story%'`
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].source_id, sourceA.id);
  assert.equal(rows[0].title, 'Notícia partilhada A');
  assert.equal(rows[0].status, 'published');

  const secondSource = await q('SELECT last_success_at, last_fetch_error FROM radar_sources WHERE id=$1', [sourceB.id]);
  assert.ok(secondSource.rows[0].last_success_at, 'a fonte duplicada continua marcada como sincronizada');
  assert.equal(secondSource.rows[0].last_fetch_error, null);
});

test('fonte não verificada não bloqueia nem altera a versão verificada da mesma URL', async () => {
  const untrusted = await createSource(`${SOURCE_PREFIX} Untrusted`, 'https://feed-untrusted.example.test/rss', false);
  const trusted = await createSource(`${SOURCE_PREFIX} Trusted`, 'https://feed-trusted.example.test/rss', true);

  await ingestRssSource(untrusted, {
    fetchFeedImpl: fetchFor({
      guid: 'untrusted-guid',
      link: `${TRUST_BASE}&utm_source=untrusted`,
      title: 'Versão por rever',
    }),
  });
  await ingestRssSource(trusted, {
    fetchFeedImpl: fetchFor({
      guid: 'trusted-guid',
      link: `${TRUST_BASE}&fbclid=trusted-tracking`,
      title: 'Versão verificada',
    }),
  });

  const { rows } = await q(
    `SELECT source_id, title, status
       FROM radar_items
      WHERE external_url LIKE 'https://news.example.test/trust-story%'
      ORDER BY status`
  );

  assert.equal(rows.length, 2, 'trust levels diferentes não devem partilhar a mesma linha');
  const draft = rows.find(row => row.status === 'draft');
  const published = rows.find(row => row.status === 'published');
  assert.equal(draft?.source_id, untrusted.id);
  assert.equal(draft?.title, 'Versão por rever');
  assert.equal(published?.source_id, trusted.id);
  assert.equal(published?.title, 'Versão verificada');
});
