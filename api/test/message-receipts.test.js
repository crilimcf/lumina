import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/server.js';
import { migrate, pool, q } from '../src/db.js';

let server;
let baseUrl;

async function request(path, { method='GET', token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body===undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  return { response, data };
}

async function register(handle) {
  const out = await request('/auth/register', { method:'POST', body:{ handle, email:`${handle}@example.test`, password:'lumina-test-1234', name:handle, birthDate:'1990-01-01', acceptTerms:true } });
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
});

after(async () => {
  if (server) await new Promise(resolve=>server.close(resolve));
  await pool.end();
});

test('mensagem evolui de enviada para entregue e vista e limpa a notificação ao abrir', async () => {
  const alice = await register('receipt.alice');
  const bob = await register('receipt.bob');
  const thread = await request('/messages/threads', { method:'POST', token:alice.token, body:{ userId:bob.user.id } });
  assert.equal(thread.response.status, 201);

  const sent = await request(`/messages/threads/${thread.data.id}/messages`, { method:'POST', token:alice.token, body:{ kind:'text', mode:'normal', body:'Olá Bob' } });
  assert.equal(sent.response.status, 201);
  assert.equal(sent.data.delivered_at, null);
  assert.equal(sent.data.read_at, null);

  let bobAlerts = await request('/notifications', { token:bob.token });
  const messageAlert = bobAlerts.data.notifications.find(n=>n.type==='message');
  assert.ok(messageAlert);
  assert.equal(messageAlert.actor_id, alice.user.id);
  assert.equal(messageAlert.data.threadId, thread.data.id);
  assert.equal(messageAlert.read_at, null);

  const delivered = await request('/messages/delivered', { method:'POST', token:bob.token });
  assert.equal(delivered.response.status, 200);
  assert.equal(delivered.data.delivered, 1);

  let aliceHistory = await request(`/messages/threads/${thread.data.id}/messages`, { token:alice.token });
  let message = aliceHistory.data.find(m=>m.id===sent.data.id);
  assert.ok(message.delivered_at);
  assert.equal(message.read_at, null);

  const bobHistory = await request(`/messages/threads/${thread.data.id}/messages`, { token:bob.token });
  assert.equal(bobHistory.response.status, 200);

  aliceHistory = await request(`/messages/threads/${thread.data.id}/messages`, { token:alice.token });
  message = aliceHistory.data.find(m=>m.id===sent.data.id);
  assert.ok(message.read_at);

  bobAlerts = await request('/notifications', { token:bob.token });
  const readAlert = bobAlerts.data.notifications.find(n=>n.id===messageAlert.id);
  assert.ok(readAlert.read_at);
});

test('autor pode editar texto normal e apagar para todos; destinatário não pode editar', async () => {
  const alice = await register('edit.alice');
  const bob = await register('edit.bob');
  const thread = await request('/messages/threads', { method:'POST', token:alice.token, body:{ userId:bob.user.id } });
  const sent = await request(`/messages/threads/${thread.data.id}/messages`, { method:'POST', token:alice.token, body:{ kind:'text', mode:'normal', body:'menssagem errada' } });

  const forbiddenEdit = await request(`/messages/${sent.data.id}`, { method:'PATCH', token:bob.token, body:{ body:'não posso' } });
  assert.equal(forbiddenEdit.response.status, 403);

  const edited = await request(`/messages/${sent.data.id}`, { method:'PATCH', token:alice.token, body:{ body:'mensagem certa' } });
  assert.equal(edited.response.status, 200);
  assert.equal(edited.data.body, 'mensagem certa');
  assert.ok(edited.data.edited_at);

  const removed = await request(`/messages/${sent.data.id}`, { method:'DELETE', token:alice.token });
  assert.equal(removed.response.status, 200);
  assert.equal(removed.data.deleted, true);

  const history = await request(`/messages/threads/${thread.data.id}/messages`, { token:bob.token });
  const message = history.data.find(m=>m.id===sent.data.id);
  assert.ok(message.deleted_at);
  assert.equal(message.body, null);
  assert.equal(message.media_url, null);
});
