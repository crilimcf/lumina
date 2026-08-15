import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/server.js';
import { migrate, pool, q } from '../src/db.js';

let server;
let baseUrl;
let token;
let userId;

async function request(path, { method='GET', body, bearer } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body:body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { response, data:text ? JSON.parse(text) : null };
}

before(async () => {
  await migrate();
  const { rows } = await q(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'schema_migrations'`
  );
  if (rows.length) {
    const tables = rows.map(({ tablename }) => `"${String(tablename).replaceAll('"','""')}"`).join(', ');
    await q(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  }
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const registration = await request('/auth/register', {
    method:'POST',
    body:{
      handle:'native.push', email:'native-push@example.test', password:'lumina-test-1234',
      name:'Native Push', birthDate:'1990-01-01', acceptTerms:true,
    },
  });
  assert.equal(registration.response.status, 201, JSON.stringify(registration.data));
  token = registration.data.token;
  userId = registration.data.user.id;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await pool.end();
});

test('native mobile can register push token using Bearer auth without CSRF cookie', async () => {
  const deviceToken = 'fcm-token-for-native-integration-test-1234567890';
  const subscribed = await request('/notifications/native/subscribe', {
    method:'POST', bearer:token,
    body:{ platform:'android', token:deviceToken, deviceId:'android:test-device' },
  });
  assert.equal(subscribed.response.status, 201, JSON.stringify(subscribed.data));
  assert.deepEqual(subscribed.data, { subscribed:true, platform:'android' });

  const { rows } = await q('SELECT user_id,platform,device_id FROM native_push_tokens WHERE token=$1', [deviceToken]);
  assert.equal(rows[0].user_id, userId);
  assert.equal(rows[0].platform, 'android');
  assert.equal(rows[0].device_id, 'android:test-device');

  const status = await request('/notifications/native/status', { bearer:token });
  assert.equal(status.response.status, 200, JSON.stringify(status.data));
  assert.equal(status.data.subscribed, true);
  assert.equal(status.data.platforms[0].platform, 'android');
  assert.equal(status.data.platforms[0].devices, 1);

  const removed = await request('/notifications/native/unsubscribe', {
    method:'POST', bearer:token, body:{ token:deviceToken },
  });
  assert.equal(removed.response.status, 200, JSON.stringify(removed.data));
  assert.equal(removed.data.subscribed, false);
});

test('native push endpoint rejects invalid platform and malformed tokens', async () => {
  const badPlatform = await request('/notifications/native/subscribe', {
    method:'POST', bearer:token, body:{ platform:'desktop', token:'valid-looking-token-1234567890' },
  });
  assert.equal(badPlatform.response.status, 400);
  assert.equal(badPlatform.data.code, 'bad_push_platform');

  const badToken = await request('/notifications/native/subscribe', {
    method:'POST', bearer:token, body:{ platform:'ios', token:'short' },
  });
  assert.equal(badToken.response.status, 400);
  assert.equal(badToken.data.code, 'bad_push_token');
});
