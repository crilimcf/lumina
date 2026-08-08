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
    try { data = JSON.parse(text); }
    catch { data = text; }
  }
  return { response, data };
}

async function register(handle, email) {
  const out = await request('/auth/register', {
    method: 'POST',
    body: {
      handle,
      email,
      password: 'lumina-test-1234',
      name: handle,
      birthDate: '1990-01-01',
      acceptTerms: true,
    },
  });
  assert.equal(out.response.status, 201, JSON.stringify(out.data));
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

test('abrir conversa valida o destinatário antes de tocar na base', async () => {
  const alice = await register('dm.alice', 'dm-alice@example.test');

  const missing = await request('/messages/threads', {
    method: 'POST', token: alice.token, body: {},
  });
  assert.equal(missing.response.status, 400);
  assert.equal(missing.data.code, 'user_required');

  const unknown = await request('/messages/threads', {
    method: 'POST',
    token: alice.token,
    body: { userId: '11111111-1111-4111-8111-111111111111' },
  });
  assert.equal(unknown.response.status, 404);

  const suspended = await register('dm.suspenso', 'dm-suspenso@example.test');
  await q('UPDATE users SET suspended_at = now() WHERE id = $1', [suspended.user.id]);
  const suspendedTarget = await request('/messages/threads', {
    method: 'POST', token: alice.token, body: { userId: suspended.user.id },
  });
  assert.equal(suspendedTarget.response.status, 404);
});

test('bloquear alguém corta lista, histórico, envio e abertura efémera por ID direto', async () => {
  const alice = await register('dm.block.alice', 'dm-block-alice@example.test');
  const bob = await register('dm.block.bob', 'dm-block-bob@example.test');

  const thread = await request('/messages/threads', {
    method: 'POST', token: alice.token, body: { userId: bob.user.id },
  });
  assert.equal(thread.response.status, 201, JSON.stringify(thread.data));

  const ephemeral = await request(`/messages/threads/${thread.data.id}/messages`, {
    method: 'POST',
    token: alice.token,
    body: { kind: 'text', mode: 'timer', body: 'segredo antes do bloqueio', palette: 0 },
  });
  assert.equal(ephemeral.response.status, 201, JSON.stringify(ephemeral.data));

  const beforeBlock = await request(`/messages/threads/${thread.data.id}/messages`, { token: bob.token });
  assert.equal(beforeBlock.response.status, 200);
  assert.equal(beforeBlock.data.find(m => m.id === ephemeral.data.id)?.body, null);

  const blocked = await request(`/users/${alice.user.id}/block`, {
    method: 'POST', token: bob.token,
  });
  assert.equal(blocked.response.status, 200);

  for (const token of [alice.token, bob.token]) {
    const listed = await request('/messages/threads', { token });
    assert.equal(listed.response.status, 200);
    assert.equal(listed.data.some(t => t.id === thread.data.id), false);

    const history = await request(`/messages/threads/${thread.data.id}/messages`, { token });
    assert.equal(history.response.status, 403);
  }

  const sendAfterBlock = await request(`/messages/threads/${thread.data.id}/messages`, {
    method: 'POST',
    token: alice.token,
    body: { kind: 'text', mode: 'normal', body: 'não deve passar' },
  });
  assert.equal(sendAfterBlock.response.status, 403);

  const openAfterBlock = await request(`/messages/${ephemeral.data.id}/open`, {
    method: 'POST', token: bob.token,
  });
  assert.equal(openAfterBlock.response.status, 403);
});
