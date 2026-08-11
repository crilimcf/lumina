import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/server.js';
import { migrate, pool, q } from '../src/db.js';

let server;
let baseUrl;

async function request(path, { method='GET', token, body } = {}) {
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
    method:'POST',
    body:{
      handle,
      email:`${handle}@example.test`,
      password:'lumina-test-1234',
      name:handle,
      birthDate:'1990-01-01',
      acceptTerms:true,
    },
  });
  assert.equal(out.response.status, 201, JSON.stringify(out.data));
  return out.data;
}

async function readSseUntil(reader, predicate, timeoutMs = 4000) {
  const decoder = new TextDecoder();
  let buffer = '';
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const result = await Promise.race([
      reader.read(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout SSE')), remaining)),
    ]);
    if (result.done) throw new Error('SSE terminou antes do evento esperado');
    buffer += decoder.decode(result.value, { stream:true }).replaceAll('\r\n', '\n');

    const frames = buffer.split('\n\n');
    buffer = frames.pop() || '';
    for (const frame of frames) {
      const data = frame.split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trim())
        .join('\n');
      if (!data) continue;
      let payload;
      try { payload = JSON.parse(data); }
      catch { continue; }
      if (predicate(payload, frame)) return payload;
    }
  }
  throw new Error('timeout SSE');
}

before(async () => {
  await migrate();
  const { rows } = await q(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations'`);
  if (rows.length) {
    const tables = rows.map(({tablename}) => `"${String(tablename).replaceAll('"','""')}"`).join(', ');
    await q(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  }
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve,reject)=>{
    server.once('listening',resolve);
    server.once('error',reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => setTimeout(resolve, 80));
  await pool.end();
});

test('stream de notificações exige sessão', async () => {
  const response = await fetch(`${baseUrl}/notifications/events`);
  assert.equal(response.status, 401);
});

test('criar e ler uma notificação atualiza o utilizador por SSE', async () => {
  const alice = await register('notify.alice');
  const bob = await register('notify.bob');

  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/notifications/events`, {
    headers:{ authorization:`Bearer ${bob.token}` },
    signal:controller.signal,
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/event-stream/);

  const reader = response.body.getReader();
  try {
    await readSseUntil(reader, (_payload, frame) => frame.includes('event: ready'));

    const followed = await request(`/users/${bob.user.id}/follow`, {
      method:'POST',
      token:alice.token,
    });
    assert.equal(followed.response.status, 200, JSON.stringify(followed.data));

    const createdEvent = await readSseUntil(reader, payload => payload.type === 'notification_changed');
    assert.ok(createdEvent.notificationId);

    const unread = await request('/notifications/unread-count', { token:bob.token });
    assert.equal(unread.response.status, 200);
    assert.equal(unread.data.count, 1);

    const listed = await request('/notifications', { token:bob.token });
    assert.equal(listed.response.status, 200);
    assert.equal(listed.data.notifications[0].id, createdEvent.notificationId);

    const marked = await request(`/notifications/${createdEvent.notificationId}/read`, {
      method:'POST',
      token:bob.token,
    });
    assert.equal(marked.response.status, 200);

    const readEvent = await readSseUntil(
      reader,
      payload => payload.type === 'notification_changed' && payload.notificationId === createdEvent.notificationId,
    );
    assert.equal(readEvent.notificationId, createdEvent.notificationId);

    const afterRead = await request('/notifications/unread-count', { token:bob.token });
    assert.equal(afterRead.data.count, 0);
  } finally {
    controller.abort();
    await reader.cancel().catch(() => {});
  }
});
