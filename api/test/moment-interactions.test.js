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
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body:body===undefined?undefined:JSON.stringify(body) });
  const text = await response.text();
  let data = null;
  if (text) { try { data=JSON.parse(text); } catch { data=text; } }
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
  server=app.listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  baseUrl=`http://127.0.0.1:${server.address().port}`;
});

after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));await pool.end();});

test('só o autor vê quem reagiu e recebe as reações por pessoa', async () => {
  const author=await register('moment.owner');
  const reactor=await register('moment.reactor');
  const outsider=await register('moment.outsider');
  await q('INSERT INTO follows (follower_id,following_id) VALUES ($1,$2)', [reactor.user.id, author.user.id]);
  const { rows:[moment] } = await q('INSERT INTO moments (author_id,palette) VALUES ($1,0) RETURNING id', [author.user.id]);

  assert.equal((await request(`/moments/${moment.id}/reactions/like`, { method:'POST', token:reactor.token })).response.status, 200);
  assert.equal((await request(`/moments/${moment.id}/reactions/fire`, { method:'POST', token:reactor.token })).response.status, 200);

  const interactions=await request(`/moments/${moment.id}/interactions`, { token:author.token });
  assert.equal(interactions.response.status, 200);
  assert.equal(interactions.data.length, 1);
  assert.equal(interactions.data[0].id, reactor.user.id);
  assert.deepEqual(new Set(interactions.data[0].reactions), new Set(['like','fire']));

  const forbidden=await request(`/moments/${moment.id}/interactions`, { token:outsider.token });
  assert.equal(forbidden.response.status, 403);
});
