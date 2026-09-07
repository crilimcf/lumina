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
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body:body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  return { response, data };
}

async function register(handle) {
  const out = await request('/auth/register', {
    method:'POST',
    body:{
      handle,
      email:`${handle}@example.test`,
      password:'lumina-test-1234',
      name:handle,
      birthDate:'1990-01-01',
      acceptTerms:true,
    },
  });
  assert.equal(out.response.status, 201, JSON.stringify(out.data));
  return out.data;
}

async function confirmedUpload(userId, suffix) {
  const url = `https://media.example.test/${suffix}.jpg`;
  await q(
    `INSERT INTO uploads (owner_id,key,url,mime,bytes,confirmed_at)
     VALUES ($1,$2,$3,'image/jpeg',1024,now())`,
    [userId, `social-loops/${suffix}.jpg`, url]
  );
  return url;
}

before(async () => {
  await migrate();
  const { rows } = await q(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations'`);
  if (rows.length) {
    const tables = rows.map(({tablename}) => `"${String(tablename).replaceAll('"','""')}"`).join(', ');
    await q(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  }
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve,reject)=>{ server.once('listening',resolve); server.once('error',reject); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise(resolve=>server.close(resolve));
  await pool.end();
});

test('Lume 2.0 é dirigido, abre uma vez e o coletivo ganha recap', async () => {
  const alice = await register('loops.alice');
  const bob = await register('loops.bob');
  const outsider = await register('loops.outsider');
  await q(
    `INSERT INTO follows (follower_id,following_id) VALUES ($1,$2),($2,$1)`,
    [alice.user.id,bob.user.id]
  );

  const media = await confirmedUpload(alice.user.id, 'alice-first');
  const created = await request('/one/viral/lume-chains', {
    method:'POST', token:alice.token,
    body:{
      mode:'collective', title:'Jantar Porto', recipientIds:[bob.user.id],
      mediaUrl:media, effect:'vivid', caption:'Primeiro momento', provenance:'captured',
    },
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));

  const bobList = await request('/one/viral/lume-chains', { token:bob.token });
  assert.equal(bobList.response.status, 200);
  assert.equal(bobList.data.length, 1);
  assert.equal(bobList.data[0].unseen_count, 1);

  const outsiderList = await request('/one/viral/lume-chains', { token:outsider.token });
  assert.equal(outsiderList.response.status, 200);
  assert.equal(outsiderList.data.length, 0, 'Lume dirigido nunca aparece a outro amigo/utilizador');

  const preview = await request(`/one/viral/lume-chains/${created.data.id}`, { token:bob.token });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.data.entries[0].media_url, null, 'media privado não sai antes da abertura');
  assert.equal(preview.data.entries[0].provenance, 'captured');

  const opened = await request(`/one/viral/lume-entries/${created.data.entry.id}/open`, { method:'POST', token:bob.token });
  assert.equal(opened.response.status, 200, JSON.stringify(opened.data));
  assert.equal(opened.data.media_url, media);

  const openedTwice = await request(`/one/viral/lume-entries/${created.data.entry.id}/open`, { method:'POST', token:bob.token });
  assert.equal(openedTwice.response.status, 410, JSON.stringify(openedTwice.data));

  const replyMedia = await confirmedUpload(bob.user.id, 'bob-reply');
  const reply = await request(`/one/viral/lume-chains/${created.data.id}/entries`, {
    method:'POST', token:bob.token,
    body:{ mediaUrl:replyMedia, effect:'normal', caption:'Resposta', provenance:'captured', replyToId:created.data.entry.id },
  });
  assert.equal(reply.response.status, 201, JSON.stringify(reply.data));

  await q(
    `UPDATE viral_lume_chains
        SET active_until=now()-interval '1 minute',recap_until=now()+interval '7 days'
      WHERE id=$1`,
    [created.data.id]
  );
  const recap = await request(`/one/viral/lume-chains/${created.data.id}/recap`, { token:bob.token });
  assert.equal(recap.response.status, 200, JSON.stringify(recap.data));
  assert.equal(recap.data.entries.length, 2);
  assert.deepEqual(recap.data.entries.map(entry=>entry.media_url), [media,replyMedia]);
});

test('Agora esconde o ponto exato até entrar e cria Lume coletivo do grupo', async () => {
  const alice = await request('/auth/login', { method:'POST', body:{ email:'loops.alice@example.test', password:'lumina-test-1234' } });
  const bob = await request('/auth/login', { method:'POST', body:{ email:'loops.bob@example.test', password:'lumina-test-1234' } });
  const outsider = await request('/auth/login', { method:'POST', body:{ email:'loops.outsider@example.test', password:'lumina-test-1234' } });
  assert.equal(alice.response.status,200); assert.equal(bob.response.status,200); assert.equal(outsider.response.status,200);

  const created = await request('/one/viral/agora', {
    method:'POST', token:alice.data.token,
    body:{ kind:'coffee', title:'Café daqui a pouco', note:'Quem alinha?', coarseLocation:'Porto · Boavista', meetingPoint:'Café Exemplo, Rua Privada 10', hours:4, capacity:6 },
  });
  assert.equal(created.response.status,201,JSON.stringify(created.data));

  const bobFeed = await request('/one/viral/agora', { token:bob.data.token });
  assert.equal(bobFeed.response.status,200);
  assert.equal(bobFeed.data.some(item=>item.id===created.data.id),true);
  assert.equal(Object.hasOwn(bobFeed.data.find(item=>item.id===created.data.id),'meeting_point'),false,'feed público não transporta ponto exato');

  const beforeJoin = await request(`/one/viral/agora/${created.data.id}`, { token:bob.data.token });
  assert.equal(beforeJoin.response.status,200);
  assert.equal(beforeJoin.data.meeting_point,'');

  const denied = await request(`/one/viral/agora/${created.data.id}`, { token:outsider.data.token });
  assert.equal(denied.response.status,403);

  const join = await request(`/one/viral/agora/${created.data.id}/join`, { method:'POST', token:bob.data.token });
  assert.equal(join.response.status,200);
  assert.equal(join.data.meeting_point,'Café Exemplo, Rua Privada 10');

  const chat = await request(`/one/viral/agora/${created.data.id}/messages`, {
    method:'POST', token:bob.data.token, body:{ body:'Eu vou!' },
  });
  assert.equal(chat.response.status,201);

  const lume = await request(`/one/viral/agora/${created.data.id}/lume`, { method:'POST', token:alice.data.token });
  assert.equal(lume.response.status,201,JSON.stringify(lume.data));
  const { rows:members } = await q('SELECT user_id FROM viral_lume_members WHERE chain_id=$1 ORDER BY user_id', [lume.data.chainId]);
  assert.deepEqual(members.map(row=>row.user_id).sort(), [alice.data.user.id,bob.data.user.id].sort());
});

test('Radar Dos meus agrega sinais sem revelar identidades', async () => {
  const alice = await request('/auth/login', { method:'POST', body:{ email:'loops.alice@example.test', password:'lumina-test-1234' } });
  const bob = await request('/auth/login', { method:'POST', body:{ email:'loops.bob@example.test', password:'lumina-test-1234' } });
  const { rows:[item] } = await q(
    `INSERT INTO radar_items (type,title,summary,external_url,source_name,status,published_at)
     VALUES ('news','Radar de confiança','Uma notícia que circula entre amigos','https://example.test/radar-trust','Fonte Teste','published',now())
     RETURNING id`,
  );

  const signal = await request('/one/viral/radar/signal', {
    method:'POST', token:bob.data.token,
    body:{ kind:'save', externalUrl:'https://example.test/radar-trust', title:'Radar de confiança' },
  });
  assert.equal(signal.response.status,200,JSON.stringify(signal.data));
  assert.equal(signal.data.itemId,item.id);

  const network = await request('/one/viral/radar/friends', { token:alice.data.token });
  assert.equal(network.response.status,200);
  assert.equal(network.data.items.length,1);
  assert.equal(network.data.items[0].network_count,1);
  assert.equal(network.data.items[0].signal_count,1);
  assert.equal(Object.hasOwn(network.data.items[0],'user_id'),false);
  assert.equal(Object.hasOwn(network.data.items[0],'handle'),false);
});
