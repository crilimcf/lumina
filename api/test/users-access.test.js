import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/server.js';
import { migrate, pool, q } from '../src/db.js';

let server;
let baseUrl;

async function request(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  return { response, data };
}

async function register(handle, email) {
  const out = await request('/auth/register', {
    method: 'POST',
    body: { handle, email, password: 'lumina-test-1234', name: handle, birthDate: '1990-01-01', acceptTerms: true },
  });
  assert.equal(out.response.status, 201, JSON.stringify(out.data));
  return out.data;
}

before(async () => {
  await migrate();
  const { rows } = await q(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`);
  if (rows.length) {
    const tables = rows.map(({ tablename }) => `"${String(tablename).replaceAll('"', '""')}"`).join(', ');
    await q(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  }
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await pool.end();
});

test('rotas /users/me não são engolidas pelo perfil dinâmico /:handle', async () => {
  const alice = await register('route.alice', 'route-alice@example.test');

  for (const path of ['/users/me/following', '/users/me/suggestions', '/users/me/blocked']) {
    const out = await request(path, { token: alice.token });
    assert.equal(out.response.status, 200, `${path}: ${JSON.stringify(out.data)}`);
    assert.ok(Array.isArray(out.data));
  }
});

test('follow e block rejeitam utilizadores inexistentes ou suspensos sem erro de integridade', async () => {
  const alice = await register('target.alice', 'target-alice@example.test');
  const bob = await register('target.bob', 'target-bob@example.test');
  const unknown = '11111111-1111-4111-8111-111111111111';

  for (const action of ['follow', 'block']) {
    const missing = await request(`/users/${unknown}/${action}`, { method: 'POST', token: alice.token });
    assert.equal(missing.response.status, 404, `${action}: ${JSON.stringify(missing.data)}`);
  }

  await q('UPDATE users SET suspended_at = now() WHERE id = $1', [bob.user.id]);
  for (const action of ['follow', 'block']) {
    const suspended = await request(`/users/${bob.user.id}/${action}`, { method: 'POST', token: alice.token });
    assert.equal(suspended.response.status, 404, `${action}: ${JSON.stringify(suspended.data)}`);
  }
});
