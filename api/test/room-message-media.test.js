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
    method: 'POST',
    body: {
      handle,
      email: `${handle}@example.test`,
      password: 'lumina-test-1234',
      name: handle,
      birthDate: '1990-01-01',
      acceptTerms: true,
    },
  });
  assert.equal(out.response.status, 201, JSON.stringify(out.data));
  return out.data;
}

async function confirmedUpload(ownerId, suffix, mime) {
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

for (const [visibility, mime] of [['public', 'image/jpeg'], ['private', 'video/mp4']]) {
  test(`sala ${visibility} aceita mensagem ${mime.startsWith('video/') ? 'de vídeo' : 'de fotografia'} sem texto`, async () => {
    const owner = await register(`room.${visibility}.${Date.now()}`.slice(0, 22));
    const created = await request('/rooms', {
      method: 'POST', token: owner.token,
      body: { name:`Sala ${visibility}`, topic:'Media na sala', description:'', visibility },
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.data));
    const roomId = created.data.room.id;
    const url = await confirmedUpload(owner.user.id, `room-${visibility}`, mime);

    const sent = await request(`/rooms/${roomId}/messages`, {
      method: 'POST', token: owner.token, body: { mediaUrl:url },
    });
    assert.equal(sent.response.status, 201, JSON.stringify(sent.data));
    assert.equal(sent.data.body, null);
    assert.equal(sent.data.media_url, url);
    assert.equal(sent.data.media_mime, mime);

    const storedUpload = await q('SELECT consumed_at,purpose FROM uploads WHERE url=$1', [url]);
    assert.ok(storedUpload.rows[0].consumed_at);
    assert.equal(storedUpload.rows[0].purpose, 'room_message');

    const listed = await request(`/rooms/${roomId}/messages`, { token:owner.token });
    assert.equal(listed.response.status, 200);
    assert.equal(listed.data.length, 1);
    assert.equal(listed.data[0].media_url, url);
    assert.equal(listed.data[0].media_mime, mime);

    const removed = await request(`/rooms/${roomId}/messages/${sent.data.id}`, { method:'DELETE', token:owner.token });
    assert.equal(removed.response.status, 200, JSON.stringify(removed.data));
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal((await q('SELECT media_url FROM room_messages WHERE id=$1', [sent.data.id])).rows[0].media_url, null);
  });
}
