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
      email: `${handle.replaceAll('.', '-') }@example.test`,
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

test('post auto-ocultado deixa de aceitar acesso social por UUID até ser reposto', async () => {
  const founder = await register('hidden.founder');
  const reporters = await Promise.all([
    register('hidden.r1'),
    register('hidden.r2'),
    register('hidden.r3'),
  ]);

  const community = await request('/communities', {
    method: 'POST', token: founder.token,
    body: {
      slug: 'hidden-post-test',
      name: 'Hidden Post Test',
      seedProposals: ['ideia um', 'ideia dois', 'ideia tres', 'ideia quatro', 'ideia cinco'],
    },
  });
  assert.equal(community.response.status, 201, JSON.stringify(community.data));

  for (const reporter of reporters) {
    const joined = await request(`/communities/${community.data.id}/join`, {
      method: 'POST', token: reporter.token,
    });
    assert.equal(joined.response.status, 200);
  }

  const post = await request('/posts', {
    method: 'POST', token: founder.token,
    body: { communityId: community.data.id, body: 'conteúdo para moderação', palette: 0 },
  });
  assert.equal(post.response.status, 201, JSON.stringify(post.data));

  for (let i = 0; i < reporters.length; i++) {
    const reported = await request('/reports', {
      method: 'POST', token: reporters[i].token,
      body: { targetType: 'post', targetId: post.data.id, reason: 'abuso' },
    });
    assert.equal(reported.response.status, 201, JSON.stringify(reported.data));
    if (i === reporters.length - 1) assert.equal(reported.data.hidden, true);
  }

  const { rows: stored } = await q('SELECT hidden_at FROM posts WHERE id = $1', [post.data.id]);
  assert.ok(stored[0].hidden_at);

  const feed = await request('/posts/feed', { token: reporters[0].token });
  assert.equal(feed.response.status, 200);
  assert.equal(feed.data.posts.some(p => p.id === post.data.id), false);

  const comments = await request(`/posts/${post.data.id}/comments`, { token: reporters[0].token });
  assert.equal(comments.response.status, 403);

  const comment = await request(`/posts/${post.data.id}/comments`, {
    method: 'POST', token: reporters[0].token, body: { body: 'não deve entrar' },
  });
  assert.equal(comment.response.status, 403);

  const reaction = await request(`/posts/${post.data.id}/reactions/like`, {
    method: 'POST', token: reporters[0].token,
  });
  assert.equal(reaction.response.status, 403);

  const repost = await request(`/posts/${post.data.id}/repost`, {
    method: 'POST', token: reporters[0].token,
  });
  assert.equal(repost.response.status, 404);

  const queue = await request(`/reports/community/${community.data.id}`, { token: founder.token });
  assert.equal(queue.response.status, 200);
  const report = queue.data.find(r => r.target_id === post.data.id);
  assert.ok(report);

  const restored = await request(`/reports/${report.id}/resolve`, {
    method: 'POST', token: founder.token, body: { resolution: 'mantido' },
  });
  assert.equal(restored.response.status, 200, JSON.stringify(restored.data));

  const commentsAfterRestore = await request(`/posts/${post.data.id}/comments`, { token: reporters[0].token });
  assert.equal(commentsAfterRestore.response.status, 200);
});
