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
    try { data = JSON.parse(text); } catch { data = text; }
  }
  return { response, data };
}

async function register(handle) {
  const out = await request('/auth/register', {
    method: 'POST',
    body: {
      handle,
      email: `${handle}@example.test`,
      password: 'lumina-test-1234',
      name: handle,
      birthDate: '1990-01-01',
      acceptTerms: true,
    },
  });
  assert.equal(out.response.status, 201, JSON.stringify(out.data));
  return out.data;
}

async function communityFor(user) {
  const out = await request('/communities', {
    method: 'POST', token: user.token,
    body: {
      slug: 'video-posts',
      name: 'Video posts',
      seedProposals: ['ideia um', 'ideia dois', 'ideia tres', 'ideia quatro', 'ideia cinco'],
    },
  });
  assert.equal(out.response.status, 201, JSON.stringify(out.data));
  return out.data;
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

test('a rota de assinatura aceita formatos de vídeo suportados e aplica o limite de vídeo', async () => {
  const alice = await register('video.sign');

  const ok = await request('/uploads/sign', {
    method: 'POST', token: alice.token,
    body: { mime: 'video/mp4', bytes: 5 * 1024 * 1024 },
  });
  assert.equal(ok.response.status, 200, JSON.stringify(ok.data));
  assert.match(ok.data.key, /\.mp4$/);

  const tooBig = await request('/uploads/sign', {
    method: 'POST', token: alice.token,
    body: { mime: 'video/mp4', bytes: 101 * 1024 * 1024 },
  });
  assert.equal(tooBig.response.status, 400, JSON.stringify(tooBig.data));
  assert.equal(tooBig.data.code, 'too_big');

  const unsupported = await request('/uploads/sign', {
    method: 'POST', token: alice.token,
    body: { mime: 'video/x-msvideo', bytes: 1024 },
  });
  assert.equal(unsupported.response.status, 400, JSON.stringify(unsupported.data));
  assert.equal(unsupported.data.code, 'bad_type');
});

test('vídeo confirmado pode ser usado num post mas continua bloqueado em conteúdos que só suportam imagem', async () => {
  const alice = await register('video.post');
  const community = await communityFor(alice);
  const url = `https://media.example.test/${alice.user.id}/clip.mp4`;

  await q(
    `INSERT INTO uploads (owner_id, key, url, mime, bytes, confirmed_at)
     VALUES ($1, $2, $3, 'video/mp4', 4096, now())`,
    [alice.user.id, `${alice.user.id}/clip.mp4`, url]
  );

  const moment = await request('/moments', {
    method: 'POST', token: alice.token,
    body: { mediaUrl: url, palette: 0 },
  });
  assert.equal(moment.response.status, 400, JSON.stringify(moment.data));
  assert.equal(moment.data.code, 'unconfirmed_upload');

  const post = await request('/posts', {
    method: 'POST', token: alice.token,
    body: { communityId: community.id, body: 'primeiro vídeo', mediaUrl: url, palette: 0 },
  });
  assert.equal(post.response.status, 201, JSON.stringify(post.data));
  assert.equal(post.data.media_mime, 'video/mp4');

  const feed = await request('/posts/feed', { token: alice.token });
  assert.equal(feed.response.status, 200, JSON.stringify(feed.data));
  const fromFeed = feed.data.posts.find((row) => row.id === post.data.id);
  assert.ok(fromFeed);
  assert.equal(fromFeed.media_mime, 'video/mp4');
});
