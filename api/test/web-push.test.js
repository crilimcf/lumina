import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/server.js';
import { migrate, pool, q } from '../src/db.js';

let server;
let baseUrl;
let token;

async function request(path, { method='GET', body } = {}) {
  const headers = { authorization:`Bearer ${token}` };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  return { response, data };
}

before(async () => {
  await migrate();
  const { rows } = await q(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations'`);
  if (rows.length) await q(`TRUNCATE ${rows.map(({tablename})=>`"${String(tablename).replaceAll('"','""')}"`).join(', ')} RESTART IDENTITY CASCADE`);

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve,reject)=>{ server.once('listening',resolve); server.once('error',reject); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const registration = await fetch(`${baseUrl}/auth/register`, {
    method:'POST', headers:{ 'content-type':'application/json' },
    body:JSON.stringify({
      handle:'push.qa', email:'push.qa@example.test', password:'lumina-test-1234',
      name:'Push QA', birthDate:'1990-01-01', acceptTerms:true,
    }),
  });
  assert.equal(registration.status, 201);
  token = (await registration.json()).token;
  assert.ok(token);
});

after(async () => {
  if (server) await new Promise(resolve=>server.close(resolve));
  await pool.end();
});

test('chave VAPID pública é P-256 válida e permanece estável', async () => {
  const first = await request('/notifications/push/key');
  assert.equal(first.response.status, 200, JSON.stringify(first.data));
  const bytes = Buffer.from(first.data.publicKey, 'base64url');
  assert.equal(bytes.length, 65);
  assert.equal(bytes[0], 4);

  const second = await request('/notifications/push/key');
  assert.equal(second.response.status, 200);
  assert.equal(second.data.publicKey, first.data.publicKey);

  const { rows } = await q(`SELECT value ? 'd' AS has_private FROM app_secrets WHERE name='web_push_vapid_v1'`);
  assert.equal(rows[0]?.has_private, true);
});

test('subscrição push pertence à conta e pode ser removida', async () => {
  const endpoint = 'https://push.example.test/subscription/lumina-test';
  const subscribed = await request('/notifications/push/subscribe', {
    method:'POST',
    body:{ endpoint, keys:{ p256dh:'test-p256dh', auth:'test-auth' } },
  });
  assert.equal(subscribed.response.status, 201, JSON.stringify(subscribed.data));
  assert.equal(subscribed.data.subscribed, true);

  const status = await request('/notifications/push/status');
  assert.equal(status.response.status, 200);
  assert.equal(status.data.subscribed, true);
  assert.equal(status.data.devices, 1);

  const removed = await request('/notifications/push/unsubscribe', { method:'POST', body:{ endpoint } });
  assert.equal(removed.response.status, 200);
  assert.equal(removed.data.subscribed, false);

  const finalStatus = await request('/notifications/push/status');
  assert.equal(finalStatus.data.subscribed, false);
  assert.equal(finalStatus.data.devices, 0);
});

test('subscrição rejeita endpoints que não sejam HTTPS', async () => {
  const bad = await request('/notifications/push/subscribe', {
    method:'POST', body:{ endpoint:'http://localhost/push', keys:{} },
  });
  assert.equal(bad.response.status, 400);
  assert.equal(bad.data.code, 'bad_push_subscription');
});
