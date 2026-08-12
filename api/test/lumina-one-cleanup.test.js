import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/server.js';
import { migrate, pool, q } from '../src/db.js';
import { purgeExpiredLumes } from '../src/jobs/lumina-one-cleanup.js';

let server;
let baseUrl;

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

test('job remove Lume expirado e respetivo upload mesmo sem GET /lumes', async () => {
  const response = await fetch(`${baseUrl}/auth/register`, {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      handle:'one.cleanup.user',
      email:'one.cleanup.user@example.test',
      password:'lumina-test-1234',
      name:'Cleanup User',
      birthDate:'1990-01-01',
      acceptTerms:true,
    }),
  });
  assert.equal(response.status, 201);
  const registered = await response.json();
  const mediaUrl = `https://media.example.test/${registered.user.id}/expired.jpg`;

  await q(
    `INSERT INTO uploads (owner_id,key,url,mime,bytes,confirmed_at,consumed_at,purpose)
     VALUES ($1,$2,$3,'image/jpeg',1234,now(),now(),'lume')`,
    [registered.user.id, `${registered.user.id}/expired.jpg`, mediaUrl]
  );
  const { rows:[lume] } = await q(
    `INSERT INTO lumes (author_id,media_url,effect,expires_at)
     VALUES ($1,$2,'normal',now()-interval '1 minute') RETURNING id`,
    [registered.user.id, mediaUrl]
  );

  assert.equal(await purgeExpiredLumes(), 1);
  assert.equal((await q('SELECT count(*)::int AS n FROM lumes WHERE id=$1', [lume.id])).rows[0].n, 0);
  assert.equal((await q('SELECT count(*)::int AS n FROM uploads WHERE url=$1', [mediaUrl])).rows[0].n, 0);
});
