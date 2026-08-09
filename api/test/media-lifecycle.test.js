import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/server.js';
import { migrate, pool, q } from '../src/db.js';
import { purgeMessages, purgeMoments, runAccountDeletions } from '../src/jobs/daily.js';

let server;
let baseUrl;

async function request(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  return { response, data };
}

async function register(handle) {
  const out = await request('/auth/register', {
    method: 'POST',
    body: { handle, email: `${handle}@example.test`, password: 'lumina-test-1234', name: handle, birthDate: '1990-01-01', acceptTerms: true },
  });
  assert.equal(out.response.status, 201, JSON.stringify(out.data));
  return out.data;
}

async function confirmedUpload(ownerId, suffix, mime = 'image/jpeg') {
  const ext = mime.startsWith('video/') ? 'mp4' : 'jpg';
  const url = `https://media.example.test/${ownerId}/${suffix}.${ext}`;
  const key = `${ownerId}/${suffix}.${ext}`;
  await q(
    `INSERT INTO uploads (owner_id,key,url,mime,bytes,confirmed_at)
     VALUES ($1,$2,$3,$4,1234,now())`,
    [ownerId, key, url, mime]
  );
  return url;
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

test('um upload confirmado só pode ser consumido por um conteúdo', async () => {
  const alice = await register('media.alice');
  const url = await confirmedUpload(alice.user.id, 'single-use');

  const post = await request('/posts', {
    method: 'POST', token: alice.token,
    body: { body: 'usa a imagem uma vez', mediaUrl: url, palette: 0 },
  });
  assert.equal(post.response.status, 201, JSON.stringify(post.data));

  const stored = await q('SELECT consumed_at,purpose FROM uploads WHERE url=$1', [url]);
  assert.ok(stored.rows[0].consumed_at);
  assert.equal(stored.rows[0].purpose, 'post');

  const reuse = await request('/moments', {
    method: 'POST', token: alice.token, body: { mediaUrl: url, palette: 0 },
  });
  assert.equal(reuse.response.status, 400);
  assert.equal(reuse.data.code, 'unconfirmed_upload');
});

test('apagar o original apaga o repost e liberta o upload', async () => {
  const alice = await register('repost.alice');
  const bob = await register('repost.bob');
  await request(`/users/${alice.user.id}/follow`, { method: 'POST', token: bob.token });
  const url = await confirmedUpload(alice.user.id, 'repost-source');

  const post = await request('/posts', {
    method: 'POST', token: alice.token,
    body: { body: 'imagem original', mediaUrl: url, palette: 0 },
  });
  assert.equal(post.response.status, 201, JSON.stringify(post.data));

  const repost = await request(`/posts/${post.data.id}/repost`, { method: 'POST', token: bob.token });
  assert.equal(repost.response.status, 201, JSON.stringify(repost.data));

  const deleted = await request(`/posts/${post.data.id}`, { method: 'DELETE', token: alice.token });
  assert.equal(deleted.response.status, 200);
  await new Promise(resolve => setTimeout(resolve, 25));

  assert.equal((await q('SELECT 1 FROM posts WHERE id=$1', [repost.data.id])).rows.length, 0);
  assert.equal((await q('SELECT 1 FROM uploads WHERE url=$1', [url])).rows.length, 0);
});

test('foto de uma vez é purgada da mensagem e dos uploads quando expira', async () => {
  const alice = await register('once.alice');
  const bob = await register('once.bob');
  const thread = await request('/messages/threads', { method: 'POST', token: alice.token, body: { userId: bob.user.id } });
  assert.equal(thread.response.status, 201);

  const url = await confirmedUpload(alice.user.id, 'once-photo');
  const sent = await request(`/messages/threads/${thread.data.id}/messages`, {
    method: 'POST', token: alice.token,
    body: { kind: 'media', mode: 'once', mediaUrl: url, palette: 0 },
  });
  assert.equal(sent.response.status, 201, JSON.stringify(sent.data));
  assert.equal((await request(`/messages/${sent.data.id}/open`, { method: 'POST', token: bob.token })).response.status, 200);

  await q(`UPDATE messages SET expires_at=now()-interval '1 second' WHERE id=$1`, [sent.data.id]);
  assert.equal(await purgeMessages(), 1);
  const saved = await q('SELECT body,media_url,purged_at FROM messages WHERE id=$1', [sent.data.id]);
  assert.equal(saved.rows[0].body, null);
  assert.equal(saved.rows[0].media_url, null);
  assert.ok(saved.rows[0].purged_at);
  assert.equal((await q('SELECT 1 FROM uploads WHERE url=$1', [url])).rows.length, 0);
});

test('Momento publicado substitui media sem reiniciar 24h', async () => {
  const alice = await register('moment.edit');
  const originalUrl = await confirmedUpload(alice.user.id, 'moment-original');
  const replacementUrl = await confirmedUpload(alice.user.id, 'moment-replacement');

  const created = await request('/moments', { method: 'POST', token: alice.token, body: { mediaUrl: originalUrl, palette: 1 } });
  assert.equal(created.response.status, 201);
  const expiry = new Date(created.data.expires_at).getTime();

  const edited = await request(`/moments/${created.data.id}`, {
    method: 'PATCH', token: alice.token, body: { mediaUrl: replacementUrl, palette: 3 },
  });
  assert.equal(edited.response.status, 200, JSON.stringify(edited.data));
  assert.equal(edited.data.media_url, replacementUrl);
  assert.equal(new Date(edited.data.expires_at).getTime(), expiry);

  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal((await q('SELECT 1 FROM uploads WHERE url=$1', [originalUrl])).rows.length, 0);
});

test('Momento expirado remove a linha e o upload associado', async () => {
  const alice = await register('moment.expired');
  const url = await confirmedUpload(alice.user.id, 'moment-expired');
  const moment = await request('/moments', { method: 'POST', token: alice.token, body: { mediaUrl: url, palette: 1 } });
  assert.equal(moment.response.status, 201);
  await q(`UPDATE moments SET expires_at=now()-interval '1 second' WHERE id=$1`, [moment.data.id]);
  assert.equal(await purgeMoments(), 1);
  assert.equal((await q('SELECT 1 FROM moments WHERE id=$1', [moment.data.id])).rows.length, 0);
  assert.equal((await q('SELECT 1 FROM uploads WHERE url=$1', [url])).rows.length, 0);
});

test('apagamento RGPD do autor remove reposts derivados e o upload', async () => {
  const alice = await register('erase.alice');
  const bob = await register('erase.bob');
  await request(`/users/${alice.user.id}/follow`, { method: 'POST', token: bob.token });
  const url = await confirmedUpload(alice.user.id, 'erase-source');
  const post = await request('/posts', { method: 'POST', token: alice.token, body: { body: 'vai ser apagado', mediaUrl: url, palette: 0 } });
  const repost = await request(`/posts/${post.data.id}/repost`, { method: 'POST', token: bob.token });
  assert.equal(repost.response.status, 201);

  await request('/account/delete', { method: 'POST', token: alice.token });
  await q(`UPDATE deletion_requests SET execute_at=now()-interval '1 minute' WHERE user_id=$1`, [alice.user.id]);
  assert.equal(await runAccountDeletions(), 1);

  assert.equal((await q('SELECT 1 FROM posts WHERE id=$1', [repost.data.id])).rows.length, 0);
  assert.equal((await q('SELECT 1 FROM uploads WHERE url=$1', [url])).rows.length, 0);
});
