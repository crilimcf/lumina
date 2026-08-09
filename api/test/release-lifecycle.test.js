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
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  if (text) data = JSON.parse(text);
  return { response, data };
}

async function register(handle) {
  const email = `${handle}@example.test`;
  const out = await request('/auth/register', {
    method: 'POST',
    body: {
      handle,
      email,
      password: PASSWORD,
      name: handle.replaceAll('.', ' '),
      birthDate: '1990-01-01',
      acceptTerms: true,
    },
  });
  assert.equal(out.response.status, 201, JSON.stringify(out.data));
  return { ...out.data, email };
}

before(async () => {
  await migrate();
  const { rows } = await q(
    `SELECT tablename FROM pg_tables
     WHERE schemaname='public' AND tablename<>'schema_migrations'`
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

test('ciclo final: conta, login, feed, reações, repost, comentários, salas e momentos', async () => {
  const owner = await register('release.owner');
  const friend = await register('release.friend');
  const stranger = await register('release.stranger');

  // O registo cria sessão; o login por email deve continuar funcional.
  const login = await request('/auth/login', {
    method: 'POST',
    body: { email: owner.email, password: PASSWORD },
  });
  assert.equal(login.response.status, 200, JSON.stringify(login.data));
  assert.equal(login.data.user.id, owner.user.id);
  assert.ok(login.data.token);

  // Comunidade real para todos os fluxos sociais.
  const community = await request('/communities', {
    method: 'POST',
    token: owner.token,
    body: {
      slug: 'release-final',
      name: 'Release Final',
      seedProposals: [
        'Uma coisa bonita hoje',
        'O que estás a ouvir',
        'Uma fotografia sem filtro',
        'Algo que aprendeste',
        'Um pequeno momento feliz',
      ],
    },
  });
  assert.equal(community.response.status, 201, JSON.stringify(community.data));
  const communityId = community.data.id;
  for (const person of [friend, stranger]) {
    const joined = await request(`/communities/${communityId}/join`, { method: 'POST', token: person.token });
    assert.equal(joined.response.status, 200, JSON.stringify(joined.data));
  }

  // Feed: criar -> editar -> like -> fogo -> comentário -> editar/apagar comentário -> repost -> apagar.
  const post = await request('/posts', {
    method: 'POST', token: owner.token,
    body: { communityId, body: 'Publicação final de QA', palette: 2 },
  });
  assert.equal(post.response.status, 201, JSON.stringify(post.data));
  const postId = post.data.id;

  const edited = await request(`/posts/${postId}`, {
    method: 'PATCH', token: owner.token, body: { body: 'Publicação final de QA editada' },
  });
  assert.equal(edited.response.status, 200, JSON.stringify(edited.data));
  assert.equal(edited.data.body, 'Publicação final de QA editada');
  assert.ok(edited.data.edited_at);

  const forbiddenPostEdit = await request(`/posts/${postId}`, {
    method: 'PATCH', token: friend.token, body: { body: 'Tentativa indevida' },
  });
  assert.equal(forbiddenPostEdit.response.status, 404);

  const like = await request(`/posts/${postId}/reactions/like`, { method: 'POST', token: friend.token });
  assert.equal(like.response.status, 200);
  assert.equal(like.data.active, true);
  assert.equal(like.data.likes, 1);

  const fire = await request(`/posts/${postId}/reactions/fire`, { method: 'POST', token: friend.token });
  assert.equal(fire.response.status, 200);
  assert.equal(fire.data.active, true);
  assert.equal(fire.data.fires, 1);

  const unlike = await request(`/posts/${postId}/reactions/like`, { method: 'POST', token: friend.token });
  assert.equal(unlike.response.status, 200);
  assert.equal(unlike.data.active, false);
  const relike = await request(`/posts/${postId}/reactions/like`, { method: 'POST', token: friend.token });
  assert.equal(relike.response.status, 200);
  assert.equal(relike.data.active, true);

  const comment = await request(`/posts/${postId}/comments`, {
    method: 'POST', token: friend.token, body: { body: 'Comentário QA' },
  });
  assert.equal(comment.response.status, 201, JSON.stringify(comment.data));
  const commentId = comment.data.id;

  const commentEdit = await request(`/posts/${postId}/comments/${commentId}`, {
    method: 'PATCH', token: friend.token, body: { body: 'Comentário QA editado' },
  });
  assert.equal(commentEdit.response.status, 200, JSON.stringify(commentEdit.data));
  assert.equal(commentEdit.data.body, 'Comentário QA editado');

  const commentDelete = await request(`/posts/${postId}/comments/${commentId}`, {
    method: 'DELETE', token: owner.token,
  });
  assert.equal(commentDelete.response.status, 200);
  assert.equal(commentDelete.data.deleted, true);

  const repost = await request(`/posts/${postId}/repost`, { method: 'POST', token: friend.token });
  assert.equal(repost.response.status, 201, JSON.stringify(repost.data));
  assert.equal(repost.data.reposted, true);
  const repostAgain = await request(`/posts/${postId}/repost`, { method: 'POST', token: friend.token });
  assert.equal(repostAgain.response.status, 200);
  assert.equal(repostAgain.data.reposted, false);

  const feed = await request('/posts/feed', { token: owner.token });
  assert.equal(feed.response.status, 200);
  assert.ok(feed.data.posts.some(p => p.id === postId && p.likes === 1 && p.fires === 1));

  const deletePost = await request(`/posts/${postId}`, { method: 'DELETE', token: owner.token });
  assert.equal(deletePost.response.status, 200);
  assert.equal(deletePost.data.deleted, true);
  const feedAfterDelete = await request('/posts/feed', { token: owner.token });
  assert.equal(feedAfterDelete.data.posts.some(p => p.id === postId), false);

  // Sala pública: criar -> editar -> proteção de edição -> entrar -> apagar.
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
  assert.equal(roomEdit.response.status, 200, JSON.stringify(roomEdit.data));
  assert.equal(roomEdit.data.name, 'Sala Pública Final');
  assert.equal(roomEdit.data.topic, 'Tópico editado');

  const forbiddenRoomEdit = await request(`/rooms/${publicRoomId}`, {
    method: 'PATCH', token: stranger.token, body: { name: 'Não autorizado' },
  });
  assert.equal(forbiddenRoomEdit.response.status, 403);

  const joinPublic = await request(`/rooms/${publicRoomId}/join`, { method: 'POST', token: stranger.token });
  assert.equal(joinPublic.response.status, 200);
  assert.equal(joinPublic.data.joined, true);

  const forbiddenRoomDelete = await request(`/rooms/${publicRoomId}`, { method: 'DELETE', token: stranger.token });
  assert.equal(forbiddenRoomDelete.response.status, 404);
  const publicRoomDelete = await request(`/rooms/${publicRoomId}`, { method: 'DELETE', token: owner.token });
  assert.equal(publicRoomDelete.response.status, 200);
  assert.equal(publicRoomDelete.data.deleted, true);

  // Sala privada: invisível a estranhos, convite, entrada, mensagem editada e apagada.
  const privateRoom = await request('/rooms', {
    method: 'POST', token: owner.token,
    body: { name: 'Sala Privada QA', topic: 'Só convidados', visibility: 'private' },
  });
  assert.equal(privateRoom.response.status, 201);
  const privateRoomId = privateRoom.data.room.id;

  const directStranger = await request(`/rooms/${privateRoomId}`, { token: stranger.token });
  assert.equal(directStranger.response.status, 404);
  const joinWithoutInvite = await request(`/rooms/${privateRoomId}/join`, { method: 'POST', token: stranger.token });
  assert.equal(joinWithoutInvite.response.status, 404);

  const invite = await request(`/rooms/${privateRoomId}/invite`, {
    method: 'POST', token: owner.token, body: { userId: friend.user.id },
  });
  assert.equal(invite.response.status, 201, JSON.stringify(invite.data));
  const joinPrivate = await request(`/rooms/${privateRoomId}/join`, { method: 'POST', token: friend.token });
  assert.equal(joinPrivate.response.status, 200);
  assert.equal(joinPrivate.data.joined, true);

  const roomMessage = await request(`/rooms/${privateRoomId}/messages`, {
    method: 'POST', token: friend.token, body: { body: 'Mensagem privada QA' },
  });
  assert.equal(roomMessage.response.status, 201, JSON.stringify(roomMessage.data));
  const roomMessageId = roomMessage.data.id;

  const roomMessageEdit = await request(`/rooms/${privateRoomId}/messages/${roomMessageId}`, {
    method: 'PATCH', token: friend.token, body: { body: 'Mensagem privada editada' },
  });
  assert.equal(roomMessageEdit.response.status, 200, JSON.stringify(roomMessageEdit.data));
  assert.equal(roomMessageEdit.data.body, 'Mensagem privada editada');
  assert.ok(roomMessageEdit.data.edited_at);

  const roomMessageDelete = await request(`/rooms/${privateRoomId}/messages/${roomMessageId}`, {
    method: 'DELETE', token: owner.token,
  });
  assert.equal(roomMessageDelete.response.status, 200);

  // Momento: criar, listar, impedir terceiro de apagar e apagar pelo autor.
  const moment = await request('/moments', {
    method: 'POST', token: owner.token, body: { palette: 3 },
  });
  assert.equal(moment.response.status, 201, JSON.stringify(moment.data));
  const momentId = moment.data.id;

  const moments = await request('/moments', { token: owner.token });
  assert.equal(moments.response.status, 200);
  assert.ok(moments.data.some(m => m.id === momentId));

  const strangerDeleteMoment = await request(`/moments/${momentId}`, { method: 'DELETE', token: stranger.token });
  assert.equal(strangerDeleteMoment.response.status, 404);
  const deleteMoment = await request(`/moments/${momentId}`, { method: 'DELETE', token: owner.token });
  assert.equal(deleteMoment.response.status, 200);
  assert.equal(deleteMoment.data.deleted, true);

  const momentsAfter = await request('/moments', { token: owner.token });
  assert.equal(momentsAfter.data.some(m => m.id === momentId), false);

  // Logout invalida o token usado nessa sessão.
  const logout = await request('/auth/logout', { method: 'POST', token: login.data.token });
  assert.equal(logout.response.status, 204);
  const meAfterLogout = await request('/auth/me', { token: login.data.token });
  assert.equal(meAfterLogout.response.status, 401);
});
