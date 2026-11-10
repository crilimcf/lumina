import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto, { randomUUID } from 'node:crypto';

// Isolated in CI's test database, with Stripe's HTTPS API fully stubbed.
process.env.FEATURE_CREATORS = 'true';
process.env.FEATURE_SUBSCRIPTIONS = 'true';
process.env.STRIPE_SECRET_KEY = 'sk_test_lumina_stub_only';
process.env.CREATORS_STRIPE_WEBHOOK_SECRET = 'whsec_lumina_test_stub_only';
process.env.CREATORS_PLATFORM_FEE_PERCENT = '10';
const fetchReal = globalThis.fetch;

let stripeCheckoutCalls = 0;
let currentStatus = 'active';
let latestPaid = true;
const expiry = () => Math.floor(Date.now() / 1000) + 3600;
const checkoutId = 'cs_test_luminaABC123';
const subscriptionId = 'sub_luminaABC123';
const customerId = 'cus_luminaABC123';
const connectedId = 'acct_luminaABC123';
const invoiceId = 'in_luminaABC123';
let creator,subscriber,planId,contentId,server,baseUrl;

globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  if (!target.startsWith('https://api.stripe.com/v1/')) return fetchReal(url,options);
  const respond = (data,status=200) => new Response(JSON.stringify(data), {
    status, headers:{'content-type':'application/json'}
  });
  if (target.includes('/checkout/sessions') && options.method === 'POST') {
    stripeCheckoutCalls++;
    const fields = new URLSearchParams(options.body);
    assert.equal(fields.get('mode'), 'subscription');
    assert.equal(fields.get('line_items[0][price_data][unit_amount]'), '500');
    assert.equal(fields.get('subscription_data[transfer_data][destination]'), connectedId);
    return respond({ id:checkoutId,url:'https://checkout.stripe.com/c/pay/lumina-test',expires_at:expiry() });
  }
  if (target.includes('/invoices/' + invoiceId)) {
    return respond({id:invoiceId, object:'invoice', subscription:subscriptionId, customer:customerId});
  }
    if (target.includes('/subscriptions/' + subscriptionId)) {
    return respond({
      id:subscriptionId, object:'subscription',status:currentStatus,
      metadata:{lumina_creator_id:creator.id,lumina_subscriber_id:subscriber.id,lumina_plan_id:planId},
      customer:customerId,
      transfer_data:{destination:connectedId},
      items:{data:[{price:{unit_amount:500,currency:'eur',recurring:{interval:'month'}},current_period_end:expiry()}]},
      latest_invoice:{id:invoiceId,paid:latestPaid,status:latestPaid?'paid':'open'},
    });
  }
  return respond({ error:{code:'unmocked_stripe_request'} },400);
};

const [{ default:app }, { migrate,q,pool }, { signToken }] = await Promise.all([
  import('../src/server.js'),import('../src/db.js'),import('../src/middleware/auth.js')
]);

const request = async (path,{token,method='GET',body,headers={}}={}) => {
  const result = await fetchReal(baseUrl+path,{
    method, headers:{
      ...(token?{authorization:'Bearer '+token}:{}),
      ...(body!==undefined?{'content-type':'application/json'}:{}),
      ...headers,
    },
    ...(body!==undefined?{body:JSON.stringify(body)}:{}),
  });
  return {status:result.status,data:await result.json()};
};

const signEvent = payload => {
  const content = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now()/1000);
  const signature = crypto.createHmac('sha256',process.env.CREATORS_STRIPE_WEBHOOK_SECRET)
    .update(String(timestamp)+'.'+content).digest('hex');
  return {content, signature:'t='+timestamp+',v1='+signature};
};

before(async()=>{
  await migrate();
  const suffix=randomUUID().replaceAll('-','').slice(0,9);
  const {rows}=await q(
    "INSERT INTO users (handle,email,name,password_hash,birth_date) VALUES ($1,$2,'Criador','test-hash',DATE '1990-01-01'), ($3,$4,'Assinante','test-hash',DATE '1990-01-01') RETURNING id,handle,session_version",
    ['cb'+suffix,'creator'+suffix+'@example.test','sb'+suffix,'subscriber'+suffix+'@example.test']
  );
  [creator,subscriber]=rows;
  const {rows:plans}=await q(
    "INSERT INTO creator_plans (creator_id,title,price_cents,billing_period,status) VALUES($1,'Plano Lumina',500,'month','published') RETURNING id",
    [creator.id]);
  planId=plans[0].id;
  const {rows:contents}=await q(
    "INSERT INTO creator_member_content(creator_id,title,body,status,published_at) VALUES($1,'Exclusivo','Verificado pelo servidor','published',now()) RETURNING id",[creator.id]);
  contentId=contents[0].id;
  await q("INSERT INTO creator_billing_accounts (creator_id,stripe_account_id,charges_enabled,payouts_enabled,details_submitted) VALUES($1,$2,true,true,true)",[creator.id,connectedId]);
  await q("INSERT INTO creator_billing_customers(subscriber_id,stripe_customer_id) VALUES($1,$2)",[subscriber.id,customerId]);
  server=app.listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  baseUrl='http://127.0.0.1:'+server.address().port;
});

after(async()=>{
  if(server) await new Promise(resolve=>server.close(resolve));
  if(creator&&subscriber) await q('DELETE FROM users WHERE id=$1 OR id=$2',[creator.id,subscriber.id]);
  await pool.end();
  globalThis.fetch=fetchReal;
});

