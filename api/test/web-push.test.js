import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/server.js';
import { migrate, pool, q } from '../src/db.js';

let server;
let baseUrl;
let token;
let userId;

async function requestAs(authToken, path, { method='GET', body } = {}) {
  const headers = authToken ? { authorization:`Bearer ${authToken}` } : {};
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

const request = (path, options) => requestAs(token, path, options);

async function register(handle, name = handle) {
  const out = await requestAs(null, '/auth/register', {
    method:'POST',
    body:{
      handle, email:`${handle}@example.test`, password:'lumina-test-1234',
      name, birthDate:'1990-01-01', acceptTerms:true,
    },
  });
  assert.equal(out.response.status, 201, JSON.stringify(out.data));
  return out.data;
}

before(async () => {
  await migrate();
  const { rows } = await q(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations'`);
  if (rows.length) await q(`TRUNCATE ${rows.map(({tablename})=>`"${String(tablename).replaceAll('"','""')}"`).join(', ')} RESTART IDENTITY CASCADE`);

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve,reject)=>{ server.once('listening',resolve); server.once('error',reject); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const registration = await register('push.qa', 'Push QA');
  token = registration.token;
  userId = registration.user.id;
  assert.ok(token);
  assert.ok(userId);
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
  const endpoint = 'https://fcm.googleapis.com/fcm/send/lumina-test-subscription';
  const subscribed = await request('/notifications/push/subscribe', {
    method:'POST',
    body:{ endpoint, keys:{ p256dh:'test-p256dh', auth:'test-auth' }, locale:'fr-FR' },
  });
  assert.equal(subscribed.response.status, 201, JSON.stringify(subscribed.data));
  assert.equal(subscribed.data.subscribed, true);
  assert.equal(subscribed.data.locale, 'fr');

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

test('subscrição rejeita HTTP e hosts HTTPS arbitrários', async () => {
  for (const endpoint of ['http://localhost/push', 'https://example.test/internal']) {
    const bad = await request('/notifications/push/subscribe', {
      method:'POST', body:{ endpoint, keys:{} },
    });
    assert.equal(bad.response.status, 400);
    assert.equal(bad.data.code, 'bad_push_subscription');
  }
});

test('push de mensagem segue o idioma do dispositivo sem expor o texto privado', async () => {
  const sender = await register('push.sender', 'Remetente Push');
  const thread = await requestAs(sender.token, '/messages/threads', {
    method:'POST', body:{ userId },
  });
  assert.equal(thread.response.status, 201, JSON.stringify(thread.data));

  const secretText = 'conteúdo privado que nunca deve sair no push';
  const message = await requestAs(sender.token, `/messages/threads/${thread.data.id}/messages`, {
    method:'POST', body:{ kind:'text', mode:'normal', body:secretText, palette:0 },
  });
  assert.equal(message.response.status, 201, JSON.stringify(message.data));

  const latest = await request('/notifications/push/latest?locale=fr-FR');
  assert.equal(latest.response.status, 200, JSON.stringify(latest.data));
  assert.equal(latest.data.notification.type, 'message');
  assert.equal(latest.data.notification.title, 'Remetente Push');
  assert.equal(latest.data.notification.body, 'T’a envoyé un message');
  assert.equal(JSON.stringify(latest.data).includes(secretText), false);
});