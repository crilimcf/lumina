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
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  return { response, data };
}

async function confirmedAvatar(ownerId, suffix) {
  const url = `https://media.example.test/${ownerId}/${suffix}.jpg`;
  await q(
    `INSERT INTO uploads (owner_id, key, url, mime, bytes, confirmed_at)
     VALUES ($1, $2, $3, 'image/jpeg', 2048, now())`,
    [ownerId, `${ownerId}/${suffix}.jpg`, url]
  );
  return url;
}

before(async () => {
  await migrate();
  const { rows } = await q(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`
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

test('avatar confirmado fica persistido no perfil e é consumido como avatar', async () => {
  const registered = await request('/auth/register', {
    method: 'POST',
    body: {
      handle: 'avatar.persist', email: 'avatar.persist@example.test', password: 'lumina-test-1234',
      name: 'Avatar Persist', birthDate: '1990-01-01', acceptTerms: true,
    },
  });
  assert.equal(registered.response.status, 201, JSON.stringify(registered.data));

  const userId = registered.data.user.id;
  const avatarUrl = await confirmedAvatar(userId, 'avatar');

  const updated = await request('/auth/me', {
    method: 'PATCH', token: registered.data.token,
    body: { name: 'Avatar Persist', bio: 'foto guardada', avatarUrl },
  });
  assert.equal(updated.response.status, 200, JSON.stringify(updated.data));
  assert.equal(updated.data.avatar_url, avatarUrl);

  const me = await request('/auth/me', { token: registered.data.token });
  assert.equal(me.response.status, 200, JSON.stringify(me.data));
  assert.equal(me.data.avatar_url, avatarUrl);
  assert.equal(me.data.bio, 'foto guardada');

  const { rows } = await q('SELECT consumed_at, purpose FROM uploads WHERE url = $1', [avatarUrl]);
  assert.ok(rows[0].consumed_at);
  assert.equal(rows[0].purpose, 'avatar');
});

test('trocar e remover avatar limpa as imagens antigas sem deixar uploads órfãos', async () => {
  const registered = await request('/auth/register', {
    method: 'POST',
    body: {
      handle: 'avatar.replace', email: 'avatar.replace@example.test', password: 'lumina-test-1234',
      name: 'Avatar Replace', birthDate: '1990-01-01', acceptTerms: true,
    },
  });
  assert.equal(registered.response.status, 201, JSON.stringify(registered.data));

  const userId = registered.data.user.id;
  const first = await confirmedAvatar(userId, 'avatar-first');
  const second = await confirmedAvatar(userId, 'avatar-second');

  const firstSet = await request('/auth/me', {
    method: 'PATCH', token: registered.data.token, body: { avatarUrl: first },
  });
  assert.equal(firstSet.response.status, 200, JSON.stringify(firstSet.data));
  assert.equal(firstSet.data.avatar_url, first);

  const replaced = await request('/auth/me', {
    method: 'PATCH', token: registered.data.token, body: { avatarUrl: second },
  });
  assert.equal(replaced.response.status, 200, JSON.stringify(replaced.data));
  assert.equal(replaced.data.avatar_url, second);

  await new Promise(resolve => setTimeout(resolve, 40));
  let oldUpload = await q('SELECT 1 FROM uploads WHERE url = $1', [first]);
  assert.equal(oldUpload.rowCount, 0, 'avatar substituído deve ser removido');

  const removed = await request('/auth/me', {
    method: 'PATCH', token: registered.data.token, body: { avatarUrl: null },
  });
  assert.equal(removed.response.status, 200, JSON.stringify(removed.data));
  assert.equal(removed.data.avatar_url, null);

  await new Promise(resolve => setTimeout(resolve, 40));
  oldUpload = await q('SELECT 1 FROM uploads WHERE url = $1', [second]);
  assert.equal(oldUpload.rowCount, 0, 'avatar removido deve libertar o upload');
});
