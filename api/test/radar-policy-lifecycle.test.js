import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, pool, q } from '../src/db.js';
import { ingestRssSource } from '../src/jobs/radar.js';

const PREFIX = 'Radar Policy Lifecycle';

async function cleanup() {
  await q(`DELETE FROM radar_items WHERE external_url LIKE 'https://policy.example.test/%'`).catch(() => {});
  await q(`DELETE FROM radar_sources WHERE name LIKE $1`, [`${PREFIX}%`]).catch(() => {});
}

before(async () => {
  await migrate();
  await cleanup();
});

after(async () => {
  await cleanup();
  await pool.end();
});

test('migration 013 classifica item RSS já publicado pelo estado efetivo, não pela configuração atual da fonte', async () => {
  await q('DELETE FROM schema_migrations WHERE version=13');
  await q('ALTER TABLE radar_items DROP COLUMN IF EXISTS ingestion_trusted');
  await q('ALTER TABLE radar_items DROP COLUMN IF EXISTS ingestion_publishable');

  const source = (await q(
    `INSERT INTO radar_sources (name, kind, url, default_type, active, trusted, config)
     VALUES ($1, 'rss', 'https://policy.example.test/legacy-feed', 'news', true, true,
             '{"autoPublish":false}'::jsonb)
     RETURNING *`,
    [`${PREFIX} Legacy`]
  )).rows[0];

  const item = (await q(
    `INSERT INTO radar_items (
       type, title, summary, body, external_url, source_id, source_name, source_url,
       sponsored, tags, published_at, status, priority, fingerprint
     ) VALUES (
       'news', 'Publicado antes da 013', '', '', 'https://policy.example.test/legacy-item',
       $1, $2, $3, false, '{}', now(), 'published', 0, 'rss:policy-legacy-test'
     ) RETURNING id`,
    [source.id, source.name, source.url]
  )).rows[0];

  await migrate();

  const upgraded = (await q(
    'SELECT status, ingestion_trusted, ingestion_publishable FROM radar_items WHERE id=$1',
    [item.id]
  )).rows[0];
  assert.equal(upgraded.status, 'published');
  assert.equal(upgraded.ingestion_trusted, true);
  assert.equal(upgraded.ingestion_publishable, true);
});

test('nova instância preenche policy NULL deixada por instância antiga num conflito de fingerprint', async () => {
  const source = (await q(
    `INSERT INTO radar_sources (name, kind, url, default_type, active, trusted, config)
     VALUES ($1, 'rss', 'https://policy.example.test/rolling-feed', 'news', true, true,
             '{"autoPublish":true,"maxAgeDays":3}'::jsonb)
     RETURNING *`,
    [`${PREFIX} Rolling`]
  )).rows[0];

  const xml = `<?xml version="1.0"?><rss><channel><item>
    <title>Rolling deploy</title>
    <guid>rolling-policy-guid</guid>
    <link>https://policy.example.test/rolling-item</link>
    <pubDate>Sun, 09 Aug 2026 20:00:00 GMT</pubDate>
  </item></channel></rss>`;
  const fetchFeedImpl = async () => ({ notModified: false, text: xml, etag: null, lastModified: null });

  await ingestRssSource(source, { fetchFeedImpl });
  const item = (await q(
    `SELECT id FROM radar_items WHERE source_id=$1 AND external_url='https://policy.example.test/rolling-item'`,
    [source.id]
  )).rows[0];
  assert.ok(item?.id);

  // Simula uma instância antiga que escreveu depois do ALTER TABLE, mas não conhecia as novas colunas.
  await q(
    'UPDATE radar_items SET ingestion_trusted=NULL, ingestion_publishable=NULL WHERE id=$1',
    [item.id]
  );

  const refreshedSource = (await q('SELECT * FROM radar_sources WHERE id=$1', [source.id])).rows[0];
  await ingestRssSource(refreshedSource, { fetchFeedImpl });

  const repaired = (await q(
    'SELECT ingestion_trusted, ingestion_publishable FROM radar_items WHERE id=$1',
    [item.id]
  )).rows[0];
  assert.equal(repaired.ingestion_trusted, true);
  assert.equal(repaired.ingestion_publishable, true);
});
