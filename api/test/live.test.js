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
    method, headers,
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
      password: 'lumina-live-test-1234',
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
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await pool.end();
});

test('Lumina Live percorre criação, alertas, atividade e término sem depender do provider no CI', async () => {
  const creator = await register('live.creator');
  const follower = await register('live.follower');

  const follow = await request(`/users/${creator.user.id}/follow`, {
    method: 'POST', token: follower.token,
  });
  assert.equal(follow.response.status, 200, JSON.stringify(follow.data));
  assert.equal(follow.data.following, true);

  const config = await request('/live/config', { token: creator.token });
  assert.equal(config.response.status, 200);
  assert.equal(config.data.configured, false);

  const created = await request('/live', {
    method: 'POST', token: creator.token,
    body: { title: 'Direto de teste da Lumina', privacy: 'public' },
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.configured, false);
  assert.equal(created.data.publishUrl, null);
  assert.equal(created.data.playbackUrl, null);

  const started = await request(`/live/${created.data.id}/start`, {
    method: 'POST', token: creator.token,
  });
  assert.equal(started.response.status, 200, JSON.stringify(started.data));
  assert.equal(started.data.title, 'Direto de teste da Lumina');

  const activity = await request('/notifications', { token: follower.token });
  const liveNotice = activity.data.notifications.find(n => n.type === 'live_started');
  assert.ok(liveNotice, JSON.stringify(activity.data));
  assert.equal(liveNotice.actor_handle, 'live.creator');
  assert.equal(liveNotice.data.liveId, created.data.id);
  assert.equal(liveNotice.data.title, 'Direto de teste da Lumina');

  const listed = await request('/live', { token: follower.token });
  assert.equal(listed.response.status, 200, JSON.stringify(listed.data));
  assert.equal(listed.data.some(item => item.id === created.data.id), true);

  const heartbeat = await request(`/live/${created.data.id}/heartbeat`, {
    method: 'POST', token: follower.token,
  });
  assert.equal(heartbeat.response.status, 200);
  assert.ok(heartbeat.data.viewers >= 1);

  const comment = await request(`/live/${created.data.id}/comments`, {
    method: 'POST', token: follower.token, body: { body: 'Olá direto 👋' },
  });
  assert.equal(comment.response.status, 201, JSON.stringify(comment.data));
  assert.equal(comment.data.body, 'Olá direto 👋');

  const reaction = await request(`/live/${created.data.id}/reactions/fire`, {
    method: 'POST', token: follower.token,
  });
  assert.equal(reaction.response.status, 201);

  const liveActivity = await request(`/live/${created.data.id}/activity`, { token: creator.token });
  assert.equal(liveActivity.response.status, 200, JSON.stringify(liveActivity.data));
  assert.equal(liveActivity.data.comments.some(item => item.body === 'Olá direto 👋'), true);
  assert.ok(liveActivity.data.fires >= 1);
  assert.ok(liveActivity.data.viewers >= 1);

  const ended = await request(`/live/${created.data.id}/end`, {
    method: 'POST', token: creator.token,
  });
  assert.equal(ended.response.status, 200, JSON.stringify(ended.data));

  const after = await request('/live', { token: follower.token });
  assert.equal(after.response.status, 200);
  assert.equal(after.data.some(item => item.id === created.data.id), false);

  const endedStream = await request(`/live/${created.data.id}`, { token: follower.token });
  assert.equal(endedStream.response.status, 200);
  assert.equal(endedStream.data.status, 'ended');
});
