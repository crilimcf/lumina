import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/server.js';
import { migrate, pool, q } from '../src/db.js';

let server;
let baseUrl;

async function jsonRequest(path, { method = 'GET', token, cookie, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

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

test('crash beacon autenticado é guardado sem query string e só staff lê detalhes', async () => {
  const register = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      handle: 'observability.user',
      email: 'observability@example.test',
      password: 'lumina-test-1234',
      name: 'Observability User',
      birthDate: '1990-01-01',
      acceptTerms: true,
    }),
  });
  assert.equal(register.status, 201);
  const registration = await register.json();
  const setCookie = register.headers.get('set-cookie') || '';
  const cookie = setCookie.split(';')[0];
  assert.match(cookie, /^__Host-lumina-session=/);

  const anonymous = await jsonRequest('/api/reports/client-error', {
    method: 'POST',
    body: { kind: 'window_error', message: 'sem sessão' },
  });
  assert.equal(anonymous.response.status, 401);

  const ingested = await jsonRequest('/api/reports/client-error', {
    method: 'POST',
    cookie,
    body: {
      kind: 'react_boundary',
      message: 'Falha de render de teste',
      stack: 'Error: Falha de render de teste\n at Component',
      componentStack: '\n at Component',
      path: '/dms?notification=segredo#fragmento',
      release: 'ui-test-release',
      asset: '/assets/index-test.js',
      online: true,
    },
  });
  assert.equal(ingested.response.status, 202, JSON.stringify(ingested.data));
  assert.equal(ingested.data.accepted, true);

  const { rows } = await q(
    `SELECT source, kind, message, path, release, user_id, context
       FROM app_errors
      WHERE message = $1
      ORDER BY id DESC LIMIT 1`,
    ['Falha de render de teste']
  );
  assert.equal(rows[0].source, 'web');
  assert.equal(rows[0].kind, 'react_boundary');
  assert.equal(rows[0].path, '/dms');
  assert.equal(rows[0].release, 'ui-test-release');
  assert.equal(rows[0].user_id, registration.user.id);
  assert.equal(rows[0].context.asset, '/assets/index-test.js');
  assert.equal(rows[0].context.online, true);

  const denied = await jsonRequest('/reports/errors', { token: registration.token });
  assert.equal(denied.response.status, 403);

  await q('UPDATE users SET is_staff = true WHERE id = $1', [registration.user.id]);
  const allowed = await jsonRequest('/reports/errors?limit=10', { token: registration.token });
  assert.equal(allowed.response.status, 200, JSON.stringify(allowed.data));
  assert.ok(allowed.data.errors.some((row) => row.message === 'Falha de render de teste'));
});
