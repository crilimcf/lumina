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

async function register(handle, name = handle) {
  const out = await request('/auth/register', {
    method: 'POST',
    body: {
      handle,
      email: `${handle.replaceAll('.', '-')}@example.test`,
      password: 'lumina-test-1234',
      name,
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

test('health responde apenas quando a base de dados está acessível', async () => {
  const { response, data } = await request('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(data, { ok: true });
});

test('registo recusa utilizadores abaixo da idade mínima', async () => {
  const { response, data } = await request('/auth/register', {
    method: 'POST',
    body: {
      handle: 'demasiado.novo',
      email: 'novo@example.test',
      password: 'lumina-test-1234',
      name: 'Utilizador Novo',
      birthDate: '2015-01-01',
      acceptTerms: true,
    },
  });
  assert.equal(response.status, 400);
  assert.equal(data.code, 'too_young');
});

test('Feed, reações e comentários obedecem ao grafo social e aos bloqueios', async () => {
  const alice = await register('social.alice', 'Alice Social');
  const bob = await register('social.bob', 'Bob Social');
  const charlie = await register('social.charlie', 'Charlie Social');

  const created = await request('/posts', {
    method: 'POST', token: alice.token,
    body: { body: 'Publicação social sem grupo', palette: 1 },
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.body, 'Publicação social sem grupo');
  assert.equal(Object.hasOwn(created.data, 'community_id'), false);

  const beforeFollow = await request('/posts/feed', { token: bob.token });
  assert.equal(beforeFollow.response.status, 200);
  assert.equal(beforeFollow.data.posts.some(p => p.id === created.data.id), false);

  const forbiddenReaction = await request(`/posts/${created.data.id}/reactions/like`, {
    method: 'POST', token: bob.token,
  });
  assert.equal(forbiddenReaction.response.status, 403);

  const followed = await request(`/users/${alice.user.id}/follow`, {
    method: 'POST', token: bob.token,
  });
  assert.equal(followed.response.status, 200, JSON.stringify(followed.data));
  assert.equal(followed.data.following, true);

  const afterFollow = await request('/posts/feed', { token: bob.token });
  assert.equal(afterFollow.response.status, 200);
  assert.equal(afterFollow.data.posts.some(p => p.id === created.data.id), true);

  const liked = await request(`/posts/${created.data.id}/reactions/like`, {
    method: 'POST', token: bob.token,
  });
  assert.equal(liked.response.status, 200);
  assert.equal(liked.data.active, true);

  const commented = await request(`/posts/${created.data.id}/comments`, {
    method: 'POST', token: bob.token, body: { body: 'Comentário visível' },
  });
  assert.equal(commented.response.status, 201, JSON.stringify(commented.data));

  const charlieFeed = await request('/posts/feed', { token: charlie.token });
  assert.equal(charlieFeed.data.posts.some(p => p.id === created.data.id), false);

  const blocked = await request(`/users/${alice.user.id}/block`, {
    method: 'POST', token: bob.token,
  });
  assert.equal(blocked.response.status, 200);
  const afterBlock = await request('/posts/feed', { token: bob.token });
  assert.equal(afterBlock.data.posts.some(p => p.id === created.data.id), false);
});

test('publicação valida payload e permite editar/apagar apenas ao autor', async () => {
  const alice = await register('post.alice');
  const bob = await register('post.bob');

  const badPalette = await request('/posts', {
    method: 'POST', token: alice.token,
    body: { body: 'Cor inválida', palette: -1 },
  });
  assert.equal(badPalette.response.status, 400);
  assert.equal(badPalette.data.code, 'bad_palette');

  const post = await request('/posts', {
    method: 'POST', token: alice.token,
    body: { body: 'Texto original', palette: 0 },
  });
  assert.equal(post.response.status, 201);

  const otherEdit = await request(`/posts/${post.data.id}`, {
    method: 'PATCH', token: bob.token, body: { body: 'Não pode' },
  });
  assert.equal(otherEdit.response.status, 404);

  const ownEdit = await request(`/posts/${post.data.id}`, {
    method: 'PATCH', token: alice.token, body: { body: 'Texto corrigido' },
  });
  assert.equal(ownEdit.response.status, 200);
  assert.equal(ownEdit.data.body, 'Texto corrigido');
  assert.ok(ownEdit.data.edited_at);

  const ownDelete = await request(`/posts/${post.data.id}`, {
    method: 'DELETE', token: alice.token,
  });
  assert.equal(ownDelete.response.status, 200);
  assert.equal(ownDelete.data.deleted, true);
});

test('mensagem normal não pode ser transformada em efémera ao ser aberta', async () => {
  const alice = await register('message.alice');
  const bob = await register('message.bob');
  const thread = await request('/messages/threads', {
    method: 'POST', token: alice.token, body: { userId: bob.user.id },
  });
  assert.equal(thread.response.status, 201, JSON.stringify(thread.data));

  const normal = await request(`/messages/threads/${thread.data.id}/messages`, {
    method: 'POST', token: alice.token,
    body: { kind: 'text', mode: 'normal', body: 'Isto fica.' },
  });
  assert.equal(normal.response.status, 201);

  const opened = await request(`/messages/${normal.data.id}/open`, {
    method: 'POST', token: bob.token,
  });
  assert.equal(opened.response.status, 400);
  assert.equal(opened.data.code, 'not_ephemeral');
});

test('mudar a password revoga imediatamente a sessão antiga', async () => {
  const alice = await register('password.alice');
  const changed = await request('/auth/change-password', {
    method: 'POST', token: alice.token,
    body: { current: 'lumina-test-1234', password: 'lumina-test-5678' },
  });
  assert.equal(changed.response.status, 200, JSON.stringify(changed.data));
  assert.ok(changed.data.token);

  const oldSession = await request('/auth/me', { token: alice.token });
  assert.equal(oldSession.response.status, 401);
  assert.equal(oldSession.data.code, 'session_revoked');

  const newSession = await request('/auth/me', { token: changed.data.token });
  assert.equal(newSession.response.status, 200);
});
