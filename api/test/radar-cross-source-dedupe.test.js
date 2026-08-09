import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, pool, q } from '../src/db.js';
import { canonicalArticleUrl, ingestRssSource } from '../src/jobs/radar.js';

const SOURCE_PREFIX = 'Radar Dedupe Test';
const ARTICLE_BASE = 'https://news.example.test/shared-story?id=42';

before(async () => {
  await migrate();
  await q(`DELETE FROM radar_items WHERE external_url LIKE 'https://news.example.test/shared-story%'`);
  await q(`DELETE FROM radar_sources WHERE name LIKE $1`, [`${SOURCE_PREFIX}%`]);
});

after(async () => {
  await q(`DELETE FROM radar_items WHERE external_url LIKE 'https://news.example.test/shared-story%'`).catch(() => {});
  await q(`DELETE FROM radar_sources WHERE name LIKE $1`, [`${SOURCE_PREFIX}%`]).catch(() => {});
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

async function createSource(name, url) {
  const { rows } = await q(
    `INSERT INTO radar_sources (name, kind, url, default_type, active, trusted, config)
     VALUES ($1, 'rss', $2, 'news', true, true, '{"autoPublish":true,"maxAgeDays":3}'::jsonb)
     RETURNING *`,
    [name, url]
  );
  return rows[0];
}

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

test('duas fontes RSS com GUIDs diferentes publicam uma só linha para a mesma notícia canónica', async () => {
  const sourceA = await createSource(`${SOURCE_PREFIX} A`, 'https://feed-a.example.test/rss');
  const sourceB = await createSource(`${SOURCE_PREFIX} B`, 'https://feed-b.example.test/rss');

  await ingestRssSource(sourceA, {
    fetchFeedImpl: async () => ({
      notModified: false,
      text: feed({
        guid: 'publisher-a-guid',
        link: `${ARTICLE_BASE}&utm_source=facebook#top`,
        title: 'Notícia partilhada A',
      }),
      etag: null,
      lastModified: null,
    }),
  });

  await ingestRssSource(sourceB, {
    fetchFeedImpl: async () => ({
      notModified: false,
      text: feed({
        guid: 'publisher-b-different-guid',
        link: `${ARTICLE_BASE}&fbclid=tracking-only`,
        title: 'Notícia partilhada B',
      }),
      etag: null,
      lastModified: null,
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
