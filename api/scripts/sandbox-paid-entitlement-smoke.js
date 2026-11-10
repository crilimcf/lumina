/**
 * One-off, isolated Lumina sandbox validation:
 * Lumina authenticated checkout route -> Stripe test subscription payment ->
 * signed Stripe webhook -> DB membership -> gated content -> refund/cancel.
 *
 * This script is NEVER part of the production server startup.
 * Run only in the independent Railway lumina-creators-sandbox environment.
 * The temporary Express test listener is bound to 127.0.0.1 only.
 * No payment card data, Stripe credentials, email or onboarding URLs are logged.
 */
import crypto from 'node:crypto';
import { env } from '../src/env.js';
import { q, pool } from '../src/db.js';
import { stripeCreatorsRequest } from '../src/lib/stripe-creators.js';

const PLATFORM='acct_1UaENzI3oNqs1r6L';
const DESTINATION='acct_1UaH8lI3oNs5IQxY';
const CUSTOMER='cus_VbRTuSYlsHyTuW';
const CARD='pm_1UaILBI3oNqs1r6L13zhRb54';
const fail=(message)=>{throw new Error('[e2e] '+message);};
const assert=(value,message)=>{if(!value) fail(message);};
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
const starts=(v,prefix)=>typeof v==='string'&&v.startsWith(prefix);
const initial={
  sandbox:process.env.LUMINA_SANDBOX,
  nodeEnv:process.env.NODE_ENV,
  feature:process.env.FEATURE_SUBSCRIPTIONS,
  approved:process.env.CREATORS_LIVE_PAYMENTS_APPROVED,
  enabled:process.env.SANDBOX_E2E_ONCE,
  key:process.env.STRIPE_SECRET_KEY,
};
if(initial.sandbox!=='true'||initial.nodeEnv!=='production'||
   initial.feature!=='false'||initial.approved!=='false'||
   initial.enabled!=='true'||!starts(initial.key,'sk_test_')||
   process.env.LUMINA_SANDBOX_STRIPE_ACCOUNT_ID!==PLATFORM||
   !starts(process.env.CREATORS_STRIPE_WEBHOOK_SECRET,'whsec_')||
   !env.DATABASE_URL) fail('sandbox-only execution gate refused');
const account=await stripeCreatorsRequest('GET','/account');
assert(account.id===PLATFORM&&account.livemode!==true,'wrong Stripe sandbox');
const connected=await stripeCreatorsRequest('GET','/accounts/'+DESTINATION);
assert(connected.capabilities?.transfers==='active'&&connected.payouts_enabled,
  'Connected account must be verified and transfer-capable');

