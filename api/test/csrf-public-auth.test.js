import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/server.js';
import { migrate, pool, q } from '../src/db.js';

let server;
let baseUrl;

async function request(path, { method = 'GET', body, cookie, csrf } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  if (csrf) headers['x-csrf-token'] = csrf;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = text; }
  }
  return { response, data };
}

const cookieFrom = (response) => {
  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie, 'a resposta deve emitir cookie de sessão');
  return setCookie.split(';', 1)[0];
};

before(async () => {
  await migrate();
  const { rows } = await q(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`
  );
  if (rows.length) {
    const tables = rows
      .map(({ tablename }) => `"${String(tablename).replaceAll('"', '""')}"`)
      .join(', ');
    await q(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  }
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

test('cookie de sessão antigo não bloqueia novo login, mas CSRF continua obrigatório depois de entrar', async () => {
  const email = 'csrf-stale-session@example.test';
  const password = 'lumina-test-1234';
  const registered = await request('/auth/register', {
    method: 'POST',
    body: {
      handle: 'csrf.stale',
      email,
      password,
      name: 'Pessoa CSRF',
      birthDate: '1990-01-01',
      acceptTerms: true,
    },
  });
  assert.equal(registered.response.status, 201, JSON.stringify(registered.data));
  const staleCookie = cookieFrom(registered.response);

  // Reproduz o caso real do Safari: o JWT continua assinado/legível, mas a
  // sessão já foi revogada no servidor e o browser ainda envia o cookie.
  await q(
    'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
    [registered.data.user.id]
  );

  const login = await request('/auth/login', {
    method: 'POST',
    cookie: staleCookie,
    body: { email, password },
  });
  assert.equal(login.response.status, 200, JSON.stringify(login.data));
  assert.ok(login.data.csrf);
  const freshCookie = cookieFrom(login.response);

  const withoutCsrf = await request('/auth/logout', {
    method: 'POST',
    cookie: freshCookie,
  });
  assert.equal(withoutCsrf.response.status, 403, JSON.stringify(withoutCsrf.data));
  assert.equal(withoutCsrf.data.code, 'csrf');

  const withCsrf = await request('/auth/logout', {
    method: 'POST',
    cookie: freshCookie,
    csrf: login.data.csrf,
  });
  assert.equal(withCsrf.response.status, 204, JSON.stringify(withCsrf.data));
});
