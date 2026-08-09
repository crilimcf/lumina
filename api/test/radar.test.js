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

before(async () => {
  await migrate();
  const { rows } = await q(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`
  );
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

test('Radar é legível por utilizadores mas só a equipa Lumina o pode gerir', async () => {
  const member = await register('radar.member');
  const staff = await register('radar.staff');
  await q('UPDATE users SET is_staff=true WHERE id=$1', [staff.user.id]);

  const forbiddenCreate = await request('/radar', {
    method: 'POST', token: member.token,
    body: { type: 'news', title: 'Não autorizado' },
  });
  assert.equal(forbiddenCreate.response.status, 403);

  const source = await request('/radar/sources', {
    method: 'POST', token: staff.token,
    body: {
      name: 'Fonte Teste',
      kind: 'rss',
      url: 'https://example.test/feed.xml',
      defaultType: 'news',
      trusted: true,
    },
  });
  assert.equal(source.response.status, 201, JSON.stringify(source.data));
  assert.equal(source.data.kind, 'rss');

  const news = await request('/radar', {
    method: 'POST', token: staff.token,
    body: {
      type: 'news',
      title: 'Uma notícia relevante',
      summary: 'Resumo curto e seguro.',
      externalUrl: 'https://example.test/noticia',
      sourceId: source.data.id,
      tags: ['Tecnologia', 'Portugal', 'tecnologia'],
    },
  });
  assert.equal(news.response.status, 201, JSON.stringify(news.data));
  assert.deepEqual(news.data.tags, ['tecnologia', 'portugal']);

  const promotion = await request('/radar', {
    method: 'POST', token: staff.token,
    body: {
      type: 'promotion',
      title: 'Campanha identificada',
      summary: 'Uma vantagem para membros.',
      sponsored: true,
      sponsorLabel: 'Parceiro Teste',
      externalUrl: 'https://example.test/oferta',
    },
  });
  assert.equal(promotion.response.status, 201, JSON.stringify(promotion.data));
  assert.equal(promotion.data.sponsored, true);

  const all = await request('/radar', { token: member.token });
  assert.equal(all.response.status, 200, JSON.stringify(all.data));
  assert.equal(all.data.items.some(item => item.id === news.data.id), true);
  assert.equal(all.data.items.some(item => item.id === promotion.data.id), true);

  const onlyNews = await request('/radar?type=news', { token: member.token });
  assert.equal(onlyNews.response.status, 200);
  assert.equal(onlyNews.data.items.length, 1);
  assert.equal(onlyNews.data.items[0].type, 'news');
  assert.equal(onlyNews.data.items[0].source_name, 'Fonte Teste');

  const sourcesAsMember = await request('/radar/sources', { token: member.token });
  assert.equal(sourcesAsMember.response.status, 403);

  const archived = await request(`/radar/${news.data.id}`, { method: 'DELETE', token: staff.token });
  assert.equal(archived.response.status, 200);
  assert.equal(archived.data.archived, true);

  const afterArchive = await request('/radar?type=news', { token: member.token });
  assert.equal(afterArchive.response.status, 200);
  assert.equal(afterArchive.data.items.length, 0);
});

test('Radar valida tipos, URLs e datas e não mostra conteúdo fora da janela', async () => {
  const staff = await register('radar.editor');
  const member = await register('radar.reader');
  await q('UPDATE users SET is_staff=true WHERE id=$1', [staff.user.id]);

  const badType = await request('/radar', {
    method: 'POST', token: staff.token,
    body: { type: 'qualquer', title: 'Inválido' },
  });
  assert.equal(badType.response.status, 400);
  assert.equal(badType.data.code, 'bad_radar_type');

  const badUrl = await request('/radar', {
    method: 'POST', token: staff.token,
    body: { type: 'event', title: 'Evento', externalUrl: 'javascript:alert(1)' },
  });
  assert.equal(badUrl.response.status, 400);
  assert.equal(badUrl.data.code, 'bad_url');

  const expired = await request('/radar', {
    method: 'POST', token: staff.token,
    body: {
      type: 'event',
      title: 'Evento expirado',
      startsAt: '2025-01-01T10:00:00Z',
      endsAt: '2025-01-01T11:00:00Z',
    },
  });
  assert.equal(expired.response.status, 201, JSON.stringify(expired.data));

  const future = await request('/radar', {
    method: 'POST', token: staff.token,
    body: {
      type: 'event',
      title: 'Evento futuro',
      startsAt: '2099-01-01T10:00:00Z',
      endsAt: '2099-01-01T11:00:00Z',
    },
  });
  assert.equal(future.response.status, 201, JSON.stringify(future.data));

  const events = await request('/radar?type=event', { token: member.token });
  assert.equal(events.response.status, 200);
  assert.equal(events.data.items.some(item => item.id === expired.data.id), false);
  assert.equal(events.data.items.some(item => item.id === future.data.id), false);
});
