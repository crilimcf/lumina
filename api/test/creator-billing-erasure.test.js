import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.STRIPE_SECRET_KEY = 'sk_test_gdpr_simulation_only';
const actualFetch = globalThis.fetch;
const stripeSubscriptionId = 'sub_luminaGdprErasure';
let blockStripe = true;
const requests = [];

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (!url.startsWith('https://api.stripe.com/v1/subscriptions/' + stripeSubscriptionId)) {
    return actualFetch(input,init);
  }
  requests.push(init.method);
  if (blockStripe) return new Response(JSON.stringify({error:{code:'api_connection_error'}}), {
    status:503,headers:{'content-type':'application/json'},
  });
  if (init.method === 'GET') return new Response(JSON.stringify({id:stripeSubscriptionId,status:'active'}),{
    status:200,headers:{'content-type':'application/json'},
  });
  if (init.method === 'DELETE') return new Response(JSON.stringify({id:stripeSubscriptionId,status:'canceled'}),{
    status:200,headers:{'content-type':'application/json'},
  });
  throw new Error('unexpected Stripe method');
};

const [{ migrate, q, pool }, { runAccountDeletions }] = await Promise.all([
  import('../src/db.js'),
  import('../src/jobs/daily.js'),
]);

let creator, subscriber, planId, checkoutId;
before(async () => {
  await migrate();
  const suffix = randomUUID().replaceAll('-','').slice(0,10);
  const {rows:people}=await q(
    "INSERT INTO users(handle,email,name,password_hash) VALUES($1,$2,'Test Billing Erasure','test-hash'),($3,$4,'Test Billing Subscriber','test-hash') RETURNING id",
    ['ce'+suffix,'ce'+suffix+'@example.test','se'+suffix,'se'+suffix+'@example.test']
  );
  [creator,subscriber]=people;
  const {rows:plans}=await q(
    "INSERT INTO creator_plans(creator_id,title,price_cents,billing_period,status) VALUES ($1,'RGPD creator test',500,'month','published') RETURNING id",
    [creator.id]
  );
  planId=plans[0].id;
  await q("INSERT INTO creator_billing_accounts(creator_id,stripe_account_id) VALUES($1,'acct_luminaGdprErasure')", [creator.id]);
  await q("INSERT INTO creator_billing_customers(subscriber_id,stripe_customer_id) VALUES($1,'cus_luminaGdprErasure')", [subscriber.id]);
  await q(
    "INSERT INTO creator_memberships(creator_id,subscriber_id,plan_id,provider,provider_subscription_id,status,current_period_end) VALUES ($1,$2,$3,'stripe',$4,'active',now()+interval '1 month')",
    [creator.id,subscriber.id,planId,stripeSubscriptionId]
  );
  await q(
    "INSERT INTO creator_billing_incidents(event_id,provider_subscription_id,invoice_id,charge_id,reason,creator_id,subscriber_id) VALUES ('evt_luminaGdprErasure',$1,'in_luminaGdprErasure','ch_luminaGdprErasure','refund',$2,$3)",
    [stripeSubscriptionId,creator.id,subscriber.id]
  );
  checkoutId='cs_test_luminaGdprErasure';
  await q(
    "INSERT INTO creator_checkout_sessions(session_id,creator_id,subscriber_id,plan_id,checkout_url,expires_at,stripe_subscription_id,status) VALUES ($1,$2,$3,$4,$5,now()+interval '1 day',$6,'paid')",
    [checkoutId,creator.id,subscriber.id,planId,'https://checkout.stripe.com/c/pay/gdpr-test',stripeSubscriptionId]
  );
  await q("INSERT INTO deletion_requests(user_id,execute_at) VALUES ($1,now()-interval '1 hour')", [creator.id]);
});

after(async () => {
  globalThis.fetch = actualFetch;
  if (creator?.id) await q('DELETE FROM users WHERE id=$1',[creator.id]).catch(()=>{});
  if (subscriber?.id) await q('DELETE FROM users WHERE id=$1',[subscriber.id]).catch(()=>{});
  await pool.end();
});

test('Stripe failure never erases a charged account or loses deletion request', async () => {
  const result=await runAccountDeletions();
  assert.equal(result,0);
  assert.deepEqual(requests,['GET']);
  const {rows:people}=await q('SELECT id FROM users WHERE id=$1',[creator.id]);
  assert.equal(people.length,1);
  const {rows:pending}=await q('SELECT user_id FROM deletion_requests WHERE user_id=$1',[creator.id]);
  assert.equal(pending.length,1);
});

test('successful Stripe cancellation precedes cascaded RGPD erasure', async () => {
  blockStripe=false;
  const count=await runAccountDeletions();
  assert.equal(count,1);
  assert.deepEqual(requests.slice(-2),['GET','DELETE']);
  const {rows:people}=await q('SELECT id FROM users WHERE id=$1',[creator.id]);
  assert.equal(people.length,0);
  for (const [query,params] of [
    ['SELECT id FROM creator_plans WHERE id=$1',[planId]],
    ['SELECT id FROM creator_memberships WHERE creator_id=$1',[creator.id]],
    ['SELECT event_id FROM creator_billing_incidents WHERE provider_subscription_id=$1',[stripeSubscriptionId]],
    ['SELECT session_id FROM creator_checkout_sessions WHERE session_id=$1',[checkoutId]],
    ['SELECT creator_id FROM creator_billing_accounts WHERE creator_id=$1',[creator.id]],
  ]) {
    const {rows}=await q(query,params);
    assert.equal(rows.length,0,query);
  }
  const {rows:remainingSubscriber}=await q('SELECT id FROM users WHERE id=$1',[subscriber.id]);
  assert.equal(remainingSubscriber.length,1);
});
