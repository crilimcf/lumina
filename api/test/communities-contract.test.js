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
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = text; }
  }
  return { response, data };
}

async function register(handle) {
  const out = await request('/auth/register', {
    method: 'POST',
    body: {
      handle,
      email: `${handle.replaceAll('.', '-')}@example.test`,
      password: 'lumina-test-1234',
      name: handle,
      birthDate: '1990-01-01',
      acceptTerms: true,
    },
  });
  assert.equal(out.response.status, 201, JSON.stringify(out.data));
  return out.data;
}

const seeds = ['seed um', 'seed dois', 'seed tres', 'seed quatro', 'seed cinco'];

before(async () => {
  await migrate();
  const { rows } = await q(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`
  );
  if (rows.length) {
    const tables = rows
      .map(({ tablename }) => `"${String(tablename).replaceAll('"', '""')}"`)
      .join(', ');
    await q(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  }
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

test('criação de comunidade valida slug e nome antes do PostgreSQL', async () => {
  const founder = await register('community.validation');

  const badSlug = await request('/communities', {
    method: 'POST', token: founder.token,
    body: { slug: 'a'.repeat(33), name: 'Nome válido', seedProposals: seeds },
  });
  assert.equal(badSlug.response.status, 400);
  assert.equal(badSlug.data.code, 'bad_slug');

  const badName = await request('/communities', {
    method: 'POST', token: founder.token,
    body: { slug: 'nome-valido', name: 'N'.repeat(61), seedProposals: seeds },
  });
  assert.equal(badName.response.status, 400);
  assert.equal(badName.data.code, 'bad_name');
});

test('fundador não recebe left:true quando a base recusou a saída', async () => {
  const founder = await register('community.founder');
  const member = await register('community.member');
  const outsider = await register('community.outsider');

  const community = await request('/communities', {
    method: 'POST', token: founder.token,
    body: { slug: 'leave-contract', name: 'Leave Contract', seedProposals: seeds },
  });
  assert.equal(community.response.status, 201, JSON.stringify(community.data));

  const founderLeave = await request(`/communities/${community.data.id}/leave`, {
    method: 'POST', token: founder.token,
  });
  assert.equal(founderLeave.response.status, 400);
  assert.equal(founderLeave.data.code, 'founder_cannot_leave');

  const outsiderLeave = await request(`/communities/${community.data.id}/leave`, {
    method: 'POST', token: outsider.token,
  });
  assert.equal(outsiderLeave.response.status, 200);
  assert.equal(outsiderLeave.data.left, false);

  const joined = await request(`/communities/${community.data.id}/join`, {
    method: 'POST', token: member.token,
  });
  assert.equal(joined.response.status, 200);

  let stored = await q('SELECT member_count FROM communities WHERE id = $1', [community.data.id]);
  assert.equal(stored.rows[0].member_count, 2);

  const memberLeave = await request(`/communities/${community.data.id}/leave`, {
    method: 'POST', token: member.token,
  });
  assert.equal(memberLeave.response.status, 200);
  assert.equal(memberLeave.data.left, true);

  stored = await q('SELECT member_count FROM communities WHERE id = $1', [community.data.id]);
  assert.equal(stored.rows[0].member_count, 1);
});
