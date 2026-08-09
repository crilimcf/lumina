import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, pool, q } from '../src/db.js';

before(async () => {
  await migrate();
});

after(async () => {
  await pool.end();
});

test('re-sincronizar RSS não altera a data de publicação original', async () => {
  const source = await q(
    `INSERT INTO radar_sources (name, kind, url, default_type, active, trusted)
     VALUES ('Timestamp Test','rss','https://example.test/timestamp.xml','news',true,true)
     RETURNING id`
  );
  const original = '2020-01-02T03:04:05.000Z';
  const attemptedRefresh = '2099-05-06T07:08:09.000Z';
  const fingerprint = `rss:timestamp-stability-${Date.now()}`;

  const item = await q(
    `INSERT INTO radar_items (type, title, external_url, source_id, published_at, status, fingerprint)
     VALUES ('news','Data estável','https://example.test/article',$1,$2,'published',$3)
     RETURNING id`,
    [source.rows[0].id, original, fingerprint]
  );

  await q('UPDATE radar_items SET published_at=$2, updated_at=now() WHERE id=$1', [item.rows[0].id, attemptedRefresh]);
  const saved = await q('SELECT published_at FROM radar_items WHERE id=$1', [item.rows[0].id]);
  assert.equal(saved.rows[0].published_at.toISOString(), original);

  await q('DELETE FROM radar_items WHERE id=$1', [item.rows[0].id]);
  await q('DELETE FROM radar_sources WHERE id=$1', [source.rows[0].id]);
});

test('a proteção de data não afeta itens Radar não-RSS', async () => {
  const original = '2020-01-02T03:04:05.000Z';
  const changed = '2021-02-03T04:05:06.000Z';
  const fingerprint = `manual:timestamp-stability-${Date.now()}`;
  const item = await q(
    `INSERT INTO radar_items (type, title, published_at, status, fingerprint)
     VALUES ('editorial','Editorial manual',$1,'published',$2)
     RETURNING id`,
    [original, fingerprint]
  );

  await q('UPDATE radar_items SET published_at=$2 WHERE id=$1', [item.rows[0].id, changed]);
  const saved = await q('SELECT published_at FROM radar_items WHERE id=$1', [item.rows[0].id]);
  assert.equal(saved.rows[0].published_at.toISOString(), changed);
  await q('DELETE FROM radar_items WHERE id=$1', [item.rows[0].id]);
});
