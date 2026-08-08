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
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  return { response, data };
}

before(async () => {
  await migrate();
  const { rows } = await q(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`);
  if (rows.length) {
    const tables = rows.map(({ tablename }) => `"${String(tablename).replaceAll('"', '""')}"`).join(', ');
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

test('configurar 2FA exige reautenticação com a password atual', async () => {
  const registration = await request('/auth/register', {
    method: 'POST',
    body: {
      handle: 'twofactor.owner',
      email: 'twofactor-owner@example.test',
      password: 'lumina-test-1234',
      name: 'Two Factor Owner',
      birthDate: '1990-01-01',
      acceptTerms: true,
    },
  });
  assert.equal(registration.response.status, 201, JSON.stringify(registration.data));
  const token = registration.data.token;

  const missing = await request('/2fa/setup', { method: 'POST', token, body: {} });
  assert.equal(missing.response.status, 400);
  assert.equal(missing.data.code, 'reauth_required');

  const wrong = await request('/2fa/setup', {
    method: 'POST', token, body: { password: 'password-errada' },
  });
  assert.equal(wrong.response.status, 400);
  assert.equal(wrong.data.code, 'reauth_required');

  const ok = await request('/2fa/setup', {
    method: 'POST', token, body: { password: 'lumina-test-1234' },
  });
  assert.equal(ok.response.status, 200, JSON.stringify(ok.data));
  assert.equal(typeof ok.data.secret, 'string');
  assert.ok(ok.data.secret.length >= 16);
  assert.match(ok.data.uri, /^otpauth:\/\/totp\//);
});
