import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.RAILWAY_GIT_COMMIT_SHA = 'release-test-sha';

const [{ default: app }, { migrate, pool, q }] = await Promise.all([
  import('../src/server.js'),
  import('../src/db.js'),
]);

let server;
let baseUrl;

before(async () => {
  await migrate();
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await pool.end();
});

test('health expõe release, schema e métricas agregadas do Radar sem alterar o body', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get('x-lumina-release'), 'release-test-sha');
  assert.equal(response.headers.get('x-lumina-schema'), '32');

  for (const header of [
    'x-lumina-radar-sources',
    'x-lumina-radar-synced',
    'x-lumina-radar-failing',
    'x-lumina-radar-items-24h',
  ]) {
    const value = Number(response.headers.get(header));
    assert.equal(Number.isInteger(value), true, `${header} deve ser inteiro`);
    assert.equal(value >= 0, true, `${header} não pode ser negativo`);
  }
});

test('health ignora versões históricas/sentinela sem migration correspondente no build', async () => {
  const inserted = await q(
    'INSERT INTO schema_migrations (version) VALUES (900009) ON CONFLICT DO NOTHING RETURNING version'
  );
  try {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(response.headers.get('x-lumina-release'), 'release-test-sha');
    assert.equal(response.headers.get('x-lumina-schema'), '32');
  } finally {
    if (inserted.rowCount > 0) {
      await q('DELETE FROM schema_migrations WHERE version = 900009');
    }
  }
});

test('health mantém o commit ativo mesmo quando a base não consegue reportar o schema', async () => {
  await q('ALTER TABLE schema_migrations RENAME TO schema_migrations_health_test_backup');
  try {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false });
    assert.equal(response.headers.get('x-lumina-release'), 'release-test-sha');
    assert.equal(response.headers.get('x-lumina-schema'), null);
  } finally {
    await q('ALTER TABLE schema_migrations_health_test_backup RENAME TO schema_migrations');
  }
});
