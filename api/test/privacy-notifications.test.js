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
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { response, data: text ? JSON.parse(text) : null };
}

async function register(handle) {
  const out = await request('/auth/register', {
    method: 'POST',
    body: {
      handle,
      email: `${handle}@example.test`,
      password: 'lumina-test-1234',
      name: handle.replaceAll('.', ' '),
      birthDate: '1990-01-01',
      acceptTerms: true,
    },
  });
  assert.equal(out.response.status, 201, JSON.stringify(out.data));
  return out.data;
}

before(async () => {
  await migrate();
  const { rows } = await q(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations'`);
  if (rows.length) {
    const tables = rows.map(({ tablename }) => `"${String(tablename).replaceAll('"','""')}"`).join(', ');
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

test('perfil privado exige pedido aceite antes de expor as publicações', async () => {
  const privateUser = await register('private.owner');
  const viewer = await register('private.viewer');

  const privacy = await request('/users/me/privacy', {
    method: 'PATCH', token: privateUser.token, body: { isPrivate: true },
  });
  assert.equal(privacy.response.status, 200);
  assert.equal(privacy.data.isPrivate, true);

  const post = await request('/posts', {
    method: 'POST', token: privateUser.token,
    body: { body: 'post privado visível depois de aceitar' },
  });
  assert.equal(post.response.status, 201, JSON.stringify(post.data));

  const profileBefore = await request('/users/private.owner', { token: viewer.token });
  assert.equal(profileBefore.response.status, 200);
  assert.equal(profileBefore.data.is_private, true);
  assert.equal(profileBefore.data.can_view_posts, false);

  const locked = await request('/users/private.owner/posts', { token: viewer.token });
  assert.equal(locked.response.status, 403);

  const follow = await request(`/users/${privateUser.user.id}/follow`, {
    method: 'POST', token: viewer.token,
  });
  assert.equal(follow.response.status, 202, JSON.stringify(follow.data));
  assert.equal(follow.data.pending, true);

  const ownerActivity = await request('/notifications', { token: privateUser.token });
  const requestNotification = ownerActivity.data.notifications.find(n => n.type === 'follow_request');
  assert.ok(requestNotification);
  assert.equal(requestNotification.actor_handle, 'private.viewer');
  assert.equal(requestNotification.follow_request_status, 'pending');

  const accept = await request(`/users/me/follow-requests/${requestNotification.follow_request_id}/accept`, {
    method: 'POST', token: privateUser.token,
  });
  assert.equal(accept.response.status, 200);

  const profileAfter = await request('/users/private.owner', { token: viewer.token });
  assert.equal(profileAfter.data.following, true);
  assert.equal(profileAfter.data.can_view_posts, true);

  const visible = await request('/users/private.owner/posts', { token: viewer.token });
  assert.equal(visible.response.status, 200, JSON.stringify(visible.data));
  assert.equal(visible.data.posts.some(p => p.id === post.data.id), true);

  const feed = await request('/posts/feed', { token: viewer.token });
  assert.equal(feed.data.posts.some(p => p.id === post.data.id), true);
});

test('perfil público aceita follow imediato e novas publicações geram alerta', async () => {
  const author = await register('public.author');
  const follower = await register('public.follower');

  const follow = await request(`/users/${author.user.id}/follow`, {
    method: 'POST', token: follower.token,
  });
  assert.equal(follow.response.status, 200);
  assert.equal(follow.data.following, true);

  const authorActivity = await request('/notifications', { token: author.token });
  assert.equal(authorActivity.data.notifications.some(n => n.type === 'new_follower'), true);

  const post = await request('/posts', {
    method: 'POST', token: author.token,
    body: { body: 'uma publicação nova para quem me segue' },
  });
  assert.equal(post.response.status, 201);

  const followerActivity = await request('/notifications', { token: follower.token });
  const newPost = followerActivity.data.notifications.find(n => n.type === 'new_post' && n.post_id === post.data.id);
  assert.ok(newPost);
  assert.equal(newPost.actor_handle, 'public.author');

  const unread = await request('/notifications/unread-count', { token: follower.token });
  assert.ok(unread.data.count >= 1);
  const read = await request(`/notifications/${newPost.id}/read`, { method: 'POST', token: follower.token });
  assert.equal(read.response.status, 200);
});

test('tornar perfil público aceita pedidos pendentes e notifica os requerentes', async () => {
  const owner = await register('switch.owner');
  const requester = await register('switch.requester');

  await request('/users/me/privacy', { method: 'PATCH', token: owner.token, body: { isPrivate: true } });
  const pending = await request(`/users/${owner.user.id}/follow`, { method: 'POST', token: requester.token });
  assert.equal(pending.response.status, 202);

  const makePublic = await request('/users/me/privacy', {
    method: 'PATCH', token: owner.token, body: { isPrivate: false },
  });
  assert.equal(makePublic.response.status, 200);
  assert.equal(makePublic.data.acceptedPending, 1);

  const requesterProfile = await request('/users/switch.owner', { token: requester.token });
  assert.equal(requesterProfile.data.following, true);
  const activity = await request('/notifications', { token: requester.token });
  assert.equal(activity.data.notifications.some(n => n.type === 'follow_accepted'), true);
});

test('salas públicas e convites privados entram no centro de atividade', async () => {
  const owner = await register('notify.roomowner');
  const other = await register('notify.roomguest');

  const publicRoom = await request('/rooms', {
    method: 'POST', token: owner.token,
    body: { name: 'Sala das novidades', topic: 'Tópico público', visibility: 'public' },
  });
  assert.equal(publicRoom.response.status, 201, JSON.stringify(publicRoom.data));

  let activity = await request('/notifications', { token: other.token });
  assert.equal(activity.data.notifications.some(n => n.type === 'new_room' && n.room_id === publicRoom.data.room.id), true);

  const privateRoom = await request('/rooms', {
    method: 'POST', token: owner.token,
    body: { name: 'Sala reservada', topic: 'Só convidados', visibility: 'private' },
  });
  assert.equal(privateRoom.response.status, 201);
  const invite = await request(`/rooms/${privateRoom.data.room.id}/invite`, {
    method: 'POST', token: owner.token, body: { userId: other.user.id },
  });
  assert.equal(invite.response.status, 201);

  activity = await request('/notifications', { token: other.token });
  assert.equal(activity.data.notifications.some(n => n.type === 'room_invite' && n.room_id === privateRoom.data.room.id), true);
});
