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

async function confirmedVideo(user, name) {
  const url = `https://media.example.test/${user.user.id}/${name}.mp4`;
  await q(
    `INSERT INTO uploads (owner_id,key,url,mime,bytes,confirmed_at)
     VALUES ($1,$2,$3,'video/mp4',4096,now())`,
    [user.user.id, `${user.user.id}/${name}.mp4`, url]
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

test('a assinatura aceita formatos de vídeo suportados e aplica o limite', async () => {
  const alice = await register('video.sign');

  const ok = await request('/uploads/sign', {
    method: 'POST', token: alice.token,
    body: { mime: 'video/mp4', bytes: 5 * 1024 * 1024 },
  });
  assert.equal(ok.response.status, 200, JSON.stringify(ok.data));
  assert.match(ok.data.key, /\.mp4$/);

  const tooBig = await request('/uploads/sign', {
    method: 'POST', token: alice.token,
    body: { mime: 'video/mp4', bytes: 513 * 1024 * 1024 },
  });
  assert.equal(tooBig.response.status, 400);
  assert.equal(tooBig.data.code, 'too_big');

  const unsupported = await request('/uploads/sign', {
    method: 'POST', token: alice.token,
    body: { mime: 'video/x-msvideo', bytes: 1024 },
  });
  assert.equal(unsupported.response.status, 400);
  assert.equal(unsupported.data.code, 'bad_type');
});

test('vídeo confirmado funciona em publicações e Momentos com MIME preservado', async () => {
  const alice = await register('video.post');
  const follower = await register('video.follower');
  await request(`/users/${alice.user.id}/follow`, { method: 'POST', token: follower.token });

  const momentUrl = await confirmedVideo(alice, 'moment-clip');
  const moment = await request('/moments', {
    method: 'POST', token: alice.token,
    body: { mediaUrl: momentUrl, palette: 0 },
  });
  assert.equal(moment.response.status, 201, JSON.stringify(moment.data));
  assert.equal(moment.data.media_mime, 'video/mp4');

  const moments = await request('/moments', { token: follower.token });
  const fromMoments = moments.data.find(row => row.id === moment.data.id);
  assert.ok(fromMoments);
  assert.equal(fromMoments.media_mime, 'video/mp4');

  const postUrl = await confirmedVideo(alice, 'post-clip');
  const post = await request('/posts', {
    method: 'POST', token: alice.token,
    body: { body: 'primeiro vídeo', mediaUrl: postUrl, palette: 0 },
  });
  assert.equal(post.response.status, 201, JSON.stringify(post.data));
  assert.equal(post.data.media_mime, 'video/mp4');

  const feed = await request('/posts/feed', { token: follower.token });
  const fromFeed = feed.data.posts.find(row => row.id === post.data.id);
  assert.ok(fromFeed);
  assert.equal(fromFeed.media_mime, 'video/mp4');
});
