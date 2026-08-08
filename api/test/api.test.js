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

async function register({ handle, email, name = 'Pessoa Teste', birthDate = '1990-01-01' }) {
  const out = await request('/auth/register', {
    method: 'POST',
    body: {
      handle,
      email,
      password: 'lumina-test-1234',
      name,
      birthDate,
      acceptTerms: true,
    },
  });
  assert.equal(out.response.status, 201, JSON.stringify(out.data));
  return out.data;
}

before(async () => {
  await migrate();

  // Cada execução começa com uma base limpa, mas mantém a tabela que sabe
  // quais migrações já foram aplicadas.
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

test('health responde apenas quando a base de dados está acessível', async () => {
  const { response, data } = await request('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(data, { ok: true });
});

test('registo recusa utilizadores abaixo da idade mínima', async () => {
  const { response, data } = await request('/auth/register', {
    method: 'POST',
    body: {
      handle: 'demasiado.novo',
      email: 'novo@example.test',
      password: 'lumina-test-1234',
      name: 'Utilizador Novo',
      birthDate: '2015-01-01',
      acceptTerms: true,
    },
  });
  assert.equal(response.status, 400);
  assert.equal(data.code, 'too_young');
});

test('autenticação e autorizações críticas funcionam de ponta a ponta', async () => {
  const alice = await register({
    handle: 'alice.teste',
    email: 'alice@example.test',
    name: 'Alice Teste',
  });

  // Regressão: criar conta já cria uma sessão visível como dispositivo atual.
  {
    const { response, data } = await request('/sessions', { token: alice.token });
    assert.equal(response.status, 200);
    assert.equal(data.length, 1);
    assert.equal(data[0].current, true);
  }

  // Criar comunidade nunca pode funcionar sem autenticação.
  {
    const { response } = await request('/communities', {
      method: 'POST',
      body: { slug: 'sem-auth', name: 'Sem auth', seedProposals: ['uma', 'duas', 'tres', 'quatro', 'cinco'] },
    });
    assert.equal(response.status, 401);
  }

  const community = await request('/communities', {
    method: 'POST',
    token: alice.token,
    body: {
      slug: 'teste-seguranca',
      name: 'Teste Segurança',
      seedProposals: [
        'Algo azul',
        'Uma coisa perto de ti',
        'Uma sombra interessante',
        'O céu agora',
        'Algo que te fez sorrir',
      ],
    },
  });
  assert.equal(community.response.status, 201, JSON.stringify(community.data));

  const alicePost = await request('/posts', {
    method: 'POST',
    token: alice.token,
    body: { communityId: community.data.id, body: 'Post privado da comunidade', palette: 1 },
  });
  assert.equal(alicePost.response.status, 201, JSON.stringify(alicePost.data));

  const bob = await register({
    handle: 'bob.teste',
    email: 'bob@example.test',
    name: 'Bob Teste',
  });

  // Bob conhece o UUID do post, mas ainda não pertence à comunidade.
  // Nem ler comentários, nem reagir, nem republicar deve ser possível.
  {
    const { response } = await request(`/posts/${alicePost.data.id}/comments`, { token: bob.token });
    assert.equal(response.status, 403);
  }
  {
    const { response } = await request(`/posts/${alicePost.data.id}/reactions/like`, {
      method: 'POST', token: bob.token,
    });
    assert.equal(response.status, 403);
  }
  {
    const { response, data } = await request(`/posts/${alicePost.data.id}/repost`, {
      method: 'POST', token: bob.token,
    });
    assert.equal(response.status, 400);
    assert.equal(data.code, 'not_member');
  }

  // Não pode apagar o post de Alice nem promover moderadores.
  {
    const { response } = await request(`/posts/${alicePost.data.id}`, {
      method: 'DELETE', token: bob.token,
    });
    assert.equal(response.status, 404);
  }
  {
    const { response } = await request(`/communities/${community.data.id}/moderators`, {
      method: 'POST',
      token: bob.token,
      body: { userId: bob.user.id, role: 'moderator' },
    });
    assert.equal(response.status, 403);
  }

  // Depois de entrar, as ações reservadas a membros passam a funcionar.
  {
    const { response } = await request(`/communities/${community.data.id}/join`, {
      method: 'POST', token: bob.token,
    });
    assert.equal(response.status, 200);
  }
  {
    const { response } = await request(`/posts/${alicePost.data.id}/comments`, {
      method: 'POST', token: bob.token, body: { body: 'Agora sou membro.' },
    });
    assert.equal(response.status, 201);
  }
  {
    const { response, data } = await request(`/posts/${alicePost.data.id}/reactions/like`, {
      method: 'POST', token: bob.token,
    });
    assert.equal(response.status, 200);
    assert.equal(data.active, true);
  }

  // Trocar a password invalida imediatamente o token anterior.
  const changed = await request('/auth/change-password', {
    method: 'POST',
    token: alice.token,
    body: { current: 'lumina-test-1234', password: 'lumina-test-5678' },
  });
  assert.equal(changed.response.status, 200, JSON.stringify(changed.data));
  assert.ok(changed.data.token);

  {
    const { response, data } = await request('/auth/me', { token: alice.token });
    assert.equal(response.status, 401);
    assert.equal(data.code, 'session_revoked');
  }
  {
    const { response } = await request('/auth/me', { token: changed.data.token });
    assert.equal(response.status, 200);
  }
});
