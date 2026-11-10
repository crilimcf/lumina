import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

process.env.NODE_ENV='test';
delete process.env.LUMINA_SANDBOX;
process.env.FEATURE_CREATORS='true';
process.env.FEATURE_SUBSCRIPTIONS='false';
process.env.STRIPE_SECRET_KEY='sk_test_creator_v2_ci_fake';
process.env.CREATORS_STRIPE_WEBHOOK_SECRET='whsec_creator_v2_ci_fake';
process.env.CREATORS_PLATFORM_FEE_PERCENT='10';
process.env.JWT_SECRET||='ci-only-creator-v2-jwt-key';
process.env.DATABASE_URL||='postgresql://test:test@localhost:5432/lumina_test';

const fetchReal=globalThis.fetch;
const connectedId='acct_creatorV2CI0123';
let createCalls=0,linkCalls=0,getCalls=0;
globalThis.fetch=async(input,options={})=>{
  const uri=String(input);
  if(!uri.startsWith('https://api.stripe.com/')) return fetchReal(input,options);
  const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
  if(uri==='https://api.stripe.com/v2/core/accounts' && options.method==='POST'){
    createCalls++;
    assert.equal(options.headers['Stripe-Version'],'2026-07-29.preview');
    assert.match(options.headers.authorization,/^Bearer sk_test_/);
    const data=JSON.parse(options.body);
    assert.equal(data.dashboard,'express');
    assert.equal(data.identity.country,'PT');
    assert.equal(data.defaults.responsibilities.fees_collector,'application');
    assert.equal(data.defaults.responsibilities.losses_collector,'application');
    assert.equal(data.configuration.recipient.capabilities.stripe_balance.stripe_transfers.requested,true);
    assert.match(data.metadata.lumina_creator_id,/^[0-9a-f-]{36}$/);
    return respond({id:connectedId,object:'v2.core.account',identity:{country:'PT'},livemode:false});
  }
  if(uri==='https://api.stripe.com/v2/core/account_links' && options.method==='POST'){
    linkCalls++;
    const data=JSON.parse(options.body);
    assert.equal(data.account,connectedId);
    assert.equal(data.use_case.type,'account_onboarding');
    assert.deepEqual(data.use_case.account_onboarding.configurations,['recipient']);
    assert.match(data.use_case.account_onboarding.return_url,/creators=onboarded/);
    return respond({id:'link_creatorV2CI0123',url:'https://connect.stripe.com/setup/c/lumina-ci-only'});
  }
  if(uri==='https://api.stripe.com/v1/accounts/'+connectedId && options.method==='GET'){
    getCalls++;
    return respond({id:connectedId,charges_enabled:false,payouts_enabled:false,
      details_submitted:false,requirements:{currently_due:['external_account']}});
  }
  return respond({error:{code:'unexpected_stripe_api',message:'Unexpected call'}},400);
};

const [{default:app},{migrate,q,pool},{signToken}]=await Promise.all([
  import('../src/server.js'),import('../src/db.js'),import('../src/middleware/auth.js')
]);
let server,creator,baseUrl;

before(async()=>{
  await migrate();
  const suffix=randomUUID().replaceAll('-','').slice(0,12);
  const {rows}=await q("INSERT INTO users(handle,email,name,password_hash,birth_date) VALUES($1,$2,'Criador de Testes','!ci-only!',DATE '1990-01-01') RETURNING id,handle,session_version",
    ['v2'+suffix,'v2'+suffix+'@example.invalid']);
  creator=rows[0];
  server=app.listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  baseUrl='http://127.0.0.1:'+server.address().port;
});
after(async()=>{
  if(server) await new Promise(resolve=>server.close(resolve));
  if(creator) await q('DELETE FROM users WHERE id=$1',[creator.id]);
  await pool.end();
  globalThis.fetch=fetchReal;
});
const request=async(path,{method='GET',body}={})=>{
  const response=await fetchReal(baseUrl+path,{method,
    headers:{authorization:'Bearer '+signToken(creator),
      ...(body?{'content-type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json()};
};

test('Stripe onboarding is available while subscription sales are suspended',async()=>{
  const response=await request('/api/creators/me/billing/status');
  assert.equal(response.status,200,JSON.stringify(response.body));
  assert.equal(response.body.available,true);
  assert.equal(response.body.enabled,false);
});

test('new creator onboarding uses Accounts v2 and links exactly one recipient',async()=>{
  const a=await request('/api/creators/me/billing/onboard',{method:'POST'});
  assert.equal(a.status,200,JSON.stringify(a.body));
  assert.equal(a.body.url,'https://connect.stripe.com/setup/c/lumina-ci-only');
  assert.equal(createCalls,1);
  assert.equal(linkCalls,1);
  const {rows}=await q('SELECT stripe_account_id FROM creator_billing_accounts WHERE creator_id=$1',[creator.id]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].stripe_account_id,connectedId);
  const again=await request('/api/creators/me/billing/onboard',{method:'POST'});
  assert.equal(again.status,200);
  assert.equal(createCalls,1,'avoid duplicate Stripe recipient accounts');
  assert.equal(linkCalls,2,'account links are single use');

  const refresh=await request('/api/creators/me/billing/refresh',{method:'POST'});
  assert.equal(refresh.status,200);
  assert.equal(refresh.body.linked,true);
  assert.equal(refresh.body.chargesEnabled,false);
  assert.equal(refresh.body.payoutsEnabled,false);
  assert.equal(getCalls,1);
});
