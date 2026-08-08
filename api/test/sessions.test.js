import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app from '../src/server.js';
import { migrate, pool, q } from '../src/db.js';

let server;
let baseUrl;

async function request(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';

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

async function register({ handle, email, password = 'lumina-test-1234' }) {
  const out = await request('/auth/register', {
    method: 'POST',
    body: {
      handle,
      email,
      password,
      name: 'Pessoa Sessão',
      birthDate: '1990-01-01',
      acceptTerms: true,
    },
  });
  assert.equal(out.response.status, 201, JSON.stringify(out.data));
  return out.data;
}

async function login(email, password) {
  const out = await request('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  assert.equal(out.response.status, 200, JSON.stringify(out.data));
  return out.data;
}

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

test('revogar uma sessão individual e logout tornam os tokens inutilizáveis', async () => {
  const registered = await register({
    handle: 'sessao.revogada',
    email: 'sessao-revogada@example.test',
  });
  const current = await login('sessao-revogada@example.test', 'lumina-test-1234');

  const listed = await request('/sessions', { token: current.token });
  assert.equal(listed.response.status, 200);
  assert.equal(listed.data.length, 2);
  const oldSession = listed.data.find(session => !session.current);
  assert.ok(oldSession, 'a sessão criada no registo deve aparecer como outro dispositivo');

  const revoked = await request(`/sessions/${oldSession.id}`, {
    method: 'DELETE',
    token: current.token,
  });
  assert.equal(revoked.response.status, 200);

  const oldToken = await request('/auth/me', { token: registered.token });
  assert.equal(oldToken.response.status, 401);
  assert.equal(oldToken.data.code, 'session_revoked');

  const stillCurrent = await request('/auth/me', { token: current.token });
  assert.equal(stillCurrent.response.status, 200);

  const loggedOut = await request('/auth/logout', { method: 'POST', token: current.token });
  assert.equal(loggedOut.response.status, 204);

  const reusedAfterLogout = await request('/auth/me', { token: current.token });
  assert.equal(reusedAfterLogout.response.status, 401);
  assert.equal(reusedAfterLogout.data.code, 'session_revoked');
});

test('mudar password fecha as sessões antigas e deixa apenas a nova ativa', async () => {
  const registered = await register({
    handle: 'password.change',
    email: 'password-change@example.test',
  });
  const second = await login('password-change@example.test', 'lumina-test-1234');

  const changed = await request('/auth/change-password', {
    method: 'POST',
    token: second.token,
    body: { current: 'lumina-test-1234', password: 'lumina-nova-5678' },
  });
  assert.equal(changed.response.status, 200, JSON.stringify(changed.data));
  assert.ok(changed.data.token);

  for (const token of [registered.token, second.token]) {
    const old = await request('/auth/me', { token });
    assert.equal(old.response.status, 401);
    assert.equal(old.data.code, 'session_revoked');
  }

  const sessions = await request('/sessions', { token: changed.data.token });
  assert.equal(sessions.response.status, 200);
  assert.equal(sessions.data.length, 1);
  assert.equal(sessions.data[0].current, true);
});

test('reset de password revoga todas as sessões registadas antes do novo login', async () => {
  const registered = await register({
    handle: 'password.reset',
    email: 'password-reset@example.test',
  });
  const second = await login('password-reset@example.test', 'lumina-test-1234');

  const rawToken = 'reset-session-regression-token';
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await q(
    `INSERT INTO password_resets (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + interval '1 hour')`,
    [tokenHash, registered.user.id]
  );

  const reset = await request('/account/reset-password', {
    method: 'POST',
    body: { token: rawToken, password: 'lumina-reset-9012' },
  });
  assert.equal(reset.response.status, 200, JSON.stringify(reset.data));

  for (const token of [registered.token, second.token]) {
    const old = await request('/auth/me', { token });
    assert.equal(old.response.status, 401);
    assert.equal(old.data.code, 'session_revoked');
  }

  const { rows } = await q(
    'SELECT count(*)::int AS n FROM sessions WHERE user_id = $1 AND revoked_at IS NULL',
    [registered.user.id]
  );
  assert.equal(rows[0].n, 0);

  const fresh = await login('password-reset@example.test', 'lumina-reset-9012');
  const sessions = await request('/sessions', { token: fresh.token });
  assert.equal(sessions.response.status, 200);
  assert.equal(sessions.data.length, 1);
  assert.equal(sessions.data[0].current, true);
});
