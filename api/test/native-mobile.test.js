import crypto from 'node:crypto';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/server.js';
import { migrate, pool, q } from '../src/db.js';

let server;
let baseUrl;
let account;

async function request(path, { method='GET', token, cookie, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
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
      name:'Lumina Mobile QA',
      birthDate:'1990-01-01',
      acceptTerms:true,
    },
  });
  assert.equal(out.response.status, 201, JSON.stringify(out.data));
  return out.data;
}

before(async () => {
  await migrate();
  const { rows } = await q(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations'`);
  if (rows.length) {
    const tables = rows.map(({ tablename }) => `"${String(tablename).replaceAll('"', '""')}"`).join(', ');
    await q(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  }
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  account = await register('mobile.qa');
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await pool.end();
});

test('Bearer nativo tem prioridade sobre um cookie web antigo', async () => {
  const me = await request('/auth/me', {
    token:account.token,
    cookie:'__Host-lumina-session=invalid-old-cookie',
  });
  assert.equal(me.response.status, 200, JSON.stringify(me.data));
  assert.equal(me.data.user.id, account.user.id);
});

test('token push nativo é associado ao dispositivo e removido no logout', async () => {
  const pushToken = `native-token-${crypto.randomBytes(24).toString('hex')}`;
  const subscribed = await request('/notifications/native/subscribe', {
    method:'POST', token:account.token,
    body:{
      token:pushToken,
      platform:'android',
      deviceId:'qa-device-1',
      deviceName:'Android QA',
      osVersion:'16',
      environment:'production',
    },
  });
  assert.equal(subscribed.response.status, 201, JSON.stringify(subscribed.data));

  const stored = await q(
    'SELECT platform,device_id,device_name,os_version,push_environment FROM push_tokens WHERE token=$1',
    [pushToken]
  );
  assert.deepEqual(stored.rows[0], {
    platform:'android',
    device_id:'qa-device-1',
    device_name:'Android QA',
    os_version:'16',
    push_environment:'production',
  });

  const status = await request('/notifications/push/status', { token:account.token });
  assert.equal(status.response.status, 200);
  assert.equal(status.data.native, 1);
  assert.equal(status.data.devices, 1);

  const removed = await request('/notifications/native/unsubscribe', {
    method:'POST', token:account.token, body:{ token:pushToken },
  });
  assert.equal(removed.response.status, 200);
  const finalStatus = await request('/notifications/push/status', { token:account.token });
  assert.equal(finalStatus.data.native, 0);
});

test('handoff PKCE móvel é de utilização única e emite sessão rastreada', async () => {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const started = await request('/auth/mobile/start', {
    method:'POST', body:{ codeChallenge },
  });
  assert.equal(started.response.status, 201, JSON.stringify(started.data));
  assert.equal(new URL(started.data.loginUrl).searchParams.get('mobileAuth'), started.data.id);

  const completed = await request(`/auth/mobile/${started.data.id}/complete`, {
    method:'POST', token:account.token, body:{},
  });
  assert.equal(completed.response.status, 200, JSON.stringify(completed.data));
  const callback = new URL(completed.data.redirectUrl);
  assert.equal(callback.protocol, 'lumina:');
  assert.equal(callback.hostname, 'auth');

  const exchangeBody = {
    handoff:callback.searchParams.get('handoff'),
    code:callback.searchParams.get('code'),
    verifier,
  };
  const exchanged = await request('/auth/mobile/exchange', { method:'POST', body:exchangeBody });
  assert.equal(exchanged.response.status, 200, JSON.stringify(exchanged.data));
  assert.equal(exchanged.data.user.id, account.user.id);
  assert.ok(exchanged.data.token);

  const replay = await request('/auth/mobile/exchange', { method:'POST', body:exchangeBody });
  assert.equal(replay.response.status, 401);
  assert.equal(replay.data.code, 'mobile_exchange_invalid');
});

test('sessão de gestão no browser é curta e de utilização única', async () => {
  const started = await request('/auth/mobile/browser-session', {
    method:'POST', token:account.token, body:{},
  });
  assert.equal(started.response.status, 201, JSON.stringify(started.data));
  const browserUrl = new URL(started.data.url);
  const code = new URLSearchParams(browserUrl.hash.slice(1)).get('nativeSession');
  assert.ok(code);

  const exchanged = await request('/auth/mobile/browser-exchange', {
    method:'POST', body:{ code },
  });
  assert.equal(exchanged.response.status, 200, JSON.stringify(exchanged.data));
  assert.equal(exchanged.data.user.id, account.user.id);

  const replay = await request('/auth/mobile/browser-exchange', {
    method:'POST', body:{ code },
  });
  assert.equal(replay.response.status, 401);
  assert.equal(replay.data.code, 'browser_session_expired');
});