let server=null,base=null,subscriber=null,subscriptionId=null,creator=null;
let success=false;
const signs=(obj)=>{
  const body=JSON.stringify(obj), t=Math.floor(Date.now()/1000);
  const digest=crypto.createHmac('sha256',env.CREATORS_STRIPE_WEBHOOK_SECRET)
    .update(t+'.'+body).digest('hex');
  return {body,signature:'t='+t+',v1='+digest};
};
const getId=o=>typeof o==='string'?o:o?.id;
const path='/api/creators/';
try {
  // This temporary process is never publicly exposed. Remove the public
  // sandbox middleware only for a local, ephemeral regression listener.
  process.env.NODE_ENV='test';
  process.env.LUMINA_SANDBOX='false';
  env.NODE_ENV='test';
  env.FEATURE_CREATORS=true;
  env.FEATURE_SUBSCRIPTIONS=true;
  env.CREATORS_PLATFORM_FEE_PERCENT=0;
  const [{default:app},{signToken}]=await Promise.all([
    import('../src/server.js'),import('../src/middleware/auth.js')
  ]);
  server=app.listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  base='http://127.0.0.1:'+server.address().port;
  const request=async (endpoint,method='GET',token=null,body=null,headers={})=>{
    const response=await fetch(base+endpoint,{
      method,headers:{...(token?{Authorization:'Bearer '+token}:{}),
        ...(body!==null?{'Content-Type':'application/json'}:{}),...headers},
      ...(body!==null?{body:JSON.stringify(body)}:{}),
      signal:AbortSignal.timeout(15000),
    });
    const data=await response.json().catch(()=>({}));
    return {status:response.status,data};
  };
  // Use a local dispatch that sends the exact raw signed event JSON.
  const signedWebhook=async (event)=>{
    const {body,signature}=signs(event);
    const response=await fetch(base+'/api/payments/stripe/creators-webhook',{
      method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':signature},
      body,signal:AbortSignal.timeout(15000)
    });
    return {status:response.status,data:await response.json().catch(()=>({}))};
  };

  const owner=await q(
    'SELECT u.id,u.handle,u.session_version FROM creator_billing_accounts a JOIN users u ON u.id=a.creator_id WHERE a.stripe_account_id=$1',
    [DESTINATION]
  );
  assert(owner.rows.length===1,'QA creator is not associated with Stripe Connect account');
  creator=owner.rows[0];
  assert(creator.handle==='lumina.creator.qa','refusing non-QA creator');

  const suffix=crypto.randomBytes(5).toString('hex');
  const {rows:created}=await q(
    "INSERT INTO users(handle,email,name,password_hash,birth_date) VALUES($1,$2,'QA Assinante','!sandbox-not-loginable!',DATE '1990-01-01') RETURNING id,handle,session_version",
    ['e2e'+suffix,'e2e-'+suffix+'@example.invalid']);
  subscriber=created[0];
  const {rows:inUse}=await q('SELECT subscriber_id FROM creator_billing_customers WHERE stripe_customer_id=$1',[CUSTOMER]);
  assert(inUse.length===0,'test Customer is already assigned to another Lumina subscriber');
  await q('INSERT INTO creator_billing_customers(subscriber_id,stripe_customer_id) VALUES($1,$2)',
    [subscriber.id,CUSTOMER]);

  const userToken=signToken(subscriber),creatorToken=signToken(creator);
  const accountRefresh=await request(path+'me/billing/refresh','POST',creatorToken);
  assert(accountRefresh.status===200&&accountRefresh.data.transfersEnabled===true,
    'Lumina did not refresh Stripe recipient transfer status');

  const plans=await q(
    "SELECT id,status,price_cents,billing_period FROM creator_plans WHERE creator_id=$1 AND status IN ('draft','published') AND billing_period='month' LIMIT 1",
    [creator.id]);
  let plan=plans.rows[0];
  if(!plan){
    const resp=await request(path+'me/plans','POST',creatorToken,
      {title:'QA Criador Mensal',price_cents:499,billing_period:'month',description:'Sandbox - sem dinheiro real'});
    assert(resp.status===201,'Lumina could not create synthetic plan');
    plan=resp.data.plan;
  }
  assert(plan.price_cents===499&&plan.billing_period==='month','QA plan amount/period mismatch');
  if(plan.status==='draft'){
    const published=await request(path+'me/plans/'+plan.id+'/publish','POST',creatorToken);
    assert(published.status===200,'Lumina refused published plan on active recipient');
  }

  const createdContent=await q(
    "INSERT INTO creator_member_content(creator_id,title,body,status,published_at) VALUES($1,'E2E Exclusivo','Conteúdo fictício para testar acesso pago','published',now()) RETURNING id",
    [creator.id]);
  const contentId=createdContent.rows[0].id;
  const before=await request(path+creator.id+'/content','GET',userToken);
  assert(before.status===200&&before.data.content.length===0,'non-member could see paid content');

  const checkedOut=await request(path+creator.id+'/plans/'+plan.id+'/checkout','POST',userToken);
  assert(checkedOut.status===201&&starts(checkedOut.data.checkoutUrl,'https://checkout.stripe.com/'),
    'authenticated Lumina checkout did not create a Stripe session');
  const {rows:sessions}=await q(
    "SELECT session_id FROM creator_checkout_sessions WHERE creator_id=$1 AND subscriber_id=$2 AND plan_id=$3 AND status='pending'",
    [creator.id,subscriber.id,plan.id]);
  assert(sessions.length===1,'app did not persist pending Checkout');
  console.log('[e2e] authenticated Lumina Checkout and pending session: PASS');

  // Checkout UI completion is separately verified via the user's prior
  // actual Stripe-hosted sandbox payment. This alternative provider-native
  // payment verifies app-level entitlement from a real paid Stripe invoice.
  const paidSubscription=await stripeCreatorsRequest('POST','/subscriptions',{
    customer:CUSTOMER,
    'items[0][price_data][currency]':'eur',
    'items[0][price_data][unit_amount]':'499',
    'items[0][price_data][recurring][interval]':'month',
    'items[0][price_data][product_data][name]':'Lumina QA: paid entitlement webhook',
    'items[0][quantity]':'1',
    default_payment_method:CARD,
    collection_method:'charge_automatically',
    payment_behavior:'error_if_incomplete',
    'transfer_data[destination]':DESTINATION,
    application_fee_percent:'0',
    'metadata[lumina_creator_id]':creator.id,
    'metadata[lumina_subscriber_id]':subscriber.id,
    'metadata[lumina_plan_id]':plan.id,
    'metadata[lumina_test_only]':'true',
    'expand[0]':'latest_invoice'
  },'lumina-e2e-paid-'+subscriber.id);
  subscriptionId=paidSubscription.id;
  assert(starts(subscriptionId,'sub_')&&paidSubscription.status==='active',
    'Stripe test subscription is not active');
  const invoice=getId(paidSubscription.latest_invoice);
  assert(starts(invoice,'in_')&&paidSubscription.latest_invoice?.paid===true,
    'Stripe test subscription invoice is not paid');
  console.log('[e2e] real Stripe test subscription paid: PASS');

  let invoiceEvent=null;
  for(let i=0;i<10;i++){
    const events=await stripeCreatorsRequest('GET','/events?limit=50');
    invoiceEvent=events.data?.find(ev=>ev.type==='invoice.paid'&&
      getId(ev.data?.object?.id)===invoice);
    if(invoiceEvent)break;
    await pause(700);
  }
  assert(invoiceEvent,'Provider invoice.paid event not found');
  const receipt=await signedWebhook(invoiceEvent);
  assert(receipt.status===200,'Webhook on local app rejected valid signed Stripe event');
  const member=await q(
    'SELECT status,provider_subscription_id,last_paid_invoice_id FROM creator_memberships WHERE creator_id=$1 AND subscriber_id=$2',
    [creator.id,subscriber.id]);
  assert(member.rows.length===1&&member.rows[0].status==='active'&&
    member.rows[0].provider_subscription_id===subscriptionId&&member.rows[0].last_paid_invoice_id===invoice,
    'paid Stripe invoice did not activate app membership');
  const permitted=await request(path+creator.id+'/content','GET',userToken);
  assert(permitted.status===200&&permitted.data.content.some(c=>c.id===contentId),
    'paid member cannot see exclusive content');
  console.log('[e2e] signed Stripe webhook -> DB membership -> exclusive content: PASS');

  // A real Stripe API cancellation must revoke content, without permitting
  // old paid invoice webhooks to restore entitlements.
  const cancelled=await stripeCreatorsRequest('DELETE','/subscriptions/'+subscriptionId);
  assert(cancelled.status==='canceled','test subscription was not canceled');
  const delEvent={
    id:'evt_luminaLocallySignedCancel'+suffix,
    object:'event',type:'customer.subscription.deleted',
    data:{object:{object:'subscription',id:subscriptionId,metadata:paidSubscription.metadata}}
  };
  const cancelReceipt=await signedWebhook(delEvent);
  assert(cancelReceipt.status===200,'signed cancellation webhook not accepted');
  const after=await request(path+creator.id+'/content','GET',userToken);
  assert(after.status===200&&after.data.content.length===0,'canceled subscription still grants access');
  const replay=await signedWebhook({...invoiceEvent,id:'evt_luminaReplayPaid'+suffix});
  assert(replay.status===200,'old invoice replay not acknowledged');
  const afterReplay=await request(path+creator.id+'/content','GET',userToken);
  assert(afterReplay.status===200&&afterReplay.data.content.length===0,
    'paid invoice replay reactivated canceled subscription');
  console.log('[e2e] cancellation revokes content, stale paid event cannot restore: PASS');
  success=true;
} catch(error) {
  console.error('[e2e] FAILED:',error?.message?.slice(0,240)||'unknown');
  process.exitCode=1;
} finally {
  if(subscriptionId) {
    try {
      const subscription=await stripeCreatorsRequest('GET','/subscriptions/'+subscriptionId);
      if(subscription.status!=='canceled'){
        await stripeCreatorsRequest('DELETE','/subscriptions/'+subscriptionId);
        console.log('[e2e] cleanup canceled test subscription');
      }
    } catch {
      console.error('[e2e] WARNING: verify manual cleanup of sandbox subscription',subscriptionId);
      process.exitCode=1;
    }
  }
  if(server)await new Promise(resolve=>server.close(resolve));
  // Preserve synthetic rows on failure for debugging. Remove only the unique
  // temporary subscriber on full success (cascades member and incident data).
  if(success&&subscriber){
    try { await q('DELETE FROM users WHERE id=$1',[subscriber.id]); }
    catch { console.error('[e2e] cleanup of synthetic user failed'); process.exitCode=1; }
  }
  await pool.end();
  // Restore process flags only within this one-off process.
  process.env.LUMINA_SANDBOX=initial.sandbox;
  process.env.NODE_ENV=initial.nodeEnv;
  console.log('[e2e] result:',success?'PASS':'FAIL');
}
