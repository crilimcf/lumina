import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/server.js';
import { migrate, pool, q } from '../src/db.js';
import { runAccountDeletions } from '../src/jobs/daily.js';

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

  // A declaração de tamanho do upload tem de ser um inteiro positivo real.
  for (const bytes of [-1, 0, 1.5, 8 * 1024 * 1024 + 1]) {
    const { response, data } = await request('/uploads/sign', {
      method: 'POST', token: alice.token, body: { mime: 'image/jpeg', bytes },
    });
    assert.equal(response.status, 400);
    assert.equal(data.code, 'too_big');
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

  // Uma paleta manipulada não pode guardar conteúdo que faça o React crashar.
  {
    const { response, data } = await request('/posts', {
      method: 'POST',
      token: alice.token,
      body: { communityId: community.data.id, body: 'cor hostil', palette: -1 },
    });
    assert.equal(response.status, 400);
    assert.equal(data.code, 'bad_palette');
  }

  const bob = await register({
    handle: 'bob.teste',
    email: 'bob@example.test',
    name: 'Bob Teste',
  });

  // Bob conhece UUIDs, mas ainda não pertence à comunidade. Nem conteúdo,
  // nem votação, nem denúncias podem funcionar fora dessa fronteira.
  {
    const { response } = await request(`/invites/${community.data.id}/proposals`, { token: bob.token });
    assert.equal(response.status, 403);
  }
  {
    const { response } = await request(`/invites/${community.data.id}/today`, { token: bob.token });
    assert.equal(response.status, 403);
  }
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
  {
    const { response } = await request('/reports', {
      method: 'POST',
      token: bob.token,
      body: { targetType: 'post', targetId: alicePost.data.id, reason: 'abuso' },
    });
    assert.equal(response.status, 404);
  }

  // Não pode apagar o post de Alice nem gerir moderadores.
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
  {
    const { response } = await request('/reports', {
      method: 'POST',
      token: bob.token,
      body: { targetType: 'post', targetId: alicePost.data.id, reason: 'abuso' },
    });
    assert.equal(response.status, 201);
  }

  // Uma decisão que não se aplica ao alvo não pode fechar a fila de moderação.
  {
    const queue = await request(`/reports/community/${community.data.id}`, { token: alice.token });
    assert.equal(queue.response.status, 200);
    const report = queue.data.find(r => r.target_id === alicePost.data.id);
    assert.ok(report);
    const { response, data } = await request(`/reports/${report.id}/resolve`, {
      method: 'POST', token: alice.token, body: { resolution: 'suspenso' },
    });
    assert.equal(response.status, 400);
    assert.equal(data.code, 'bad_resolution');
  }

  // Um moderador não ganha o direito de fabricar outros moderadores.
  const charlie = await register({
    handle: 'charlie.teste',
    email: 'charlie@example.test',
    name: 'Charlie Teste',
  });
  {
    const { response } = await request(`/communities/${community.data.id}/join`, {
      method: 'POST', token: charlie.token,
    });
    assert.equal(response.status, 200);
  }
  {
    const { response } = await request(`/communities/${community.data.id}/moderators`, {
      method: 'POST',
      token: alice.token,
      body: { userId: bob.user.id, role: 'moderator' },
    });
    assert.equal(response.status, 200);
  }
  {
    const { response } = await request(`/communities/${community.data.id}/moderators`, {
      method: 'POST',
      token: bob.token,
      body: { userId: charlie.user.id, role: 'moderator' },
    });
    assert.equal(response.status, 403);
  }

  // Abrir a conversa efémera nunca pode transformar uma mensagem normal em
  // mensagem que expira. O conteúdo normal deve continuar intacto.
  const thread = await request('/messages/threads', {
    method: 'POST', token: bob.token, body: { userId: alice.user.id },
  });
  assert.equal(thread.response.status, 201, JSON.stringify(thread.data));
  const normalMessage = await request(`/messages/threads/${thread.data.id}/messages`, {
    method: 'POST',
    token: bob.token,
    body: { kind: 'text', mode: 'normal', body: 'Isto não pode desaparecer.' },
  });
  assert.equal(normalMessage.response.status, 201, JSON.stringify(normalMessage.data));
  {
    const { response, data } = await request(`/messages/${normalMessage.data.id}/open`, {
      method: 'POST', token: alice.token,
    });
    assert.equal(response.status, 400);
    assert.equal(data.code, 'not_ephemeral');
  }
  {
    const { response, data } = await request(`/messages/threads/${thread.data.id}/messages`, {
      token: alice.token,
    });
    assert.equal(response.status, 200);
    const saved = data.find(m => m.id === normalMessage.data.id);
    assert.equal(saved.body, 'Isto não pode desaparecer.');
    assert.equal(saved.expires_at, null);
  }

  // URLs externas não verificadas não entram como imagens de mensagens.
  {
    const { response, data } = await request(`/messages/threads/${thread.data.id}/messages`, {
      method: 'POST',
      token: bob.token,
      body: { kind: 'media', mode: 'normal', mediaUrl: 'https://example.com/tracker.png' },
    });
    assert.equal(response.status, 400);
    assert.equal(data.code, 'unconfirmed_upload');
  }

  // Nem payloads de media vazios nem paletas fora da gama entram na conversa.
  {
    const { response, data } = await request(`/messages/threads/${thread.data.id}/messages`, {
      method: 'POST', token: bob.token, body: { kind: 'media', mode: 'once', palette: 1 },
    });
    assert.equal(response.status, 400);
    assert.equal(data.code, 'media_required');
  }
  {
    const { response, data } = await request(`/messages/threads/${thread.data.id}/messages`, {
      method: 'POST', token: bob.token, body: { kind: 'text', mode: 'normal', body: 'oi', palette: -1 },
    });
    assert.equal(response.status, 400);
    assert.equal(data.code, 'bad_palette');
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

test('apagamento RGPD transfere comunidades fundadas e corrige contadores', async () => {
  const founder = await register({
    handle: 'fundador.delete',
    email: 'fundador-delete@example.test',
    name: 'Fundador Delete',
  });
  const successor = await register({
    handle: 'sucessor.delete',
    email: 'sucessor-delete@example.test',
    name: 'Sucessor Delete',
  });

  const community = await request('/communities', {
    method: 'POST', token: founder.token,
    body: {
      slug: 'delete-transfer', name: 'Delete Transfer',
      seedProposals: ['um teste', 'dois testes', 'tres testes', 'quatro testes', 'cinco testes'],
    },
  });
  assert.equal(community.response.status, 201, JSON.stringify(community.data));

  {
    const { response } = await request(`/communities/${community.data.id}/join`, {
      method: 'POST', token: successor.token,
    });
    assert.equal(response.status, 200);
  }

  {
    const { response } = await request('/account/delete', { method: 'POST', token: founder.token });
    assert.equal(response.status, 200);
  }
  await q(
    `UPDATE deletion_requests SET execute_at = now() - interval '1 minute'
     WHERE user_id = $1`, [founder.user.id]
  );

  assert.equal(await runAccountDeletions(), 1);

  {
    const { rows } = await q('SELECT founder_id, member_count FROM communities WHERE id = $1', [community.data.id]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].founder_id, successor.user.id);
    assert.equal(rows[0].member_count, 1);
  }
  {
    const { rows } = await q('SELECT role FROM memberships WHERE community_id = $1 AND user_id = $2',
      [community.data.id, successor.user.id]);
    assert.equal(rows[0].role, 'founder');
  }
  {
    const { rows } = await q('SELECT 1 FROM users WHERE id = $1', [founder.user.id]);
    assert.equal(rows.length, 0);
  }
});

test('apagamento RGPD remove comunidade quando o fundador era o único membro', async () => {
  const founder = await register({
    handle: 'fundador.sozinho',
    email: 'fundador-sozinho@example.test',
    name: 'Fundador Sozinho',
  });
  const community = await request('/communities', {
    method: 'POST', token: founder.token,
    body: {
      slug: 'delete-alone', name: 'Delete Alone',
      seedProposals: ['um sozinho', 'dois sozinho', 'tres sozinho', 'quatro sozinho', 'cinco sozinho'],
    },
  });
  assert.equal(community.response.status, 201, JSON.stringify(community.data));

  await request('/account/delete', { method: 'POST', token: founder.token });
  await q(
    `UPDATE deletion_requests SET execute_at = now() - interval '1 minute'
     WHERE user_id = $1`, [founder.user.id]
  );

  assert.equal(await runAccountDeletions(), 1);
  const { rows } = await q('SELECT 1 FROM communities WHERE id = $1', [community.data.id]);
  assert.equal(rows.length, 0);
});
