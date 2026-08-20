import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/server.js';
import { migrate, pool, q } from '../src/db.js';
import { ensureRadarCountrySources } from '../src/jobs/radar-scheduler.js';

let server;
let baseUrl;
let token;

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers:{ authorization:`Bearer ${token}` } });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

before(async () => {
  await migrate();
  const { rows } = await q(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations'`);
  if (rows.length) {
    await q(`TRUNCATE ${rows.map(({tablename})=>`"${String(tablename).replaceAll('"','""')}"`).join(', ')} RESTART IDENTITY CASCADE`);
  }

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const registered = await fetch(`${baseUrl}/auth/register`, {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify({
      handle:'radar.travel',
      email:'radar.travel@example.test',
      password:'lumina-test-1234',
      name:'Radar Travel',
      birthDate:'1990-01-01',
      acceptTerms:true,
    }),
  });
  assert.equal(registered.status, 201);
  token = (await registered.json()).token;
  assert.ok(token);

  const legacySource = await q(
    `INSERT INTO radar_sources (name,kind,url,default_type,active,trusted,config)
     VALUES ('Legacy Portugal','manual','https://legacy-portugal.example/','news',true,true,
             '{"region":"Portugal","tags":["legacy"]}'::jsonb)
     RETURNING id`
  );

  const firstBootstrap = await ensureRadarCountrySources();
  assert.equal(firstBootstrap.inserted, 5);
  const secondBootstrap = await ensureRadarCountrySources();
  assert.equal(secondBootstrap.inserted, 0);

  const { rows: taggedPortugal } = await q(
    `SELECT config->'tags' AS tags FROM radar_sources WHERE id=$1`,
    [legacySource.rows[0].id]
  );
  assert.equal(taggedPortugal[0].tags.includes('country:pt'), true);

  const { rows: frenchSources } = await q(
    `SELECT count(*)::int AS total FROM radar_sources
     WHERE lower(COALESCE(config->>'region',''))='france'
       AND config->'tags' @> '["country:fr"]'::jsonb`
  );
  assert.equal(frenchSources[0].total, 3);

  const { rows: globalSources } = await q(
    `SELECT count(*)::int AS total FROM radar_sources
     WHERE lower(COALESCE(config->>'region',''))='global'
       AND config->'tags' @> '["country:global"]'::jsonb`
  );
  assert.equal(globalSources[0].total, 2);

  await q(
    `INSERT INTO radar_items (type,title,summary,tags,region,source_id,published_at,status,priority)
     VALUES
       ('news','Portugal only','PT',ARRAY['country:pt'],'Portugal',NULL,now(),'published',20),
       ('news','France only','FR',ARRAY['country:fr'],'France',NULL,now() - interval '1 minute','published',20),
       ('news','Paris local','Paris',ARRAY['country:fr','paris'],'Paris',NULL,now() - interval '2 minute','published',5),
       ('news','Global item','Global',ARRAY['country:global'],NULL,NULL,now() - interval '3 minute','published',1),
       ('news','Legacy Portugal item','Legacy PT',ARRAY[]::text[],'Portugal',NULL,now() - interval '4 minute','published',10),
       ('news','Legacy source Portugal','Legacy source',ARRAY[]::text[],NULL,$1,now() - interval '5 minute','published',9),
       ('news','Legacy unknown','Unknown',ARRAY[]::text[],NULL,NULL,now() - interval '6 minute','published',99)`,
    [legacySource.rows[0].id]
  );
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await pool.end();
});

test('Radar em França mostra França/global e exclui Portugal, incluindo legado', async () => {
  const { response, data } = await request('/radar?country=FR&limit=20');
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.country, 'FR');
  const titles = data.items.map(item => item.title);
  assert.equal(titles.includes('France only'), true);
  assert.equal(titles.includes('Paris local'), true);
  assert.equal(titles.includes('Global item'), true);
  assert.equal(titles.includes('Portugal only'), false);
  assert.equal(titles.includes('Legacy Portugal item'), false);
  assert.equal(titles.includes('Legacy source Portugal'), false);
  assert.equal(titles.includes('Legacy unknown'), false);
});

test('Radar em Portugal mostra Portugal/global e recupera legado sem misturar desconhecidos', async () => {
  const { response, data } = await request('/radar?country=PT&limit=20');
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.country, 'PT');
  const titles = data.items.map(item => item.title);
  assert.equal(titles.includes('Portugal only'), true);
  assert.equal(titles.includes('Global item'), true);
  assert.equal(titles.includes('Legacy Portugal item'), true);
  assert.equal(titles.includes('Legacy source Portugal'), true);
  assert.equal(titles.includes('France only'), false);
  assert.equal(titles.includes('Paris local'), false);
  assert.equal(titles.includes('Legacy unknown'), false);
});

test('cidade atual tem prioridade dentro do país sem furar o filtro nacional', async () => {
  const { response, data } = await request('/radar?country=FR&region=Paris&limit=20');
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.region, 'Paris');
  assert.equal(data.items[0].title, 'Paris local');
  assert.equal(data.items.some(item => item.title === 'Portugal only'), false);
  assert.equal(data.items.some(item => item.title === 'Legacy Portugal item'), false);
});

test('scope local devolve só o país atual e nunca mistura Global', async () => {
  const { response, data } = await request('/radar?scope=local&country=FR&region=Paris&limit=20');
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.scope, 'local');
  const titles = data.items.map(item => item.title);
  assert.equal(titles.includes('France only'), true);
  assert.equal(titles.includes('Paris local'), true);
  assert.equal(titles.includes('Global item'), false);
  assert.equal(titles.includes('Portugal only'), false);
});

test('scope global funciona sem localização e devolve apenas Mundo', async () => {
  const { response, data } = await request('/radar?scope=global&limit=20');
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.scope, 'global');
  assert.equal(data.country, null);
  const titles = data.items.map(item => item.title);
  assert.deepEqual(titles, ['Global item']);
});

test('scope local exige país e scope inválido é rejeitado', async () => {
  const local = await request('/radar?scope=local');
  assert.equal(local.response.status, 400);
  assert.equal(local.data.code, 'missing_radar_country');

  const invalid = await request('/radar?scope=planet');
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.data.code, 'bad_radar_scope');
});

test('Radar rejeita código de país que não seja ISO alpha-2', async () => {
  const { response, data } = await request('/radar?country=FRA');
  assert.equal(response.status, 400);
  assert.equal(data.code, 'bad_country');
});
