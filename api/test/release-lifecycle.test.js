import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/server.js';
import { migrate, pool, q } from '../src/db.js';

let server;
let baseUrl;
const PASSWORD = 'lumina-release-1234';

async function request(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { response, data: text ? JSON.parse(text) : null };
}

async function register(handle) {
  const email = `${handle}@example.test`;
  const out = await request('/auth/register', {
    method: 'POST',
    body: { handle, email, password: PASSWORD, name: handle.replaceAll('.', ' '), birthDate: '1990-01-01', acceptTerms: true },
  });
  assert.equal(out.response.status, 201, JSON.stringify(out.data));
  return { ...out.data, email };
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

test('ciclo final: conta, Feed, reações, repost, comentários, Salas e Momentos', async () => {
  const owner = await register('release.owner');
  const friend = await register('release.friend');
  const stranger = await register('release.stranger');

  const login = await request('/auth/login', {
    method: 'POST', body: { email: owner.email, password: PASSWORD },
  });
  assert.equal(login.response.status, 200, JSON.stringify(login.data));
  assert.equal(login.data.user.id, owner.user.id);

  const follow = await request(`/users/${owner.user.id}/follow`, {
    method: 'POST', token: friend.token,
  });
  assert.equal(follow.response.status, 200);

  const post = await request('/posts', {
    method: 'POST', token: owner.token,
    body: { body: 'Publicação final de QA', palette: 2 },
  });
  assert.equal(post.response.status, 201, JSON.stringify(post.data));
  const postId = post.data.id;

  const edited = await request(`/posts/${postId}`, {
    method: 'PATCH', token: owner.token, body: { body: 'Publicação final de QA editada' },
  });
  assert.equal(edited.response.status, 200);
  assert.ok(edited.data.edited_at);

  const forbiddenPostEdit = await request(`/posts/${postId}`, {
    method: 'PATCH', token: friend.token, body: { body: 'Tentativa indevida' },
  });
  assert.equal(forbiddenPostEdit.response.status, 404);

  const like = await request(`/posts/${postId}/reactions/like`, { method: 'POST', token: friend.token });
  assert.equal(like.response.status, 200);
  assert.equal(like.data.active, true);

  const fire = await request(`/posts/${postId}/reactions/fire`, { method: 'POST', token: friend.token });
  assert.equal(fire.response.status, 200);
  assert.equal(fire.data.active, true);

  const comment = await request(`/posts/${postId}/comments`, {
    method: 'POST', token: friend.token, body: { body: 'Comentário QA' },
  });
  assert.equal(comment.response.status, 201);
  const commentId = comment.data.id;

  const commentEdit = await request(`/posts/${postId}/comments/${commentId}`, {
    method: 'PATCH', token: friend.token, body: { body: 'Comentário QA editado' },
  });
  assert.equal(commentEdit.response.status, 200);

  const commentDelete = await request(`/posts/${postId}/comments/${commentId}`, {
    method: 'DELETE', token: owner.token,
  });
  assert.equal(commentDelete.response.status, 200);

  const repost = await request(`/posts/${postId}/repost`, { method: 'POST', token: friend.token });
  assert.equal(repost.response.status, 201, JSON.stringify(repost.data));
  const repostAgain = await request(`/posts/${postId}/repost`, { method: 'POST', token: friend.token });
  assert.equal(repostAgain.response.status, 200);
  assert.equal(repostAgain.data.reposted, false);

  const friendFeed = await request('/posts/feed', { token: friend.token });
  assert.equal(friendFeed.response.status, 200);
  assert.ok(friendFeed.data.posts.some(p => p.id === postId));
  const strangerFeed = await request('/posts/feed', { token: stranger.token });
  assert.equal(strangerFeed.data.posts.some(p => p.id === postId), false);

  const publicRoom = await request('/rooms', {
    method: 'POST', token: owner.token,
    body: { name: 'Sala Pública QA', topic: 'Tópico público', description: 'Antes da edição', visibility: 'public' },
  });
  assert.equal(publicRoom.response.status, 201, JSON.stringify(publicRoom.data));
  const publicRoomId = publicRoom.data.room.id;

  const roomEdit = await request(`/rooms/${publicRoomId}`, {
    method: 'PATCH', token: owner.token,
    body: { name: 'Sala Pública Final', topic: 'Tópico editado', description: 'Depois da edição' },
  });
  assert.equal(roomEdit.response.status, 200);
  assert.equal(roomEdit.data.name, 'Sala Pública Final');

  const forbiddenRoomEdit = await request(`/rooms/${publicRoomId}`, {
    method: 'PATCH', token: stranger.token, body: { name: 'Não autorizado' },
  });
  assert.equal(forbiddenRoomEdit.response.status, 403);
  assert.equal((await request(`/rooms/${publicRoomId}/join`, { method: 'POST', token: stranger.token })).response.status, 200);

  const privateRoom = await request('/rooms', {
    method: 'POST', token: owner.token,
    body: { name: 'Sala Privada QA', topic: 'Só convidados', visibility: 'private' },
  });
  assert.equal(privateRoom.response.status, 201);
  const privateRoomId = privateRoom.data.room.id;

  assert.equal((await request(`/rooms/${privateRoomId}`, { token: stranger.token })).response.status, 404);
  assert.equal((await request(`/rooms/${privateRoomId}/join`, { method: 'POST', token: stranger.token })).response.status, 404);

  const invite = await request(`/rooms/${privateRoomId}/invite`, {
    method: 'POST', token: owner.token, body: { userId: friend.user.id },
  });
  assert.equal(invite.response.status, 201);
  assert.equal((await request(`/rooms/${privateRoomId}/join`, { method: 'POST', token: friend.token })).response.status, 200);

  const roomMessage = await request(`/rooms/${privateRoomId}/messages`, {
    method: 'POST', token: friend.token, body: { body: 'Mensagem privada QA' },
  });
  assert.equal(roomMessage.response.status, 201);
  const roomMessageEdit = await request(`/rooms/${privateRoomId}/messages/${roomMessage.data.id}`, {
    method: 'PATCH', token: friend.token, body: { body: 'Mensagem privada editada' },
  });
  assert.equal(roomMessageEdit.response.status, 200);
  assert.ok(roomMessageEdit.data.edited_at);

  const moment = await request('/moments', {
    method: 'POST', token: owner.token, body: { palette: 3 },
  });
  assert.equal(moment.response.status, 201);
  const momentId = moment.data.id;

  const friendMoments = await request('/moments', { token: friend.token });
  assert.equal(friendMoments.response.status, 200);
  assert.ok(friendMoments.data.some(m => m.id === momentId));
  const strangerMoments = await request('/moments', { token: stranger.token });
  assert.equal(strangerMoments.data.some(m => m.id === momentId), false);

  assert.equal((await request(`/moments/${momentId}`, { method: 'DELETE', token: stranger.token })).response.status, 404);
  assert.equal((await request(`/moments/${momentId}`, { method: 'DELETE', token: owner.token })).response.status, 200);

  const deletePost = await request(`/posts/${postId}`, { method: 'DELETE', token: owner.token });
  assert.equal(deletePost.response.status, 200);

  const logout = await request('/auth/logout', { method: 'POST', token: login.data.token });
  assert.equal(logout.response.status, 204);
  const meAfterLogout = await request('/auth/me', { token: login.data.token });
  assert.equal(meAfterLogout.response.status, 401);
});
