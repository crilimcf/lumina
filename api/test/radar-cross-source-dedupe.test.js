import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, pool, q } from '../src/db.js';
import { canonicalArticleUrl, ingestRssSource } from '../src/jobs/radar.js';

const SOURCE_PREFIX = 'Radar Dedupe Test';
const ARTICLE_BASE = 'https://news.example.test/shared-story?id=42';
const TRUST_BASE = 'https://news.example.test/trust-story?id=9';
const POLICY_BASE = 'https://news.example.test/policy-story?id=7';
const MUTATION_BASE = 'https://news.example.test/mutation-story?id=5';
const ARCHIVE_BASE = 'https://news.example.test/archived-story?id=3';

async function cleanFixtures() {
  await q(`DELETE FROM radar_items WHERE external_url LIKE 'https://news.example.test/shared-story%'`);
  await q(`DELETE FROM radar_items WHERE external_url LIKE 'https://news.example.test/trust-story%'`);
  await q(`DELETE FROM radar_items WHERE external_url LIKE 'https://news.example.test/policy-story%'`);
  await q(`DELETE FROM radar_items WHERE external_url LIKE 'https://news.example.test/mutation-story%'`);
  await q(`DELETE FROM radar_items WHERE external_url LIKE 'https://news.example.test/archived-story%'`);
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
  const recentDate = new Date(Date.now() - 60_000).toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0"><channel><title>Teste</title><item>
      <title>${title}</title>
      <guid>${guid}</guid>
      <link>${link.replaceAll('&', '&amp;')}</link>
      <pubDate>${recentDate}</pubDate>
      <description>Resumo da mesma notícia.</description>
    </item></channel></rss>`;
}

async function createSource(name, url, { trusted = true, autoPublish = true } = {}) {
  const { rows } = await q(
    `INSERT INTO radar_sources (name, kind, url, default_type, active, trusted, config)
     VALUES ($1, 'rss', $2, 'news', true, $3, $4)
     RETURNING *`,
    [name, url, trusted, { autoPublish, maxAgeDays: 3 }]
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
    fetchFeedImpl: fetchFor({ guid: 'publisher-a-guid', link: `${ARTICLE_BASE}&utm_source=facebook#top`, title: 'Notícia partilhada A' }),
  });
  await ingestRssSource(sourceB, {
    fetchFeedImpl: fetchFor({ guid: 'publisher-b-different-guid', link: `${ARTICLE_BASE}&fbclid=tracking-only`, title: 'Notícia partilhada B' }),
  });

  const { rows } = await q(
    `SELECT id, title, external_url, source_id, status, ingestion_trusted, ingestion_publishable
       FROM radar_items WHERE external_url LIKE 'https://news.example.test/shared-story%'`
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source_id, sourceA.id);
  assert.equal(rows[0].title, 'Notícia partilhada A');
  assert.equal(rows[0].status, 'published');
  assert.equal(rows[0].ingestion_trusted, true);
  assert.equal(rows[0].ingestion_publishable, true);

  const secondSource = await q('SELECT last_success_at, last_fetch_error FROM radar_sources WHERE id=$1', [sourceB.id]);
  assert.ok(secondSource.rows[0].last_success_at);
  assert.equal(secondSource.rows[0].last_fetch_error, null);
});

test('fonte não verificada não bloqueia nem altera a versão verificada da mesma URL', async () => {
  const untrusted = await createSource(`${SOURCE_PREFIX} Untrusted`, 'https://feed-untrusted.example.test/rss', { trusted: false });
  const trusted = await createSource(`${SOURCE_PREFIX} Trusted`, 'https://feed-trusted.example.test/rss', { trusted: true });

  await ingestRssSource(untrusted, { fetchFeedImpl: fetchFor({ guid: 'untrusted-guid', link: `${TRUST_BASE}&utm_source=untrusted`, title: 'Versão por rever' }) });
  await ingestRssSource(trusted, { fetchFeedImpl: fetchFor({ guid: 'trusted-guid', link: `${TRUST_BASE}&fbclid=trusted-tracking`, title: 'Versão verificada' }) });

  const { rows } = await q(
    `SELECT source_id, title, status, ingestion_trusted, ingestion_publishable
       FROM radar_items WHERE external_url LIKE 'https://news.example.test/trust-story%' ORDER BY status`
  );
  assert.equal(rows.length, 2);
  const draft = rows.find(row => row.status === 'draft');
  const published = rows.find(row => row.status === 'published');
  assert.equal(draft?.source_id, untrusted.id);
  assert.equal(draft?.ingestion_trusted, false);
  assert.equal(draft?.ingestion_publishable, false);
  assert.equal(published?.source_id, trusted.id);
  assert.equal(published?.ingestion_trusted, true);
  assert.equal(published?.ingestion_publishable, true);
});

