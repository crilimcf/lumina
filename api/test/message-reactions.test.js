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
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body:body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  return { response, data };
}

async function register(handle) {
  const out = await request('/auth/register', {
    method:'POST',
    body:{ handle, email:`${handle}@example.test`, password:'lumina-test-1234', name:handle, birthDate:'1990-01-01', acceptTerms:true },
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
});

after(async () => {
  if (server) await new Promise(resolve=>server.close(resolve));
  await pool.end();
});

test('reações de mensagem persistem, substituem e removem sem expor outros chats', async () => {
  const alice = await register('reaction.alice');
  const bob = await register('reaction.bob');
  const charlie = await register('reaction.charlie');

  const thread = await request('/messages/threads', { method:'POST', token:alice.token, body:{ userId:bob.user.id } });
  assert.equal(thread.response.status, 201, JSON.stringify(thread.data));
  const sent = await request(`/messages/threads/${thread.data.id}/messages`, {
    method:'POST', token:alice.token, body:{ kind:'text', mode:'normal', body:'Mensagem para reagir' },
  });
  assert.equal(sent.response.status, 201, JSON.stringify(sent.data));

  const heart = await request(`/messages/${sent.data.id}/reaction`, { method:'POST', token:bob.token, body:{ emoji:'❤️' } });
  assert.equal(heart.response.status, 200, JSON.stringify(heart.data));

  const bobList = await request(`/messages/threads/${thread.data.id}/reactions`, { token:bob.token });
  assert.equal(bobList.response.status, 200);
  assert.deepEqual(bobList.data.reactions, [{ message_id:sent.data.id, emoji:'❤️', mine:true }]);

  const aliceList = await request(`/messages/threads/${thread.data.id}/reactions`, { token:alice.token });
  assert.equal(aliceList.response.status, 200);
  assert.deepEqual(aliceList.data.reactions, [{ message_id:sent.data.id, emoji:'❤️', mine:false }]);

  const replace = await request(`/messages/${sent.data.id}/reaction`, { method:'POST', token:bob.token, body:{ emoji:'👍' } });
  assert.equal(replace.response.status, 200);
  const afterReplace = await request(`/messages/threads/${thread.data.id}/reactions`, { token:bob.token });
  assert.deepEqual(afterReplace.data.reactions, [{ message_id:sent.data.id, emoji:'👍', mine:true }]);

  const intruder = await request(`/messages/${sent.data.id}/reaction`, { method:'POST', token:charlie.token, body:{ emoji:'🔥' } });
  assert.equal(intruder.response.status, 403);

  const invalid = await request(`/messages/${sent.data.id}/reaction`, { method:'POST', token:bob.token, body:{ emoji:'💣' } });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.data.code, 'bad_reaction');

  const removed = await request(`/messages/${sent.data.id}/reaction`, { method:'DELETE', token:bob.token });
  assert.equal(removed.response.status, 200);
  const afterRemove = await request(`/messages/threads/${thread.data.id}/reactions`, { token:bob.token });
  assert.deepEqual(afterRemove.data.reactions, []);
});

test('mensagens efémeras não aceitam reações', async () => {
  const alice = await register('reaction.timer.alice');
  const bob = await register('reaction.timer.bob');
  const thread = await request('/messages/threads', { method:'POST', token:alice.token, body:{ userId:bob.user.id } });
  const sent = await request(`/messages/threads/${thread.data.id}/messages`, {
    method:'POST', token:alice.token, body:{ kind:'text', mode:'timer', body:'Segredo' },
  });
  assert.equal(sent.response.status, 201);
  const reaction = await request(`/messages/${sent.data.id}/reaction`, { method:'POST', token:bob.token, body:{ emoji:'❤️' } });
  assert.equal(reaction.response.status, 400);
  assert.equal(reaction.data.code, 'not_reactable');
});
