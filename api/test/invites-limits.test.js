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

test('propostas-semente não consomem o limite semanal do fundador', async () => {
  const registered = await request('/auth/register', {
    method: 'POST',
    body: {
      handle: 'seed.founder',
      email: 'seed-founder@example.test',
      password: 'lumina-test-1234',
      name: 'Seed Founder',
      birthDate: '1990-01-01',
      acceptTerms: true,
    },
  });
  assert.equal(registered.response.status, 201, JSON.stringify(registered.data));

  // Torna o teste independente do valor configurado para MIN_ACCOUNT_AGE_HOURS.
  await q("UPDATE users SET created_at = now() - interval '2 days' WHERE id = $1", [registered.data.user.id]);

  const community = await request('/communities', {
    method: 'POST', token: registered.data.token,
    body: {
      slug: 'seed-limit-test',
      name: 'Seed Limit Test',
      seedProposals: ['seed um', 'seed dois', 'seed tres', 'seed quatro', 'seed cinco'],
    },
  });
  assert.equal(community.response.status, 201, JSON.stringify(community.data));

  for (let i = 1; i <= 3; i++) {
    const proposal = await request(`/invites/${community.data.id}/proposals`, {
      method: 'POST', token: registered.data.token, body: { text: `proposta normal ${i}` },
    });
    assert.equal(proposal.response.status, 201, `proposta ${i}: ${JSON.stringify(proposal.data)}`);
    assert.equal(proposal.data.is_seed, false);
  }

  const fourth = await request(`/invites/${community.data.id}/proposals`, {
    method: 'POST', token: registered.data.token, body: { text: 'quarta proposta normal' },
  });
  assert.equal(fourth.response.status, 400);
  assert.equal(fourth.data.code, 'weekly_limit');

  const { rows } = await q(
    `SELECT count(*) FILTER (WHERE is_seed)::int AS seeds,
            count(*) FILTER (WHERE NOT is_seed)::int AS normal
     FROM proposals WHERE author_id = $1`,
    [registered.data.user.id]
  );
  assert.equal(rows[0].seeds, 5);
  assert.equal(rows[0].normal, 3);
});
