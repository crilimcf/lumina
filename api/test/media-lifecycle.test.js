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

async function confirmedUpload(ownerId, suffix) {
  const url = `https://media.example.test/${ownerId}/${suffix}.jpg`;
  const key = `${ownerId}/${suffix}.jpg`;
  await q(
    `INSERT INTO uploads (owner_id, key, url, mime, bytes, confirmed_at)
     VALUES ($1, $2, $3, 'image/jpeg', 1234, now())`,
    [ownerId, key, url]
  );
  return url;
}

async function communityFor(user, slug) {
  const out = await request('/communities', {
    method: 'POST', token: user.token,
    body: {
      slug,
      name: slug,
      seedProposals: ['primeiro teste', 'segundo teste', 'terceiro teste', 'quarto teste', 'quinto teste'],
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

test('um upload confirmado só pode ser consumido por um conteúdo', async () => {
  const alice = await register('media.alice');
  const community = await communityFor(alice, 'media-single-use');
  const url = await confirmedUpload(alice.user.id, 'single-use');

  const post = await request('/posts', {
    method: 'POST', token: alice.token,
    body: { communityId: community.id, body: 'usa a imagem uma vez', mediaUrl: url, palette: 0 },
  });
  assert.equal(post.response.status, 201, JSON.stringify(post.data));

  const { rows } = await q('SELECT consumed_at, purpose FROM uploads WHERE url = $1', [url]);
  assert.ok(rows[0].consumed_at);
  assert.equal(rows[0].purpose, 'post');

  const reuse = await request('/moments', {
    method: 'POST', token: alice.token, body: { mediaUrl: url, palette: 0 },
  });
  assert.equal(reuse.response.status, 400);
  assert.equal(reuse.data.code, 'unconfirmed_upload');
});

test('apagar o original apaga também o repost e liberta o upload', async () => {
  const alice = await register('repost.alice');
  const bob = await register('repost.bob');
  const community = await communityFor(alice, 'media-repost');
  await request(`/communities/${community.id}/join`, { method: 'POST', token: bob.token });
  const url = await confirmedUpload(alice.user.id, 'repost-source');

  const post = await request('/posts', {
    method: 'POST', token: alice.token,
    body: { communityId: community.id, body: 'imagem original', mediaUrl: url, palette: 0 },
  });
  assert.equal(post.response.status, 201, JSON.stringify(post.data));

  const repost = await request(`/posts/${post.data.id}/repost`, { method: 'POST', token: bob.token });
  assert.equal(repost.response.status, 201, JSON.stringify(repost.data));

  const deleted = await request(`/posts/${post.data.id}`, { method: 'DELETE', token: alice.token });
  assert.equal(deleted.response.status, 200);

  // repost_of tem ON DELETE CASCADE: um repost é referência ao original, não
  // uma cópia independente que sobreviva ao apagamento do autor.
  await new Promise(resolve => setTimeout(resolve, 25));
  {
    const { rows } = await q('SELECT 1 FROM posts WHERE id = $1', [repost.data.id]);
    assert.equal(rows.length, 0);
  }
  {
    const { rows } = await q('SELECT 1 FROM uploads WHERE url = $1', [url]);
    assert.equal(rows.length, 0);
  }
});

test('foto de uma vez é purgada da mensagem e da tabela de uploads quando expira', async () => {
  const alice = await register('once.alice');
  const bob = await register('once.bob');
  const thread = await request('/messages/threads', {
    method: 'POST', token: alice.token, body: { userId: bob.user.id },
  });
  assert.equal(thread.response.status, 201, JSON.stringify(thread.data));

  const url = await confirmedUpload(alice.user.id, 'once-photo');
  const sent = await request(`/messages/threads/${thread.data.id}/messages`, {
    method: 'POST', token: alice.token,
    body: { kind: 'media', mode: 'once', mediaUrl: url, palette: 0 },
  });
  assert.equal(sent.response.status, 201, JSON.stringify(sent.data));

  const opened = await request(`/messages/${sent.data.id}/open`, { method: 'POST', token: bob.token });
  assert.equal(opened.response.status, 200, JSON.stringify(opened.data));

  await q(`UPDATE messages SET expires_at = now() - interval '1 second' WHERE id = $1`, [sent.data.id]);
  assert.equal(await purgeMessages(), 1);

  {
    const { rows } = await q('SELECT body, media_url, purged_at FROM messages WHERE id = $1', [sent.data.id]);
    assert.equal(rows[0].body, null);
    assert.equal(rows[0].media_url, null);
    assert.ok(rows[0].purged_at);
  }
  {
    const { rows } = await q('SELECT 1 FROM uploads WHERE url = $1', [url]);
    assert.equal(rows.length, 0);
  }
});

test('Momento expirado remove a linha e o upload associado', async () => {
  const alice = await register('moment.alice');
  const url = await confirmedUpload(alice.user.id, 'moment-photo');
  const moment = await request('/moments', {
    method: 'POST', token: alice.token, body: { mediaUrl: url, palette: 1 },
  });
  assert.equal(moment.response.status, 201, JSON.stringify(moment.data));

  await q(`UPDATE moments SET expires_at = now() - interval '1 second' WHERE id = $1`, [moment.data.id]);
  assert.equal(await purgeMoments(), 1);

  const m = await q('SELECT 1 FROM moments WHERE id = $1', [moment.data.id]);
  assert.equal(m.rows.length, 0);
  const u = await q('SELECT 1 FROM uploads WHERE url = $1', [url]);
  assert.equal(u.rows.length, 0);
});

test('apagamento RGPD do autor remove reposts derivados e o upload', async () => {
  const alice = await register('erase.alice');
  const bob = await register('erase.bob');
  const community = await communityFor(alice, 'erase-media');
  await request(`/communities/${community.id}/join`, { method: 'POST', token: bob.token });
  const url = await confirmedUpload(alice.user.id, 'erase-source');

  const post = await request('/posts', {
    method: 'POST', token: alice.token,
    body: { communityId: community.id, body: 'vai ser apagado', mediaUrl: url, palette: 0 },
  });
  assert.equal(post.response.status, 201, JSON.stringify(post.data));
  const repost = await request(`/posts/${post.data.id}/repost`, { method: 'POST', token: bob.token });
  assert.equal(repost.response.status, 201, JSON.stringify(repost.data));

  await request('/account/delete', { method: 'POST', token: alice.token });
  await q(
    `UPDATE deletion_requests SET execute_at = now() - interval '1 minute' WHERE user_id = $1`,
    [alice.user.id]
  );
  assert.equal(await runAccountDeletions(), 1);

  // Apagar o post original por CASCADE apaga também o repost.
  const surviving = await q('SELECT 1 FROM posts WHERE id = $1', [repost.data.id]);
  assert.equal(surviving.rows.length, 0);
  const upload = await q('SELECT 1 FROM uploads WHERE url = $1', [url]);
  assert.equal(upload.rows.length, 0);
});
