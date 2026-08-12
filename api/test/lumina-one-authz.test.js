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
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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
  if (rows.length) {
    const tables = rows.map(({tablename}) => `"${String(tablename).replaceAll('"','""')}"`).join(', ');
    await q(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  }
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve,reject)=>{ server.once('listening',resolve); server.once('error',reject); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await pool.end();
});

test('Juntos revalida autorização ao entrar e não expõe fonte bloqueada', async () => {
  const alice = await register('one.authz.alice');
  const outsider = await register('one.authz.outsider');
  const { rows:[post] } = await q(
    `INSERT INTO posts (author_id,body,palette,kind)
     VALUES ($1,'conteúdo protegido para Juntos',0,'post') RETURNING id`,
    [alice.user.id]
  );

  const created = await request('/one/together', {
    method:'POST', token:alice.token,
    body:{ sourceType:'post', sourceId:post.id, title:'Juntos privado por bloqueio' },
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));

  await q('INSERT INTO blocks (blocker_id,blocked_id) VALUES ($1,$2)', [alice.user.id, outsider.user.id]);

  const deniedJoin = await request(`/one/together/${created.data.id}/join`, {
    method:'POST', token:outsider.token,
  });
  assert.equal(deniedJoin.response.status, 404, JSON.stringify(deniedJoin.data));

  const deniedPreview = await request(`/one/source/post/${post.id}`, { token:outsider.token });
  assert.equal(deniedPreview.response.status, 404, JSON.stringify(deniedPreview.data));

  const ownerPreview = await request(`/one/source/post/${post.id}`, { token:alice.token });
  assert.equal(ownerPreview.response.status, 200, JSON.stringify(ownerPreview.data));
  assert.equal(ownerPreview.data.body, 'conteúdo protegido para Juntos');

  const { rows: memberships } = await q(
    'SELECT user_id FROM together_members WHERE session_id=$1 ORDER BY joined_at',
    [created.data.id]
  );
  assert.deepEqual(memberships.map(row => row.user_id), [alice.user.id]);
});
