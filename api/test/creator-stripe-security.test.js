import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/lumina_test';
process.env.JWT_SECRET ||= 'test-jwt-secret-only-for-unit-tests';

const { verifyCreatorStripeEvent, stripeCreatorSubscriptionState, creatorCheckoutEnabled, creatorBillingConfigured } =
  await import('../src/lib/stripe-creators.js');
const { env } = await import('../src/env.js');

const sample = { id:'evt_test456', type:'invoice.paid', data:{ object:{ id:'in_test123' } } };
const secret = 'whsec_test_local_only';
const signed = (body, timestamp, secretValue = secret) => {
  const signature = crypto.createHmac('sha256', secretValue)
    .update(String(timestamp) + '.').update(body).digest('hex');
  return 't=' + timestamp + ',v1=' + signature;
};

test('Creator payments remain gated off with absent production configuration', () => {
  assert.equal(creatorCheckoutEnabled(), false);
});

test('live Stripe key cannot enable checkouts without explicit release approval', () => {
  const keys=['FEATURE_CREATORS','FEATURE_SUBSCRIPTIONS','STRIPE_SECRET_KEY','CREATORS_STRIPE_WEBHOOK_SECRET',
    'CREATORS_PLATFORM_FEE_PERCENT','CREATORS_LIVE_PAYMENTS_APPROVED','NODE_ENV'];
  const original=Object.fromEntries(keys.map(k=>[k,env[k]]));
  const priorSandbox=process.env.LUMINA_SANDBOX;
  try {
    delete process.env.LUMINA_SANDBOX;
    env.NODE_ENV='production';
    Object.assign(env,{
      FEATURE_CREATORS:true,FEATURE_SUBSCRIPTIONS:true,
      STRIPE_SECRET_KEY:'sk_live_unit_test_not_a_real_key',
      CREATORS_STRIPE_WEBHOOK_SECRET:'whsec_unit_test_not_a_real_secret',
      CREATORS_PLATFORM_FEE_PERCENT:10,
      CREATORS_LIVE_PAYMENTS_APPROVED:false
    });
    assert.equal(creatorBillingConfigured(),false);
    assert.equal(creatorCheckoutEnabled(),false);
    env.CREATORS_LIVE_PAYMENTS_APPROVED=true;
    assert.equal(creatorBillingConfigured(),true);
    assert.equal(creatorCheckoutEnabled(),true);
    env.STRIPE_SECRET_KEY='rk_live_unit_test_not_a_real_key';
    assert.equal(creatorCheckoutEnabled(),true, 'restricted production key is accepted');
    env.STRIPE_SECRET_KEY='sk_test_unit_test_not_a_real_key';
    env.CREATORS_LIVE_PAYMENTS_APPROVED=false;
    assert.equal(creatorCheckoutEnabled(),false, 'test keys cannot activate sales in production');
    process.env.LUMINA_SANDBOX='true';
    assert.equal(creatorCheckoutEnabled(),true, 'sandbox accepts only test-mode keys');
    env.STRIPE_SECRET_KEY='invalid_key_format';
    assert.equal(creatorCheckoutEnabled(),false);
  } finally {
    Object.assign(env,original);
    if(priorSandbox===undefined) delete process.env.LUMINA_SANDBOX;
    else process.env.LUMINA_SANDBOX=priorSandbox;
  }
});

test('Only an authentic, timely Stripe signed raw JSON event is accepted', () => {
  const body = Buffer.from(JSON.stringify(sample));
  const now = 1750000000;
  assert.equal(verifyCreatorStripeEvent(body, signed(body, now), secret, now).id, sample.id);
  assert.throws(() => verifyCreatorStripeEvent(Buffer.from(body.toString() + ' '), signed(body, now), secret, now));
  assert.throws(() => verifyCreatorStripeEvent(body, signed(body, now - 301), secret, now));
  assert.throws(() => verifyCreatorStripeEvent(body, signed(body, now, 'whsec_wrong'), secret, now));
  assert.throws(() => verifyCreatorStripeEvent(body, 't=not-a-number,v1=abc', secret, now));
});

test('A paid current Stripe subscription is the only state unlocking access', () => {
  const end = Math.floor(Date.now() / 1000) + 3600;
  const subscription = {
    status: 'active',
    items: { data: [{ current_period_end: end }] },
    latest_invoice: { paid:true, status:'paid' },
  };
  assert.equal(stripeCreatorSubscriptionState(subscription).status, 'active');
  assert.equal(stripeCreatorSubscriptionState({
    ...subscription, latest_invoice:{paid:false,status:'open'},
  }).status, 'past_due');
  assert.equal(stripeCreatorSubscriptionState({
    ...subscription,status:'canceled',
  }).status, 'expired');
  assert.equal(stripeCreatorSubscriptionState({
    ...subscription,items:{data:[{current_period_end:end-7200}]},
  }).status, 'expired');
});

test('modern Stripe Invoice status paid and zero amount_remaining unlocks access without legacy paid flag', () => {
  const end=Math.floor(Date.now()/1000)+3600;
  const subscription={
    status:'active',
    items:{data:[{current_period_end:end}]},
    latest_invoice:{
      id:'in_testModernPaid123',status:'paid',amount_paid:499,amount_remaining:0,
    },
  };
  assert.equal(stripeCreatorSubscriptionState(subscription).status,'active');
  assert.equal(stripeCreatorSubscriptionState({
    ...subscription,latest_invoice:{...subscription.latest_invoice,status:'open'},
  }).status,'past_due');
  assert.equal(stripeCreatorSubscriptionState({
    ...subscription,latest_invoice:{...subscription.latest_invoice,amount_remaining:499},
  }).status,'past_due');
  assert.equal(stripeCreatorSubscriptionState({
    ...subscription,latest_invoice:{...subscription.latest_invoice,amount_paid:0},
  }).status,'past_due');
});