test('duplicate subscription attempts reuse one pending checkout without second charge',async()=>{
  const subscriberToken=signToken(subscriber);
  const path='/api/creators/'+creator.id+'/plans/'+planId+'/checkout';
  const first=await request(path,{token:subscriberToken,method:'POST'});
  const second=await request(path,{token:subscriberToken,method:'POST'});
  assert.equal(first.status,201);
  assert.equal(second.status,200);
  assert.equal(first.data.checkoutUrl,second.data.checkoutUrl);
  assert.equal(stripeCheckoutCalls,1);
  const {rows}=await q('SELECT COUNT(*)::int AS total FROM creator_checkout_sessions WHERE creator_id=$1 AND subscriber_id=$2',[creator.id,subscriber.id]);
  assert.equal(rows[0].total,1);
});

test('forged unsigned webhook never grants paid content',async()=>{
  const before=await request('/api/creators/'+creator.id+'/content',{token:signToken(subscriber)});
  assert.deepEqual(before.data.content,[]);
  const event={id:'evt_luminaUnsigned',type:'checkout.session.completed',data:{object:{object:'checkout.session',id:checkoutId,subscription:subscriptionId}}};
  const forged=await request('/api/payments/stripe/creators-webhook',{method:'POST',body:event});
  assert.equal(forged.status,400);
  const still=await request('/api/creators/'+creator.id+'/content',{token:signToken(subscriber)});
  assert.deepEqual(still.data.content,[]);
});

test('a valid paid Stripe invoice unlocks access exactly once',async()=>{
  const payload={id:'evt_luminaPaid123',type:'checkout.session.completed',
    data:{object:{object:'checkout.session',id:checkoutId,subscription:subscriptionId}}};
  const signed=signEvent(payload);
  const send=async()=>{const response=await fetchReal(baseUrl+'/api/payments/stripe/creators-webhook',{
    method:'POST',headers:{'content-type':'application/json','stripe-signature':signed.signature},
    body:signed.content});
    return {status:response.status,data:await response.json()};};
  assert.equal((await send()).status,200);
  assert.equal((await send()).status,200);
  const {rows}=await q('SELECT status,provider_subscription_id FROM creator_memberships WHERE creator_id=$1 AND subscriber_id=$2',
    [creator.id,subscriber.id]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].provider_subscription_id,subscriptionId);
  assert.equal(rows[0].status,'active');
  const result=await request('/api/creators/'+creator.id+'/content',{token:signToken(subscriber)});
  assert.ok(result.data.content.some(x=>x.id===contentId));
});

test('a refunded invoice revokes paid content and repeated subscription updates cannot restore it', async()=>{
  const refund={id:'evt_luminaRefund123',type:'charge.refunded',data:{object:{
    object:'charge',id:'ch_luminaRefund123',invoice:invoiceId,refunded:true,amount_refunded:500
  }}};
  const event = signEvent(refund);
  const response = await fetchReal(baseUrl+'/api/payments/stripe/creators-webhook',{
    method:'POST',headers:{'content-type':'application/json','stripe-signature':event.signature},
    body:event.content
  });
  assert.equal(response.status,200);
  const {rows:members}=await q('SELECT status,last_paid_invoice_id FROM creator_memberships WHERE creator_id=$1 AND subscriber_id=$2',
    [creator.id,subscriber.id]);
  assert.equal(members.length,1);
  assert.equal(members[0].status,'past_due');
  assert.equal(members[0].last_paid_invoice_id,invoiceId);

  const afterRefund=await request('/api/creators/'+creator.id+'/content',{token:signToken(subscriber)});
  assert.deepEqual(afterRefund.data.content,[]);

  const update={id:'evt_luminaRefundReplay123',type:'customer.subscription.updated',
    data:{object:{id:subscriptionId,object:'subscription',metadata:{
      lumina_creator_id:creator.id,lumina_subscriber_id:subscriber.id,lumina_plan_id:planId
    }}}};
  const signed=signEvent(update);
  const retry=await fetchReal(baseUrl+'/api/payments/stripe/creators-webhook',{
    method:'POST',headers:{'content-type':'application/json','stripe-signature':signed.signature},
    body:signed.content
  });
  assert.equal(retry.status,200);
  const {rows:after}=await q('SELECT status FROM creator_memberships WHERE creator_id=$1 AND subscriber_id=$2',
    [creator.id,subscriber.id]);
  assert.equal(after[0].status,'past_due');
  assert.deepEqual((await request('/api/creators/'+creator.id+'/content',{token:signToken(subscriber)})).data.content,[]);
});

test('Stripe cancellation revokes content access',async()=>{
  currentStatus='canceled';
  const payload={id:'evt_luminaCancelled123',type:'customer.subscription.deleted',
    data:{object:{id:subscriptionId,object:'subscription',metadata:{
      lumina_creator_id:creator.id,lumina_subscriber_id:subscriber.id,lumina_plan_id:planId
    }}}};
  const signed=signEvent(payload);
  const response=await fetchReal(baseUrl+'/api/payments/stripe/creators-webhook',{
    method:'POST',headers:{'content-type':'application/json','stripe-signature':signed.signature},body:signed.content});
  assert.equal(response.status,200);
  const visible=await request('/api/creators/'+creator.id+'/content',{token:signToken(subscriber)});
  assert.deepEqual(visible.data.content,[]);
});
