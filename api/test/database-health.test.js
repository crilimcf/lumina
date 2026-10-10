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

test('PostgreSQL diagnostics are staff-only and contain no user records', async () => {
  const registration = await fetch(`${baseUrl}/auth/register`, {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify({
      handle:'dbhealth.operator',
      email:'dbhealth@example.test',
      name:'DB Health Operator',
      password:'lumina-test-1234',
      birthDate:'1990-01-01',
      acceptTerms:true,
    }),
  });
  assert.equal(registration.status, 201);
  const { user, token } = await registration.json();
  const headers = { authorization:`Bearer ${token}` };

  const anonymous = await fetch(`${baseUrl}/reports/database-health`);
  assert.equal(anonymous.status, 401);
  const denied = await fetch(`${baseUrl}/api/reports/database-health`, { headers });
  assert.equal(denied.status, 403);

  await q('UPDATE users SET is_staff=true WHERE id=$1', [user.id]);
  const result = await fetch(`${baseUrl}/api/reports/database-health`, { headers });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  const info = await result.json();

  assert.equal(Number.isFinite(info.databaseBytes), true);
  assert.ok(info.databaseBytes > 0);
  assert.ok(info.connections >= 1);
  assert.ok(info.maxConnections > 0);
  assert.ok(info.connections <= info.maxConnections);
  assert.equal(typeof info.measuredAt, 'string');
  assert.match(info.note, /WAL/);
  assert.ok(Array.isArray(info.largestTables));
  assert.ok(info.largestTables.length > 0 && info.largestTables.length <= 10);
  for (const table of info.largestTables) {
    assert.equal(typeof table.name, 'string');
    assert.ok(table.totalBytes >= 0);
    assert.ok(table.estimatedRows >= 0);
    assert.ok(table.estimatedDeadRows >= 0);
    assert.equal('rows' in table, false, 'never expose table records');
  }
});