test('fonte trusted em revisão manual não bloqueia sibling trusted com autoPublish ativo', async () => {
  const manualReview = await createSource(`${SOURCE_PREFIX} Manual Review`, 'https://feed-review.example.test/rss', { trusted: true, autoPublish: false });
  const autoPublish = await createSource(`${SOURCE_PREFIX} Auto Publish`, 'https://feed-auto.example.test/rss', { trusted: true, autoPublish: true });

  await ingestRssSource(manualReview, { fetchFeedImpl: fetchFor({ guid: 'manual-review-guid', link: `${POLICY_BASE}&utm_source=manual`, title: 'Versão em revisão manual' }) });
  await ingestRssSource(autoPublish, { fetchFeedImpl: fetchFor({ guid: 'auto-publish-guid', link: `${POLICY_BASE}&fbclid=auto`, title: 'Versão publicável' }) });

  const { rows } = await q(
    `SELECT source_id, title, status, ingestion_trusted, ingestion_publishable
       FROM radar_items WHERE external_url LIKE 'https://news.example.test/policy-story%' ORDER BY status`
  );
  assert.equal(rows.length, 2);
  const draft = rows.find(row => row.status === 'draft');
  const published = rows.find(row => row.status === 'published');
  assert.equal(draft?.source_id, manualReview.id);
  assert.equal(draft?.ingestion_trusted, true);
  assert.equal(draft?.ingestion_publishable, false);
  assert.equal(published?.source_id, autoPublish.id);
  assert.equal(published?.ingestion_trusted, true);
  assert.equal(published?.ingestion_publishable, true);
});

test('alterar a política da fonte depois da ingestão não reclassifica o dedupe do item antigo', async () => {
  const original = await createSource(`${SOURCE_PREFIX} Mutable Original`, 'https://feed-mutable.example.test/rss', { trusted: true, autoPublish: true });
  const sibling = await createSource(`${SOURCE_PREFIX} Mutable Sibling`, 'https://feed-mutable-sibling.example.test/rss', { trusted: true, autoPublish: true });

  await ingestRssSource(original, { fetchFeedImpl: fetchFor({ guid: 'immutable-original-guid', link: `${MUTATION_BASE}&utm_source=original`, title: 'Versão original publicada' }) });
  await q(`UPDATE radar_sources SET config=jsonb_set(config, '{autoPublish}', 'false'::jsonb), updated_at=now() WHERE id=$1`, [original.id]);
  await ingestRssSource(sibling, { fetchFeedImpl: fetchFor({ guid: 'immutable-sibling-guid', link: `${MUTATION_BASE}&fbclid=sibling`, title: 'Duplicado depois da mudança' }) });

  const { rows } = await q(
    `SELECT source_id, title, status, ingestion_trusted, ingestion_publishable
       FROM radar_items WHERE external_url LIKE 'https://news.example.test/mutation-story%'`
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source_id, original.id);
  assert.equal(rows[0].status, 'published');
  assert.equal(rows[0].ingestion_trusted, true);
  assert.equal(rows[0].ingestion_publishable, true);
});

test('item RSS arquivado continua a bloquear siblings mesmo depois da janela temporal da fonte', async () => {
  const original = await createSource(`${SOURCE_PREFIX} Archived Original`, 'https://feed-archived-a.example.test/rss');
  const sibling = await createSource(`${SOURCE_PREFIX} Archived Sibling`, 'https://feed-archived-b.example.test/rss');

  await ingestRssSource(original, {
    fetchFeedImpl: fetchFor({ guid: 'archived-original-guid', link: `${ARCHIVE_BASE}&utm_source=original`, title: 'Artigo a arquivar' }),
  });
  await q(
    `UPDATE radar_items
        SET status='archived', published_at=now() - interval '30 days'
      WHERE source_id=$1 AND external_url LIKE 'https://news.example.test/archived-story%'`,
    [original.id]
  );

  await ingestRssSource(sibling, {
    fetchFeedImpl: fetchFor({ guid: 'archived-sibling-guid', link: `${ARCHIVE_BASE}&fbclid=sibling`, title: 'Artigo que não pode reaparecer' }),
  });

  const { rows } = await q(
    `SELECT source_id, status FROM radar_items
      WHERE external_url LIKE 'https://news.example.test/archived-story%'`
  );
  assert.equal(rows.length, 1, 'o arquivo deve suprimir permanentemente a mesma URL canónica');
  assert.equal(rows[0].source_id, original.id);
  assert.equal(rows[0].status, 'archived');
});
