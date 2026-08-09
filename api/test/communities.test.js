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
    try { data = JSON.parse(text); } catch { data = text; }
  }
  return { response, data };
}

async function register(handle, email) {
  const out = await request('/auth/register', {
    method: 'POST',
    body: {
      handle,
      email,
      password: 'lumina-test-1234',
      name: handle,
      birthDate: '1990-01-01',
      acceptTerms: true,
    },
  });
  assert.equal(out.response.status, 201, JSON.stringify(out.data));
  return out.data;
}

before(async () => {
  await migrate();
  const { rows } = await q(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`);
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
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await pool.end();
});

test('comunidade pode ser consultada por UUID e por slug', async () => {
  const founder = await register('community.owner', 'community-owner@example.test');
  const created = await request('/communities', {
    method: 'POST',
    token: founder.token,
    body: {
      slug: 'qa-community',
      name: 'QA Community',
      seedProposals: ['ideia um', 'ideia dois', 'ideia tres', 'ideia quatro', 'ideia cinco'],
    },
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));

  const byId = await request(`/communities/${created.data.id}`);
  assert.equal(byId.response.status, 200, JSON.stringify(byId.data));
  assert.equal(byId.data.slug, 'qa-community');

  const bySlug = await request('/communities/qa-community');
  assert.equal(bySlug.response.status, 200, JSON.stringify(bySlug.data));
  assert.equal(bySlug.data.id, created.data.id);
});

test('join desconhecido devolve 404 e fundador não recebe falso sucesso ao sair', async () => {
  const founder = await register('membership.owner', 'membership-owner@example.test');
  const created = await request('/communities', {
    method: 'POST', token: founder.token,
    body: {
      slug: 'membership-qa', name: 'Membership QA',
      seedProposals: ['ideia um', 'ideia dois', 'ideia tres', 'ideia quatro', 'ideia cinco'],
    },
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));

  const unknown = await request('/communities/11111111-1111-4111-8111-111111111111/join', {
    method: 'POST', token: founder.token,
  });
  assert.equal(unknown.response.status, 404);

  const leave = await request(`/communities/${created.data.id}/leave`, {
    method: 'POST', token: founder.token,
  });
  assert.equal(leave.response.status, 400);
  assert.equal(leave.data.code, 'founder_cannot_leave');
});

test('seeds de criação obedecem aos mesmos limites antispam das propostas', async () => {
  const founder = await register('seed.owner', 'seed-owner@example.test');
  const link = await request('/communities', {
    method: 'POST', token: founder.token,
    body: {
      slug: 'seed-links', name: 'Seed Links',
      seedProposals: ['ideia um', 'ideia dois', 'ideia tres', 'ideia quatro', 'https://spam.example'],
    },
  });
  assert.equal(link.response.status, 400);

  const tooMany = await request('/communities', {
    method: 'POST', token: founder.token,
    body: {
      slug: 'seed-many', name: 'Seed Many',
      seedProposals: Array.from({ length: 21 }, (_, i) => `ideia numero ${i}`),
    },
  });
  assert.equal(tooMany.response.status, 400);
  assert.equal(tooMany.data.code, 'too_many_seeds');
});
