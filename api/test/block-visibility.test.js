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

test('comentários de uma conta bloqueada deixam de ser expostos', async () => {
  const author = await register('blocks.post.author');
  const reader = await register('blocks.post.reader');
  const commenter = await register('blocks.post.commenter');

  assert.equal((await request(`/users/${author.user.id}/follow`, { method: 'POST', token: reader.token })).response.status, 200);
  assert.equal((await request(`/users/${author.user.id}/follow`, { method: 'POST', token: commenter.token })).response.status, 200);

  const post = await request('/posts', {
    method: 'POST', token: author.token, body: { body: 'post partilhado' },
  });
  assert.equal(post.response.status, 201, JSON.stringify(post.data));

  const comment = await request(`/posts/${post.data.id}/comments`, {
    method: 'POST', token: commenter.token, body: { body: 'comentário do utilizador' },
  });
  assert.equal(comment.response.status, 201, JSON.stringify(comment.data));

  const beforeBlock = await request(`/posts/${post.data.id}/comments`, { token: reader.token });
  assert.equal(beforeBlock.response.status, 200);
  assert.equal(beforeBlock.data.some(row => row.id === comment.data.id), true);

  const blocked = await request(`/users/${commenter.user.id}/block`, {
    method: 'POST', token: reader.token,
  });
  assert.equal(blocked.response.status, 200, JSON.stringify(blocked.data));

  const afterBlock = await request(`/posts/${post.data.id}/comments`, { token: reader.token });
  assert.equal(afterBlock.response.status, 200);
  assert.equal(afterBlock.data.some(row => row.id === comment.data.id), false);
});

test('alertas de uma conta bloqueada desaparecem também do contador não lido', async () => {
  const target = await register('blocks.alert.target');
  const actor = await register('blocks.alert.actor');

  const followed = await request(`/users/${target.user.id}/follow`, {
    method: 'POST', token: actor.token,
  });
  assert.equal(followed.response.status, 200, JSON.stringify(followed.data));

  const beforeList = await request('/notifications', { token: target.token });
  assert.equal(beforeList.response.status, 200);
  const actorNotification = beforeList.data.notifications.find(row => row.actor_id === actor.user.id);
  assert.ok(actorNotification);

  const beforeCount = await request('/notifications/unread-count', { token: target.token });
  assert.equal(beforeCount.response.status, 200);
  assert.ok(beforeCount.data.count >= 1);

  const blocked = await request(`/users/${actor.user.id}/block`, {
    method: 'POST', token: target.token,
  });
  assert.equal(blocked.response.status, 200, JSON.stringify(blocked.data));

  const afterList = await request('/notifications', { token: target.token });
  assert.equal(afterList.response.status, 200);
  assert.equal(afterList.data.notifications.some(row => row.actor_id === actor.user.id), false);

  const afterCount = await request('/notifications/unread-count', { token: target.token });
  assert.equal(afterCount.response.status, 200);
  assert.equal(afterCount.data.count, 0);
});
