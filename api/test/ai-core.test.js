import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

// CI never needs a real provider credential. This suite proves that the app
// stays healthy without one and that cached translations do not call upstream.
delete process.env.OPENAI_API_KEY;

const [{ default:app }, { migrate,pool,q }, { sha256Text }] = await Promise.all([
  import('../src/server.js'),
  import('../src/db.js'),
  import('../src/lib/openai.js'),
]);

let server;
let baseUrl;

async function request(path, { method='GET', token, body } = {}) {
  const headers={};
  if (token) headers.authorization=`Bearer ${token}`;
  if (body !== undefined) headers['content-type']='application/json';
  const response=await fetch(`${baseUrl}${path}`, { method,headers,body:body===undefined?undefined:JSON.stringify(body) });
  const data=await response.json().catch(()=>({}));
  return { response,data };
}

async function register(handle) {
  const out=await request('/auth/register',{method:'POST',body:{
    handle,email:`${handle}@example.test`,password:'lumina-test-1234',name:handle,
    birthDate:'1990-01-01',acceptTerms:true,
  }});
  assert.equal(out.response.status,201,JSON.stringify(out.data));
  return out.data;
}

before(async()=>{
  await migrate();
  const { rows }=await q(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations'`);
  if (rows.length) {
    const tables=rows.map(({tablename})=>`"${String(tablename).replaceAll('"','""')}"`).join(', ');
    await q(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  }
  server=app.listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});
  baseUrl=`http://127.0.0.1:${server.address().port}`;
});

after(async()=>{
  if(server)await new Promise(resolve=>server.close(resolve));
  await pool.end();
});

test('AI core arranca desligado sem expor nem exigir uma API key',async()=>{
  const user=await register('ai.status');
  const out=await request('/ai/status',{token:user.token});
  assert.equal(out.response.status,200);
  assert.equal(out.data.configured,false);
  assert.deepEqual(out.data.features,{translate:true,rewrite:true,search:true,image:true});

  const translate=await request('/ai/translate',{method:'POST',token:user.token,body:{text:'Olá mundo',targetLanguage:'fr-FR'}});
  assert.equal(translate.response.status,503);
  assert.equal(translate.data.code,'ai_not_configured');
});

test('tradução em cache funciona sem enviar novamente o texto ao fornecedor',async()=>{
  const user=await register('ai.cache');
  const source='Bom dia, tudo bem?';
  await q(
    `INSERT INTO ai_translation_cache (source_hash,target_language,translated_text,model)
     VALUES ($1,'en-GB','Good morning, how are you?','test-model')`,
    [sha256Text(source)]
  );
  const out=await request('/ai/translate',{method:'POST',token:user.token,body:{text:source,targetLanguage:'en-GB'}});
  assert.equal(out.response.status,200,JSON.stringify(out.data));
  assert.equal(out.data.translation,'Good morning, how are you?');
  assert.equal(out.data.cached,true);
});

test('migration 040 cria apenas metadados de uso e hash no cache',async()=>{
  const tables=await q(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('ai_usage_events','ai_translation_cache') ORDER BY tablename`);
  assert.deepEqual(tables.rows.map(row=>row.tablename),['ai_translation_cache','ai_usage_events']);
  const columns=await q(`SELECT column_name FROM information_schema.columns WHERE table_name='ai_translation_cache' ORDER BY ordinal_position`);
  assert.deepEqual(columns.rows.map(row=>row.column_name),['source_hash','target_language','translated_text','model','created_at']);
});
