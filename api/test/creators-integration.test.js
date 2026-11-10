import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Draft studio is independently enabled; payment collection remains disabled.
process.env.FEATURE_CREATORS = 'true';
process.env.FEATURE_SUBSCRIPTIONS = 'false';

const [{ default: app }, { migrate, q, pool }, { signToken }] = await Promise.all([
  import('../src/server.js'),
  import('../src/db.js'),
  import('../src/middleware/auth.js'),
]);

let server;
let baseUrl;
let creator;
let subscriber;
let creatorToken;
let subscriberToken;
let planId;
let contentId;

const request = async (path, { token, method = 'GET', body } = {}) => {
  const response = await fetch(baseUrl + path, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
};

before(async () => {
  await migrate();
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const { rows } = await q(
    `INSERT INTO users (handle,email,password_hash,name)
     VALUES ($1,$2,'test-hash','Creator Test'),($3,$4,'test-hash','Subscriber Test')
     RETURNING id,handle,session_version`,
    [`cre.${suffix}`, `cre.${suffix}@example.test`, `sub.${suffix}`, `sub.${suffix}@example.test`]
  );
  [creator, subscriber] = rows;
  creatorToken = signToken(creator);
  subscriberToken = signToken(subscriber);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (creator && subscriber) await q('DELETE FROM users WHERE id=$1 OR id=$2', [creator.id, subscriber.id]);
  await pool.end();
});

test('studio refuses unauthenticated users and invalid plan amounts', async () => {
  assert.equal((await request('/api/creators/me/plans')).status, 401);
  assert.equal((await request('/api/creators/me/content')).status, 401);
  assert.equal((await request('/api/creators/me/plans', {
    token: creatorToken, method: 'POST',
    body: { title: 'Apoiantes', billing_period: 'month', price_cents: 0 },
  })).status, 400);
});

test('creator can draft a plan; no public purchase or membership activation', async () => {
  const response = await request('/api/creators/me/plans', {
    token: creatorToken, method: 'POST',
    body: { title: 'Comunidade', billing_period: 'month', price_cents: 500 },
  });
  assert.equal(response.status, 201);
  assert.equal(response.data.plan.status, 'draft');
  planId = response.data.plan.id;
  const mine = await request('/api/creators/me/plans', { token: creatorToken });
  assert.equal(mine.data.plans.some(p => p.id === planId), true);
  const publicPlans = await request(`/api/creators/${creator.id}/plans`);
  assert.equal(publicPlans.status, 200);
  assert.equal(publicPlans.data.plans.some(p => p.id === planId), false);
  assert.equal((await request('/api/creators/me/memberships/activate', {
    token: subscriberToken, method: 'POST', body: { creator_id: creator.id },
  })).status, 404);
});

test('owner can prepare exclusive content but cannot publish another user\'s drafts', async () => {
  const created = await request('/api/creators/me/content', {
    token: creatorToken, method: 'POST', body: { title: 'Primeiro conteúdo', body: 'Exclusivo para membros' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.content.status, 'draft');
  contentId = created.data.content.id;
  assert.equal((await request(`/api/creators/me/content/${contentId}/publish`, {
    token: subscriberToken, method: 'POST',
  })).status, 404);
  const prepared = await request(`/api/creators/me/content/${contentId}/publish`, {
    token: creatorToken, method: 'POST',
  });
  assert.equal(prepared.status, 200);
  assert.equal(prepared.data.content.status, 'published');
  const ownerView = await request(`/api/creators/${creator.id}/content`, { token: creatorToken });
  assert.equal(ownerView.data.content.some(c => c.id === contentId), true);
});

test('published premium content stays private without active provider-backed membership', async () => {
  const anonymous = await request(`/api/creators/${creator.id}/content`);
  assert.equal(anonymous.status, 401);
  const outsider = await request(`/api/creators/${creator.id}/content`, { token: subscriberToken });
  assert.equal(outsider.status, 200);
  assert.deepEqual(outsider.data.content, []);
});

test('membership authorizes reads only while active, unexpired, and unblocked', async () => {
  const subId = `sub_test_${randomUUID()}`;
  const inserted = await q(
    `INSERT INTO creator_memberships (creator_id,subscriber_id,plan_id,provider,provider_subscription_id,status,current_period_end)
     VALUES ($1,$2,$3,'stripe',$4,'active',now()+interval '1 day') RETURNING id`,
    [creator.id,subscriber.id,planId,subId]
  );
  const membershipId = inserted.rows[0].id;
  const read = async () => (await request(`/api/creators/${creator.id}/content`, { token: subscriberToken })).data.content;
  assert.equal((await read()).some(c => c.id === contentId), true);
  await q('INSERT INTO blocks (blocker_id,blocked_id) VALUES ($1,$2)', [creator.id,subscriber.id]);
  assert.deepEqual(await read(), []);
  await q('DELETE FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [creator.id,subscriber.id]);
  await q(`UPDATE creator_memberships SET current_period_end=now()-interval '1 second' WHERE id=$1`, [membershipId]);
  assert.deepEqual(await read(), []);
  await q(`UPDATE creator_memberships SET current_period_end=now()+interval '1 day',status='cancelled' WHERE id=$1`, [membershipId]);
  assert.deepEqual(await read(), []);
});

test('creator cannot exceed 50 stored posts, protecting the bounded database volume', async () => {
  await q(
    `INSERT INTO creator_member_content (creator_id,title,body)
     SELECT $1, 'Limite ' || n, '' FROM generate_series(1,49) AS n`,
    [creator.id]
  );
  const blocked = await request('/api/creators/me/content', {
    token: creatorToken, method: 'POST',
    body: { title: 'Acima do limite', body: 'Não deve ser guardado' },
  });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.data.code, 'creator_content_limit');
});
