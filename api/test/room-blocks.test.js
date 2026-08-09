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

test('bloqueios impedem convite, descoberta e entrada em Salas do utilizador bloqueado', async () => {
  const owner = await register('blocks.owner');
  const guest = await register('blocks.guest');

  const privateRoom = await request('/rooms', {
    method: 'POST', token: owner.token,
    body: { name: 'Sala privada', topic: 'Teste de bloqueio', visibility: 'private' },
  });
  assert.equal(privateRoom.response.status, 201, JSON.stringify(privateRoom.data));

  const blockGuest = await request(`/users/${guest.user.id}/block`, {
    method: 'POST', token: owner.token,
  });
  assert.equal(blockGuest.response.status, 200, JSON.stringify(blockGuest.data));

  const inviteBlocked = await request(`/rooms/${privateRoom.data.room.id}/invite`, {
    method: 'POST', token: owner.token, body: { userId: guest.user.id },
  });
  assert.equal(inviteBlocked.response.status, 403);

  await request(`/users/${guest.user.id}/block`, { method: 'DELETE', token: owner.token });

  const publicRoom = await request('/rooms', {
    method: 'POST', token: owner.token,
    body: { name: 'Sala pública', topic: 'Também deve desaparecer', visibility: 'public' },
  });
  assert.equal(publicRoom.response.status, 201, JSON.stringify(publicRoom.data));
  const roomId = publicRoom.data.room.id;

  const beforeBlock = await request('/rooms', { token: guest.token });
  assert.equal(beforeBlock.response.status, 200);
  assert.equal(beforeBlock.data.some(room => room.id === roomId), true);

  const guestBlocksOwner = await request(`/users/${owner.user.id}/block`, {
    method: 'POST', token: guest.token,
  });
  assert.equal(guestBlocksOwner.response.status, 200, JSON.stringify(guestBlocksOwner.data));

  const afterBlock = await request('/rooms', { token: guest.token });
  assert.equal(afterBlock.response.status, 200);
  assert.equal(afterBlock.data.some(room => room.id === roomId), false);
  assert.equal((await request(`/rooms/${roomId}`, { token: guest.token })).response.status, 404);
  assert.equal((await request(`/rooms/${roomId}/join`, { method: 'POST', token: guest.token })).response.status, 404);
});

test('numa Sala partilhada, mensagens de utilizadores bloqueados deixam de ser expostas', async () => {
  const host = await register('blocks.host');
  const alice = await register('blocks.alice');
  const bob = await register('blocks.bob');

  const room = await request('/rooms', {
    method: 'POST', token: host.token,
    body: { name: 'Sala partilhada', topic: 'Teste entre membros', visibility: 'public' },
  });
  assert.equal(room.response.status, 201, JSON.stringify(room.data));
  const roomId = room.data.room.id;

  assert.equal((await request(`/rooms/${roomId}/join`, { method: 'POST', token: alice.token })).response.status, 200);
  assert.equal((await request(`/rooms/${roomId}/join`, { method: 'POST', token: bob.token })).response.status, 200);

  const aliceMessage = await request(`/rooms/${roomId}/messages`, {
    method: 'POST', token: alice.token, body: { body: 'mensagem da Alice' },
  });
  assert.equal(aliceMessage.response.status, 201);
  const bobMessage = await request(`/rooms/${roomId}/messages`, {
    method: 'POST', token: bob.token, body: { body: 'mensagem do Bob' },
  });
  assert.equal(bobMessage.response.status, 201);

  const visibleBefore = await request(`/rooms/${roomId}/messages`, { token: alice.token });
  assert.equal(visibleBefore.response.status, 200);
  assert.equal(visibleBefore.data.some(message => message.id === bobMessage.data.id), true);

  const blockBob = await request(`/users/${bob.user.id}/block`, {
    method: 'POST', token: alice.token,
  });
  assert.equal(blockBob.response.status, 200, JSON.stringify(blockBob.data));

  const visibleAfter = await request(`/rooms/${roomId}/messages`, { token: alice.token });
  assert.equal(visibleAfter.response.status, 200);
  assert.equal(visibleAfter.data.some(message => message.id === aliceMessage.data.id), true);
  assert.equal(visibleAfter.data.some(message => message.id === bobMessage.data.id), false);

  const bobStillInSharedRoom = await request(`/rooms/${roomId}/messages`, { token: bob.token });
  assert.equal(bobStillInSharedRoom.response.status, 200);
  assert.equal(bobStillInSharedRoom.data.some(message => message.id === aliceMessage.data.id), false);
  assert.equal(bobStillInSharedRoom.data.some(message => message.id === bobMessage.data.id), true);
});
