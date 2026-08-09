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

test('upgrade limpo aplica 013 e 014 e preserva item RSS já publicado', async () => {
  await q('DELETE FROM schema_migrations WHERE version IN (13,14)');
  await q('DROP TRIGGER IF EXISTS radar_fill_ingestion_policy_before_insert ON radar_items');
  await q('DROP TRIGGER IF EXISTS radar_reconcile_ingestion_policy_before_status_update ON radar_items');
  await q('DROP FUNCTION IF EXISTS radar_fill_ingestion_policy()');
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

  const versions = await q('SELECT version FROM schema_migrations WHERE version IN (13,14) ORDER BY version');
  assert.deepEqual(versions.rows.map(row => row.version), [13, 14]);
});

test('insert de instância antiga recebe policy antes de um sibling novo construir o dedupe', async () => {
  const oldSource = (await q(
    `INSERT INTO radar_sources (name, kind, url, default_type, active, trusted, config)
     VALUES ($1, 'rss', 'https://policy.example.test/rolling-old-feed', 'news', true, true,
             '{"autoPublish":true,"maxAgeDays":3}'::jsonb)
     RETURNING *`,
    [`${PREFIX} Rolling Old`]
  )).rows[0];
  const sibling = (await q(
    `INSERT INTO radar_sources (name, kind, url, default_type, active, trusted, config)
     VALUES ($1, 'rss', 'https://policy.example.test/rolling-sibling-feed', 'news', true, true,
             '{"autoPublish":true,"maxAgeDays":3}'::jsonb)
     RETURNING *`,
    [`${PREFIX} Rolling Sibling`]
  )).rows[0];

  const oldItem = (await q(
    `INSERT INTO radar_items (
       type, title, summary, body, external_url, source_id, source_name, source_url,
       sponsored, tags, published_at, status, priority, fingerprint
     ) VALUES (
       'news', 'Rolling antigo', '', '', 'https://policy.example.test/rolling-item?utm_source=old',
       $1, $2, $3, false, '{}', now(), 'published', 0, 'rss:rolling-old-instance'
     ) RETURNING id, ingestion_trusted, ingestion_publishable`,
    [oldSource.id, oldSource.name, oldSource.url]
  )).rows[0];
  assert.equal(oldItem.ingestion_trusted, true);
  assert.equal(oldItem.ingestion_publishable, true);

  const recentDate = new Date(Date.now() - 60_000).toUTCString();
  const xml = `<?xml version="1.0"?><rss><channel><item>
    <title>Rolling sibling</title>
    <guid>rolling-sibling-guid</guid>
    <link>https://policy.example.test/rolling-item?fbclid=sibling</link>
    <pubDate>${recentDate}</pubDate>
  </item></channel></rss>`;
  const fetchFeedImpl = async () => ({ notModified: false, text: xml, etag: null, lastModified: null });

  await ingestRssSource(sibling, { fetchFeedImpl });

  const { rows } = await q(
    `SELECT id, source_id, ingestion_trusted, ingestion_publishable
       FROM radar_items
      WHERE external_url LIKE 'https://policy.example.test/rolling-item%'`
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source_id, oldSource.id);
  assert.equal(rows[0].ingestion_trusted, true);
  assert.equal(rows[0].ingestion_publishable, true);
});

test('PATCH legado que publica um draft RSS é reconciliado pelo trigger de status', async () => {
  const source = (await q(
    `INSERT INTO radar_sources (name, kind, url, default_type, active, trusted, config)
     VALUES ($1, 'rss', 'https://policy.example.test/legacy-status-feed', 'news', true, true,
             '{"autoPublish":false}'::jsonb)
     RETURNING *`,
    [`${PREFIX} Legacy Status`]
  )).rows[0];

  const draft = (await q(
    `INSERT INTO radar_items (
       type, title, summary, body, external_url, source_id, source_name, source_url,
       sponsored, tags, published_at, status, priority, fingerprint
     ) VALUES (
       'news', 'Draft legado', '', '', 'https://policy.example.test/legacy-status-item',
       $1, $2, $3, false, '{}', now(), 'draft', 0, 'rss:legacy-status-update'
     ) RETURNING id, ingestion_trusted, ingestion_publishable`,
    [source.id, source.name, source.url]
  )).rows[0];
  assert.equal(draft.ingestion_trusted, true);
  assert.equal(draft.ingestion_publishable, false);

  const approved = (await q(
    `UPDATE radar_items SET status='published', updated_at=now()
      WHERE id=$1
      RETURNING status, ingestion_trusted, ingestion_publishable`,
    [draft.id]
  )).rows[0];
  assert.equal(approved.status, 'published');
  assert.equal(approved.ingestion_trusted, true);
  assert.equal(approved.ingestion_publishable, true);
});

test('migration 014 repara policy incoerente deixada entre deploys 013 e 014', async () => {
  const source = (await q(
    `INSERT INTO radar_sources (name, kind, url, default_type, active, trusted, config)
     VALUES ($1, 'rss', 'https://policy.example.test/upgrade-014-feed', 'news', true, true,
             '{"autoPublish":false}'::jsonb)
     RETURNING *`,
    [`${PREFIX} Upgrade 014`]
  )).rows[0];

  const item = (await q(
    `INSERT INTO radar_items (
       type, title, summary, body, external_url, source_id, source_name, source_url,
       sponsored, tags, published_at, status, priority, fingerprint,
       ingestion_trusted, ingestion_publishable
     ) VALUES (
       'news', 'Publicado com policy antiga', '', '', 'https://policy.example.test/upgrade-014-item',
       $1, $2, $3, false, '{}', now(), 'published', 0, 'rss:upgrade-014-test', false, false
     ) RETURNING id`,
    [source.id, source.name, source.url]
  )).rows[0];

  -- Simula uma base que já registou 013, mas ainda não executou 014.
  await q('DELETE FROM schema_migrations WHERE version=14');
  await q('DROP TRIGGER IF EXISTS radar_reconcile_ingestion_policy_before_status_update ON radar_items');
  await q('UPDATE radar_items SET ingestion_trusted=false, ingestion_publishable=false WHERE id=$1', [item.id]);

  await migrate();

  const repaired = (await q(
    'SELECT status, ingestion_trusted, ingestion_publishable FROM radar_items WHERE id=$1',
    [item.id]
  )).rows[0];
  assert.equal(repaired.status, 'published');
  assert.equal(repaired.ingestion_trusted, true);
  assert.equal(repaired.ingestion_publishable, true);
  const version14 = await q('SELECT version FROM schema_migrations WHERE version=14');
  assert.equal(version14.rowCount, 1);
});
