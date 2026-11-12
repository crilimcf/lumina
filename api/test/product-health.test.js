import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/server.js';
import { migrate, pool, q } from '../src/db.js';

let server;
let baseUrl;

before(async () => {
  await migrate();
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await pool.end();
});

test('product-health uses existing aggregate counts and is staff-only', async () => {
  const registration = await fetch(`${baseUrl}/auth/register`, {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      handle:'product.health.operator',
      email:'producthealth@example.test',
      name:'Product Health Operator',
      password:'lumina-test-1234',
      birthDate:'1990-01-01',
      acceptTerms:true,
    }),
  });
  assert.equal(registration.status, 201);
  const { user, token } = await registration.json();
  const headers = { authorization:`Bearer ${token}` };

  const unauthenticated = await fetch(`${baseUrl}/api/reports/product-health`);
  assert.equal(unauthenticated.status, 401);
  const denied = await fetch(`${baseUrl}/reports/product-health`, { headers });
  assert.equal(denied.status, 403);

  await q('UPDATE users SET is_staff=true WHERE id=$1', [user.id]);
  const response = await fetch(`${baseUrl}/api/reports/product-health`, { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const snapshot = await response.json();
  assert.equal(snapshot.windowDays, 7);
  assert.ok(typeof snapshot.measuredAt === 'string');
  const names = [
    'registeredUsers', 'newUsers', 'posts', 'rooms', 'moments',
    'publishedCreatorPlans', 'activePaidMemberships',
  ];
  assert.deepEqual(Object.keys(snapshot.counts).sort(), names.sort());
  assert.ok(snapshot.counts.registeredUsers >= 1);
  for (const count of Object.values(snapshot.counts)) {
    assert.equal(Number.isSafeInteger(count), true);
    assert.ok(count >= 0);
  }
  assert.match(snapshot.note, /Não representam utilizadores ativos/);
  const output = JSON.stringify(snapshot);
  assert.doesNotMatch(output, /producthealth@example\.test|product\.health\.operator|password|user_id|email|ipAddress/i);
});
