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

async function register(handle) {
  const out = await request('/auth/register', {
    method: 'POST',
    body: {
      handle,
      email: `${handle.replaceAll('.', '-')}@example.test`,
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

test('ICE config exige sessão e fornece STUN seguro como fallback', async () => {
  const unauthenticated = await request('/calls/ice-config');
  assert.equal(unauthenticated.response.status, 401);

  const user = await register('call.ice.user');
  const out = await request('/calls/ice-config', { token: user.token });
  assert.equal(out.response.status, 200, JSON.stringify(out.data));
  assert.equal(out.response.headers.get('cache-control'), 'private, no-store');
  assert.equal(Array.isArray(out.data.iceServers), true);
  assert.equal(out.data.iceServers.some(server => server.urls.some(url => url.startsWith('stun:'))), true);
  assert.equal(out.data.relayConfigured, false);
});

test('um bloqueio posterior corta chamada, incoming e signaling', async () => {
  const caller = await register('call.block.caller');
  const callee = await register('call.block.callee');

  const thread = await request('/messages/threads', {
    method: 'POST', token: caller.token, body: { userId: callee.user.id },
  });
  assert.equal(thread.response.status, 201, JSON.stringify(thread.data));

  const call = await request('/calls', {
    method: 'POST', token: caller.token, body: { threadId: thread.data.id, mode: 'video' },
  });
  assert.equal(call.response.status, 201, JSON.stringify(call.data));

  const incomingBefore = await request('/calls/incoming', { token: callee.token });
  assert.equal(incomingBefore.response.status, 200);
  assert.equal(incomingBefore.data.id, call.data.id);

  const blocked = await request(`/users/${caller.user.id}/block`, {
    method: 'POST', token: callee.token,
  });
  assert.equal(blocked.response.status, 200, JSON.stringify(blocked.data));

  const incomingAfter = await request('/calls/incoming', { token: callee.token });
  assert.equal(incomingAfter.response.status, 200);
  assert.equal(incomingAfter.data, null);

  assert.equal((await request(`/calls/${call.data.id}`, { token: caller.token })).response.status, 403);
  assert.equal((await request(`/calls/${call.data.id}`, { token: callee.token })).response.status, 403);
  assert.equal((await request(`/calls/${call.data.id}/answer`, { method: 'POST', token: callee.token })).response.status, 403);
  assert.equal((await request(`/calls/${call.data.id}/signals`, {
    method: 'POST', token: caller.token, body: { kind: 'ice', payload: { candidate: 'test' } },
  })).response.status, 403);
  assert.equal((await request(`/calls/${call.data.id}/signals?after=0`, { token: callee.token })).response.status, 403);
});

test('cursor de signaling inválido é rejeitado de forma controlada', async () => {
  const caller = await register('call.cursor.caller');
  const callee = await register('call.cursor.callee');
  const thread = await request('/messages/threads', {
    method: 'POST', token: caller.token, body: { userId: callee.user.id },
  });
  assert.equal(thread.response.status, 201, JSON.stringify(thread.data));
  const call = await request('/calls', {
    method: 'POST', token: caller.token, body: { threadId: thread.data.id, mode: 'audio' },
  });
  assert.equal(call.response.status, 201, JSON.stringify(call.data));

  const malformed = await request(`/calls/${call.data.id}/signals?after=not-a-number`, { token: callee.token });
  assert.equal(malformed.response.status, 400);
  assert.equal(malformed.data.code, 'bad_cursor');
});