test('Creators checkout enables Stripe Tax only on its own session, without changing global billing', async () => {
  const { readFile } = await import('node:fs/promises');
  const checkoutRoute = await readFile(new URL('../src/routes/creator-billing.js', import.meta.url), 'utf8');
  const start = checkoutRoute.indexOf("const session = await stripeCreatorsRequest('POST', '/checkout/sessions'");
  assert.ok(start !== -1, 'creator checkout session exists');
  const end = checkoutRoute.indexOf("'lumina-creators-checkout-'", start);
  assert.ok(end > start, 'creator-specific idempotency key exists');
  const body = checkoutRoute.slice(start, end);
  assert.ok(body.includes("\'automatic_tax[enabled]\': \'true\'"));
  assert.match(body, /billing_address_collection: 'required'/);
  assert.ok(body.includes("\'customer_update[address]\': \'auto\'"));
  assert.ok(body.includes("\'subscription_data[transfer_data][destination]\'"));
});

test('Creator billing portal requires an explicit dedicated Stripe configuration', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/routes/creator-billing.js', import.meta.url), 'utf8');
  assert.match(source, /configuration:env\.CREATORS_STRIPE_PORTAL_CONFIGURATION/);
  assert.match(source, /creator_billing_portal_unconfigured/);
});

test('live Stripe readiness probe is read-only and reports HTTP statuses without billing mutations', async () => {
  const { checkCreatorStripePermissions } = await import('../src/lib/creator-stripe-readiness.js');
  const previous = {key:env.STRIPE_SECRET_KEY,node:env.NODE_ENV,portal:env.CREATORS_STRIPE_PORTAL_CONFIGURATION};
  const previousSandbox = process.env.LUMINA_SANDBOX;
  const priorLog = console.log;
  const calls = [];
  const logs = [];
  try {
    delete process.env.LUMINA_SANDBOX;
    env.STRIPE_SECRET_KEY = 'rk_live_dummy_secret_only';
    env.NODE_ENV = 'production';
    env.CREATORS_STRIPE_PORTAL_CONFIGURATION = 'bpc_unitTest123';
    console.log = (...args) => logs.push(args.join(' '));
    const result = await checkCreatorStripePermissions(async (url, options) => {
      calls.push({url,method:options.method});
      return {status: url.includes('/v1/accounts?') ? 403 : 200};
    });
    assert.equal(result.length, 5);
    assert.ok(calls.every(call => call.method === 'GET'));
    assert.equal(result.find(row => row.name === 'connected-accounts-read').status,403);
    assert.ok(!logs.join(' ').includes('rk_live_dummy_secret_only'));
  } finally {
    env.STRIPE_SECRET_KEY=previous.key;
    env.NODE_ENV=previous.node;
    env.CREATORS_STRIPE_PORTAL_CONFIGURATION=previous.portal;
    console.log=priorLog;
    if(previousSandbox===undefined) delete process.env.LUMINA_SANDBOX;
    else process.env.LUMINA_SANDBOX=previousSandbox;
  }
});

test('live no-charge smoke test creates, visits portal, and removes only its own customer', async()=>{
  const {checkCreatorStripeWritePermissions}=await import('../src/lib/creator-stripe-readiness.js');
  const original={key:env.STRIPE_SECRET_KEY,node:env.NODE_ENV,portal:env.CREATORS_STRIPE_PORTAL_CONFIGURATION,app:env.APP_URL};
  const sandbox=process.env.LUMINA_SANDBOX;
  const oldLog=console.log;
  const calls=[];
  try {
    delete process.env.LUMINA_SANDBOX;
    env.STRIPE_SECRET_KEY='rk_live_test_not_a_real_secret';
    env.NODE_ENV='production';
    env.APP_URL='https://lumina.example';
    env.CREATORS_STRIPE_PORTAL_CONFIGURATION='bpc_testOnly';
    console.log=()=>{};
    const result=await checkCreatorStripeWritePermissions(async (url,options)=>{
      calls.push({url,method:options.method,body:options.body});
      if(url.endsWith('/customers') && options.method==='POST')
        return {ok:true,status:200,json:async()=>({id:'cus_Test123'})};
      if(url.includes('/billing_portal/sessions'))
        return {ok:true,status:200,json:async()=>({id:'bps_Test123'})};
      if(url.endsWith('/customers/cus_Test123') && options.method==='DELETE')
        return {ok:true,status:200,json:async()=>({deleted:true})};
      throw new Error('unexpected request');
    });
    assert.equal(result.customerCreate,200);
    assert.deepEqual(calls.map(x=>x.method),['POST','POST','DELETE']);
    assert.ok(!calls.some(x=>x.url.includes('checkout/sessions') || x.url.includes('subscriptions')));
    assert.equal(new URLSearchParams(calls[1].body).get('configuration'),'bpc_testOnly');
  } finally {
    Object.assign(env,{STRIPE_SECRET_KEY:original.key,NODE_ENV:original.node,
      CREATORS_STRIPE_PORTAL_CONFIGURATION:original.portal,APP_URL:original.app});
    console.log=oldLog;
    if(sandbox===undefined)delete process.env.LUMINA_SANDBOX;
    else process.env.LUMINA_SANDBOX=sandbox;
  }
});
