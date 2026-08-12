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
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
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

async function confirmedUpload(ownerId, suffix, mime='image/jpeg') {
  const ext = mime.startsWith('video/') ? 'mp4' : 'jpg';
  const url = `https://media.example.test/${ownerId}/${suffix}.${ext}`;
  await q(
    `INSERT INTO uploads (owner_id,key,url,mime,bytes,confirmed_at)
     VALUES ($1,$2,$3,$4,1234,now())`,
    [ownerId, `${ownerId}/${suffix}.${ext}`, url, mime]
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
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await pool.end();
});

test('Lume só aparece a amigos mútuos e só abre uma vez', async () => {
  const alice = await register('one.lume.alice');
  const bob = await register('one.lume.bob');
  const outsider = await register('one.lume.outsider');
  await q('INSERT INTO follows (follower_id,following_id) VALUES ($1,$2),($2,$1)', [alice.user.id, bob.user.id]);
  await q('INSERT INTO follows (follower_id,following_id) VALUES ($1,$2)', [outsider.user.id, alice.user.id]);

  const mediaUrl = await confirmedUpload(alice.user.id, 'lume');
  const created = await request('/one/lumes', { method:'POST', token:alice.token, body:{ mediaUrl, effect:'mirror' } });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.effect, 'mirror');

  const bobList = await request('/one/lumes', { token:bob.token });
  assert.equal(bobList.response.status, 200);
  assert.equal(bobList.data.length, 1);
  assert.equal(bobList.data[0].media_url, null);

  const outsiderList = await request('/one/lumes', { token:outsider.token });
  assert.equal(outsiderList.data.length, 0);

  const opened = await request(`/one/lumes/${created.data.id}/open`, { method:'POST', token:bob.token });
  assert.equal(opened.response.status, 200, JSON.stringify(opened.data));
  assert.equal(opened.data.media_url, mediaUrl);

  const again = await request(`/one/lumes/${created.data.id}/open`, { method:'POST', token:bob.token });
  assert.equal(again.response.status, 410);
  assert.equal(again.data.code, 'lume_already_viewed');
  assert.equal((await request('/one/lumes', { token:bob.token })).data.length, 0);
});

test('preferências controlam Pulso e escondem tópicos silenciados', async () => {
  const alice = await register('one.pulse.alice');
  const bob = await register('one.pulse.bob');
  await q('INSERT INTO posts (author_id,body,palette,kind) VALUES ($1,$2,0,\'post\'),($1,$3,0,\'post\')', [alice.user.id, 'viagem porto praia', 'política debate']);

  const prefs = await request('/one/preferences', {
    method:'PATCH', token:bob.token,
    body:{ boostTopics:['viagem','porto'], muteTopics:['política'], contextMode:'viagem', localRegion:'Porto' },
  });
  assert.equal(prefs.response.status, 200, JSON.stringify(prefs.data));
  assert.deepEqual(prefs.data.boost_topics, ['viagem','porto']);
  assert.equal(prefs.data.context_mode, 'viagem');

  const pulse = await request('/one/pulse', { token:bob.token });
  assert.equal(pulse.response.status, 200);
  assert.equal(pulse.data.items.length, 1);
  assert.match(pulse.data.items[0].body, /viagem/i);
  assert.equal(pulse.data.preferences.local_region, 'Porto');
});

test('Cápsula respeita membership e data de abertura', async () => {
  const alice = await register('one.cap.alice');
  const bob = await register('one.cap.bob');
  const outsider = await register('one.cap.outsider');
  const unlockAt = new Date(Date.now() + 60_000).toISOString();

  const created = await request('/one/capsules', {
    method:'POST', token:alice.token,
    body:{ title:'Porto 2026', description:'Memórias da viagem', unlockAt, memberIds:[bob.user.id] },
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.locked, true);

  const added = await request(`/one/capsules/${created.data.id}/items`, {
    method:'POST', token:bob.token, body:{ body:'Primeira memória' },
  });
  assert.equal(added.response.status, 201, JSON.stringify(added.data));

  const locked = await request(`/one/capsules/${created.data.id}`, { token:bob.token });
  assert.equal(locked.response.status, 200);
  assert.equal(locked.data.locked, true);
  assert.deepEqual(locked.data.items, []);

  const denied = await request(`/one/capsules/${created.data.id}`, { token:outsider.token });
  assert.equal(denied.response.status, 404);

  await q("UPDATE capsules SET unlock_at=now()-interval '1 second' WHERE id=$1", [created.data.id]);
  const opened = await request(`/one/capsules/${created.data.id}`, { token:bob.token });
  assert.equal(opened.response.status, 200);
  assert.equal(opened.data.locked, false);
  assert.equal(opened.data.items.length, 1);
  assert.equal(opened.data.items[0].body, 'Primeira memória');
});

test('Juntos tem host, participantes e controlo de estado', async () => {
  const alice = await register('one.together.alice');
  const bob = await register('one.together.bob');
  const { rows:[post] } = await q("INSERT INTO posts (author_id,body,palette,kind) VALUES ($1,'ver isto juntos',0,'post') RETURNING id", [alice.user.id]);

  const created = await request('/one/together', {
    method:'POST', token:alice.token, body:{ sourceType:'post', sourceId:post.id, title:'Sessão teste' },
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));

  const joined = await request(`/one/together/${created.data.id}/join`, { method:'POST', token:bob.token });
  assert.equal(joined.response.status, 200);

  const forbidden = await request(`/one/together/${created.data.id}/state`, {
    method:'PATCH', token:bob.token, body:{ playing:true, positionMs:1000 },
  });
  assert.equal(forbidden.response.status, 403);

  const state = await request(`/one/together/${created.data.id}/state`, {
    method:'PATCH', token:alice.token, body:{ playing:true, positionMs:2500, note:'agora' },
  });
  assert.equal(state.response.status, 200);
  assert.equal(state.data.state.playing, true);
  assert.equal(state.data.state.positionMs, 2500);

  const session = await request(`/one/together/${created.data.id}`, { token:bob.token });
  assert.equal(session.response.status, 200);
  assert.equal(session.data.members.length, 2);
});

test('Radar Local filtra pela região escolhida', async () => {
  const user = await register('one.local.user');
  await q(
    `INSERT INTO radar_items (type,title,summary,status,region,published_at,priority)
     VALUES ('event','Festival no Porto','Ao vivo na cidade','published','Porto',now(),10),
            ('event','Evento em Lisboa','Outro local','published','Lisboa',now(),10)`
  );
  const local = await request('/one/local?region=Porto', { token:user.token });
  assert.equal(local.response.status, 200, JSON.stringify(local.data));
  assert.equal(local.data.region, 'Porto');
  assert.equal(local.data.items.length, 1);
  assert.match(local.data.items[0].title, /Porto/);
});
