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
    body: { handle, email: `${handle}@example.test`, password: 'lumina-test-1234', name: handle.replace('.', ' '), birthDate: '1990-01-01', acceptTerms: true },
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

test('Feed é social, editável e promoções ficam apenas no Radar', async () => {
  const owner = await register('feed.owner');
  const other = await register('feed.other');
  const third = await register('feed.third');

  await request(`/users/${owner.user.id}/follow`, { method: 'POST', token: other.token });
  await request(`/users/${owner.user.id}/follow`, { method: 'POST', token: third.token });

  const created = await request('/posts', {
    method: 'POST', token: owner.token, body: { body: 'texto inicial' },
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const postId = created.data.id;

  const edited = await request(`/posts/${postId}`, {
    method: 'PATCH', token: owner.token, body: { body: 'texto corrigido' },
  });
  assert.equal(edited.response.status, 200);
  assert.equal(edited.data.body, 'texto corrigido');

  const forbiddenEdit = await request(`/posts/${postId}`, {
    method: 'PATCH', token: other.token, body: { body: 'não pode' },
  });
  assert.equal(forbiddenEdit.response.status, 404);

  const otherComment = await request(`/posts/${postId}/comments`, {
    method: 'POST', token: other.token, body: { body: 'comentário de outra pessoa' },
  });
  assert.equal(otherComment.response.status, 201);
  const ownerDeletesOther = await request(`/posts/${postId}/comments/${otherComment.data.id}`, {
    method: 'DELETE', token: owner.token,
  });
  assert.equal(ownerDeletesOther.response.status, 200);

  const otherPost = await request('/posts', {
    method: 'POST', token: other.token, body: { body: 'post do outro' },
  });
  await request(`/users/${other.user.id}/follow`, { method: 'POST', token: owner.token });
  await request(`/users/${other.user.id}/follow`, { method: 'POST', token: third.token });
  const thirdComment = await request(`/posts/${otherPost.data.id}/comments`, {
    method: 'POST', token: third.token, body: { body: 'comentário do terceiro' },
  });
  assert.equal(thirdComment.response.status, 201);
  const cannotModerateOthersPost = await request(`/posts/${otherPost.data.id}/comments/${thirdComment.data.id}`, {
    method: 'DELETE', token: owner.token,
  });
  assert.equal(cannotModerateOthersPost.response.status, 403);

  await q(`INSERT INTO posts (author_id,body,kind) VALUES ($1,'promoção separada','promotion')`, [owner.user.id]);
  const social = await request('/posts/feed', { token: owner.token });
  assert.equal(social.response.status, 200);
  assert.equal(social.data.posts.some(p => p.kind === 'promotion'), false);
  const promos = await request('/posts/promotions', { token: owner.token });
  assert.equal(promos.response.status, 200);
  assert.equal(promos.data.posts.some(p => p.body === 'promoção separada'), true);
});

test('Salas públicas entram livremente; privadas e Ultra protegem o acesso', async () => {
  const owner = await register('room.owner');
  const invited = await register('room.invited');
  const stranger = await register('room.stranger');

  const publicRoom = await request('/rooms', {
    method: 'POST', token: owner.token,
    body: { name: 'Sala Pública', topic: 'Futebol hoje', visibility: 'public' },
  });
  assert.equal(publicRoom.response.status, 201, JSON.stringify(publicRoom.data));
  const publicId = publicRoom.data.room.id;
  const joinPublic = await request(`/rooms/${publicId}/join`, { method: 'POST', token: stranger.token });
  assert.equal(joinPublic.response.status, 200);
  assert.equal(joinPublic.data.joined, true);

  const privateRoom = await request('/rooms', {
    method: 'POST', token: owner.token,
    body: { name: 'Sala Privada', topic: 'Só convidados', visibility: 'private' },
  });
  assert.equal(privateRoom.response.status, 201);
  const privateId = privateRoom.data.room.id;

  const strangerList = await request('/rooms', { token: stranger.token });
  assert.equal(strangerList.data.some(r => r.id === privateId), false);
  assert.equal((await request(`/rooms/${privateId}`, { token: stranger.token })).response.status, 404);

  const invite = await request(`/rooms/${privateId}/invite`, {
    method: 'POST', token: owner.token, body: { userId: invited.user.id },
  });
  assert.equal(invite.response.status, 201);
  const invitedList = await request('/rooms', { token: invited.token });
  assert.equal(invitedList.data.some(r => r.id === privateId), true);
  assert.equal((await request(`/rooms/${privateId}/join`, { method: 'POST', token: invited.token })).response.status, 200);

  const message = await request(`/rooms/${privateId}/messages`, {
    method: 'POST', token: invited.token, body: { body: 'mensagem discreta' },
  });
  assert.equal(message.response.status, 201);
  const deleteByOwner = await request(`/rooms/${privateId}/messages/${message.data.id}`, {
    method: 'DELETE', token: owner.token,
  });
  assert.equal(deleteByOwner.response.status, 200);

  const ultra = await request('/rooms', {
    method: 'POST', token: owner.token,
    body: { name: 'Sala Ultra', topic: 'Ultra privada', visibility: 'ultra' },
  });
  assert.equal(ultra.response.status, 201, JSON.stringify(ultra.data));
  assert.equal(ultra.data.room.create_price_cents, 299);
  assert.equal(ultra.data.room.entry_price_cents, 149);
  assert.equal(ultra.data.room.billing_state, 'pending_payment');
});

test('signaling de chamada só circula entre os dois participantes', async () => {
  const a = await register('call.alpha');
  const b = await register('call.bravo');
  const outsider = await register('call.outside');

  const thread = await request('/messages/threads', { method: 'POST', token: a.token, body: { userId: b.user.id } });
  assert.equal(thread.response.status, 201);
  const call = await request('/calls', { method: 'POST', token: a.token, body: { threadId: thread.data.id, mode: 'video' } });
  assert.equal(call.response.status, 201);

  const incoming = await request('/calls/incoming', { token: b.token });
  assert.equal(incoming.data.id, call.data.id);
  assert.equal((await request(`/calls/${call.data.id}`, { token: outsider.token })).response.status, 404);

  const offer = await request(`/calls/${call.data.id}/signals`, {
    method: 'POST', token: a.token,
    body: { kind: 'offer', payload: { type: 'offer', sdp: 'fake-offer-for-test' } },
  });
  assert.equal(offer.response.status, 201);
  const signals = await request(`/calls/${call.data.id}/signals?after=0`, { token: b.token });
  assert.equal(signals.data.length, 1);
  assert.equal(signals.data[0].kind, 'offer');
  assert.equal((await request(`/calls/${call.data.id}/answer`, { method: 'POST', token: b.token })).response.status, 200);
  assert.equal((await request(`/calls/${call.data.id}/end`, { method: 'POST', token: a.token })).response.status, 200);
});
