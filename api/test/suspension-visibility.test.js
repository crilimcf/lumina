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

async function suspend(userId) {
  await q('UPDATE users SET suspended_at=now() WHERE id=$1', [userId]);
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

test('posts e comentários de contas suspensas deixam de ser expostos', async () => {
  const author = await register('suspend.post.author');
  const reader = await register('suspend.post.reader');
  const commenter = await register('suspend.post.commenter');

  assert.equal((await request(`/users/${author.user.id}/follow`, { method: 'POST', token: reader.token })).response.status, 200);
  assert.equal((await request(`/users/${author.user.id}/follow`, { method: 'POST', token: commenter.token })).response.status, 200);

  const post = await request('/posts', {
    method: 'POST', token: author.token, body: { body: 'conteúdo que deve desaparecer' },
  });
  assert.equal(post.response.status, 201, JSON.stringify(post.data));

  const comment = await request(`/posts/${post.data.id}/comments`, {
    method: 'POST', token: commenter.token, body: { body: 'comentário que será suspenso' },
  });
  assert.equal(comment.response.status, 201, JSON.stringify(comment.data));

  const beforeCommentSuspend = await request(`/posts/${post.data.id}/comments`, { token: reader.token });
  assert.equal(beforeCommentSuspend.response.status, 200);
  assert.equal(beforeCommentSuspend.data.some(row => row.id === comment.data.id), true);

  await suspend(commenter.user.id);
  const afterCommentSuspend = await request(`/posts/${post.data.id}/comments`, { token: reader.token });
  assert.equal(afterCommentSuspend.response.status, 200);
  assert.equal(afterCommentSuspend.data.some(row => row.id === comment.data.id), false);

  const feedBeforeAuthorSuspend = await request('/posts/feed', { token: reader.token });
  assert.equal(feedBeforeAuthorSuspend.response.status, 200);
  assert.equal(feedBeforeAuthorSuspend.data.posts.some(row => row.id === post.data.id), true);

  await suspend(author.user.id);
  const feedAfterAuthorSuspend = await request('/posts/feed', { token: reader.token });
  assert.equal(feedAfterAuthorSuspend.response.status, 200);
  assert.equal(feedAfterAuthorSuspend.data.posts.some(row => row.id === post.data.id), false);
});

test('Salas e chamadas de contas suspensas deixam de ser descobertas', async () => {
  const roomOwner = await register('suspend.room.owner');
  const roomGuest = await register('suspend.room.guest');
  const room = await request('/rooms', {
    method: 'POST', token: roomOwner.token,
    body: { name: 'Sala suspensa', topic: 'Deve desaparecer', visibility: 'public' },
  });
  assert.equal(room.response.status, 201, JSON.stringify(room.data));
  const roomId = room.data.room.id;

  const roomsBefore = await request('/rooms', { token: roomGuest.token });
  assert.equal(roomsBefore.response.status, 200);
  assert.equal(roomsBefore.data.some(row => row.id === roomId), true);

  await suspend(roomOwner.user.id);
  const roomsAfter = await request('/rooms', { token: roomGuest.token });
  assert.equal(roomsAfter.response.status, 200);
  assert.equal(roomsAfter.data.some(row => row.id === roomId), false);
  assert.equal((await request(`/rooms/${roomId}`, { token: roomGuest.token })).response.status, 404);

  const caller = await register('suspend.call.caller');
  const callee = await register('suspend.call.callee');
  const thread = await request('/messages/threads', {
    method: 'POST', token: caller.token, body: { userId: callee.user.id },
  });
  assert.equal(thread.response.status, 201, JSON.stringify(thread.data));
  const call = await request('/calls', {
    method: 'POST', token: caller.token, body: { threadId: thread.data.id, mode: 'audio' },
  });
  assert.equal(call.response.status, 201, JSON.stringify(call.data));
  assert.equal((await request('/calls/incoming', { token: callee.token })).data.id, call.data.id);

  await suspend(caller.user.id);
  const incomingAfter = await request('/calls/incoming', { token: callee.token });
  assert.equal(incomingAfter.response.status, 200);
  assert.equal(incomingAfter.data, null);
  assert.equal((await request(`/calls/${call.data.id}`, { token: callee.token })).response.status, 404);
});

test('notificações de atores suspensos desaparecem da lista e do contador', async () => {
  const target = await register('suspend.alert.target');
  const actor = await register('suspend.alert.actor');

  const followed = await request(`/users/${target.user.id}/follow`, {
    method: 'POST', token: actor.token,
  });
  assert.equal(followed.response.status, 200, JSON.stringify(followed.data));

  const before = await request('/notifications', { token: target.token });
  assert.equal(before.response.status, 200);
  assert.equal(before.data.notifications.some(row => row.actor_id === actor.user.id), true);
  const countBefore = await request('/notifications/unread-count', { token: target.token });
  assert.ok(countBefore.data.count >= 1);

  await suspend(actor.user.id);

  const afterList = await request('/notifications', { token: target.token });
  assert.equal(afterList.response.status, 200);
  assert.equal(afterList.data.notifications.some(row => row.actor_id === actor.user.id), false);
  const afterCount = await request('/notifications/unread-count', { token: target.token });
  assert.equal(afterCount.response.status, 200);
  assert.equal(afterCount.data.count, 0);
});

test('cursores de timestamp inválidos devolvem 400 controlado', async () => {
  const user = await register('cursor.validation');

  const feed = await request('/posts/feed?before=nao-e-uma-data', { token: user.token });
  assert.equal(feed.response.status, 400);
  assert.equal(feed.data.code, 'bad_cursor');

  const promotions = await request('/posts/promotions?before=tambem-nao', { token: user.token });
  assert.equal(promotions.response.status, 400);
  assert.equal(promotions.data.code, 'bad_cursor');

  const alerts = await request('/notifications?before=definitivamente-nao', { token: user.token });
  assert.equal(alerts.response.status, 400);
  assert.equal(alerts.data.code, 'bad_cursor');
});
