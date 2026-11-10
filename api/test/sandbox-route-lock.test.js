import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV='test';
process.env.LUMINA_SANDBOX='true';

const [{ default: app }, { migrate,pool }] = await Promise.all([
  import('../src/server.js'),import('../src/db.js')
]);
let server,baseUrl;
before(async()=>{
  await migrate();
  server=app.listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  baseUrl='http://127.0.0.1:'+server.address().port;
});
after(async()=>{
  if(server) await new Promise(resolve=>server.close(resolve));
  await pool.end();
});

test('sandbox exposes only health and webhook routes',async()=>{
  const health=await fetch(baseUrl+'/health');
  assert.equal(health.status,200);
  assert.deepEqual(await health.json(),{ok:true});
  for (const path of ['/','/api/auth/login','/api/auth/register','/api/creators/me/plans','/api/account/export','/api/posts/feed','/api/health-not-allowed']) {
    const response=await fetch(baseUrl+path);
    assert.equal(response.status,404,path);
    assert.deepEqual(await response.json(),{error:'Sandbox isolado'});
  }
});

test('unsigned payment webhook remains gated and cannot grant a membership',async()=>{
  const response=await fetch(baseUrl+'/api/payments/stripe/creators-webhook',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({id:'evt_sandboxNoAuth',type:'invoice.paid',data:{object:{id:'in_test'}}})
  });
  assert.ok([400,503].includes(response.status));
});
