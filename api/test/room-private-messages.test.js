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
  return { response, data: text ? JSON.parse(text) : null };
}

async function register(handle) {
  const out = await request('/auth/register', {
    method: 'POST',
    body: {
      handle,
      email: `${handle}@example.test`,
      password: 'lumina-room-private-1234',
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

test('mensagens privadas numa sala só são visíveis ao remetente e destinatário', async () => {
  const owner = await register('priv.owner');
  const alice = await register('priv.alice');
  const bob = await register('priv.bob');
  const outsider = await register('priv.outsider');

  const created = await request('/rooms', {
    method: 'POST',
    token: owner.token,
    body: { name: 'Sala privada QA', topic: 'Mensagens contextuais', visibility: 'private' },
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const roomId = created.data.room.id;

  for (const person of [alice, bob]) {
    const invite = await request(`/rooms/${roomId}/invite`, {
      method: 'POST', token: owner.token, body: { userId: person.user.id },
    });
    assert.equal(invite.response.status, 201);
    const join = await request(`/rooms/${roomId}/join`, { method: 'POST', token: person.token });
    assert.equal(join.response.status, 200);
  }

  const recipients = await request(`/rooms/${roomId}/private-recipients?q=bob`, { token: alice.token });
  assert.equal(recipients.response.status, 200);
  assert.deepEqual(recipients.data.map(p => p.handle), ['priv.bob']);
  assert.equal(recipients.data.some(p => p.id === outsider.user.id), false);

  const publicMessage = await request(`/rooms/${roomId}/messages`, {
    method: 'POST', token: alice.token, body: { body: 'Olá @priv.bob isto continua público' },
  });
  assert.equal(publicMessage.response.status, 201);
  assert.equal(publicMessage.data.private_recipient_id, null);

  const privateMessage = await request(`/rooms/${roomId}/messages`, {
    method: 'POST', token: alice.token, body: { body: '@priv.bob segredo só nosso' },
  });
  assert.equal(privateMessage.response.status, 201, JSON.stringify(privateMessage.data));
  assert.equal(privateMessage.data.private_recipient_id, bob.user.id);
  assert.equal(privateMessage.data.body, 'segredo só nosso');

  const aliceMessages = await request(`/rooms/${roomId}/messages`, { token: alice.token });
  const bobMessages = await request(`/rooms/${roomId}/messages`, { token: bob.token });
  const ownerMessages = await request(`/rooms/${roomId}/messages`, { token: owner.token });

  assert.equal(aliceMessages.data.some(m => m.id === privateMessage.data.id), true);
  assert.equal(bobMessages.data.some(m => m.id === privateMessage.data.id), true);
  assert.equal(ownerMessages.data.some(m => m.id === privateMessage.data.id), false);
  assert.equal(ownerMessages.data.some(m => m.id === publicMessage.data.id), true);

  const ownerDelete = await request(`/rooms/${roomId}/messages/${privateMessage.data.id}`, {
    method: 'DELETE', token: owner.token,
  });
  assert.equal(ownerDelete.response.status, 404);

  const recipientDelete = await request(`/rooms/${roomId}/messages/${privateMessage.data.id}`, {
    method: 'DELETE', token: bob.token,
  });
  assert.equal(recipientDelete.response.status, 403);

  const invalidRecipient = await request(`/rooms/${roomId}/messages`, {
    method: 'POST', token: alice.token, body: { body: '@priv.outsider não estás na sala' },
  });
  assert.equal(invalidRecipient.response.status, 400);
  assert.equal(invalidRecipient.data.code, 'room_private_recipient');

  const senderDelete = await request(`/rooms/${roomId}/messages/${privateMessage.data.id}`, {
    method: 'DELETE', token: alice.token,
  });
  assert.equal(senderDelete.response.status, 200);

  const afterDelete = await request(`/rooms/${roomId}/messages`, { token: bob.token });
  assert.equal(afterDelete.data.some(m => m.id === privateMessage.data.id), false);
});
