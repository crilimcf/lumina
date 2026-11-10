/**
 * Explicitly one-off Stripe Connect smoke test against an isolated sandbox.
 * Run ONLY as a Railway pre-deploy task in lumina-creators-sandbox.
 * Uses the project's existing secret without ever printing it.
 */
import { q, pool } from '../src/db.js';
import { stripeCreatorsRequest } from '../src/lib/stripe-creators.js';
import { env } from '../src/env.js';

const sandboxOnly = process.env.LUMINA_SANDBOX === 'true' &&
  process.env.LUMINA_SANDBOX_STRIPE_ACCOUNT_ID === 'acct_1UaENzI3oNqs1r6L' &&
  env.FEATURE_SUBSCRIPTIONS === false &&
  env.CREATORS_LIVE_PAYMENTS_APPROVED === false &&
  env.STRIPE_SECRET_KEY?.startsWith('sk_test_') &&
  env.DATABASE_URL &&
  env.CREATORS_STRIPE_WEBHOOK_SECRET;

if (!sandboxOnly) {
  console.error('[sandbox-smoke] Refusing to run without isolated Lumina test-only settings');
  process.exit(2);
}

const testCreator = 'lumina.creator.qa';
const testSubscriber = 'lumina.member.qa';

async function stripeV2(method,path,body=null,idempotencyKey=null) {
  const headers={
    authorization:'Bearer '+env.STRIPE_SECRET_KEY,
    'stripe-version':'2026-07-29.preview',
    'content-type':'application/json',
  };
  if(idempotencyKey) headers['Idempotency-Key']=idempotencyKey;
  const res=await fetch('https://api.stripe.com/v2'+path,{
    method,headers,signal:AbortSignal.timeout(15000),
    ...(body?{body:JSON.stringify(body)}:{})
  });
  const data=await res.json().catch(()=>null);
  if(!res.ok || data?.error) {
    const safeMessage=String(data?.error?.message || '').slice(0,280)
      .replace(/(?:sk|rk|pk|whsec)_[A-Za-z0-9_]+/g,'[redacted]');
    console.error('[sandbox/v2] request failed',res.status,data?.error?.code||'unknown',safeMessage);
    throw new Error('Stripe Accounts v2 operation failed');
  }
  return data;
}

async function ensureUser(handle, email, name) {
  await q(`INSERT INTO users(handle,email,name,password_hash,birth_date)
    VALUES($1,$2,$3,'!sandbox-qa-no-password-login!',DATE '1990-01-01')
    ON CONFLICT(handle) DO NOTHING`, [handle,email,name]);
  const {rows}=await q('SELECT id,handle FROM users WHERE handle=$1',[handle]);
  if(!rows[0]) throw new Error('Sandbox user not created');
  return rows[0];
}

try {
  const platform = await stripeCreatorsRequest('GET','/account');
  if(platform.id !== process.env.LUMINA_SANDBOX_STRIPE_ACCOUNT_ID || platform.livemode) {
    throw new Error('Wrong Stripe account or livemode');
  }
  const creator=await ensureUser(testCreator,'creator-lumina-sandbox@example.invalid','Criador QA Lumina');
  await ensureUser(testSubscriber,'member-lumina-sandbox@example.invalid','Membro QA Lumina');

  let {rows: accounts}=await q('SELECT stripe_account_id FROM creator_billing_accounts WHERE creator_id=$1',[creator.id]);
  let connectedId=accounts[0]?.stripe_account_id;
  if(!connectedId) {
    const connect=await stripeV2('POST','/core/accounts',{
      contact_email:'creator-lumina-sandbox@example.invalid',
      display_name:'Lumina QA Criador',
      identity:{country:'PT'},
      dashboard:'express',
      defaults:{responsibilities:{fees_collector:'application',losses_collector:'application'}},
      configuration:{recipient:{capabilities:{stripe_balance:{stripe_transfers:{requested:true}}}}},
      metadata:{lumina_creator_id:creator.id,lumina_test:'true'},
      include:['configuration.recipient','requirements','identity','defaults'],
    },'lumina-connect-v2-sandbox-creator-'+creator.id);
    if(!/^acct_[A-Za-z0-9]+$/.test(connect?.id||'')) throw new Error('Invalid Stripe connected account response');
    connectedId=connect.id;
    await q(`INSERT INTO creator_billing_accounts
      (creator_id,stripe_account_id,country,charges_enabled,payouts_enabled,details_submitted)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(creator_id) DO NOTHING`,
      [creator.id,connect.id,connect.country||'PT',!!connect.charges_enabled,
       !!connect.payouts_enabled,!!connect.details_submitted]);
  }
  const connect=await stripeCreatorsRequest('GET','/accounts/'+connectedId);
  if(connect.livemode) throw new Error('Unexpected real connected account');

  await q(`INSERT INTO creator_plans(creator_id,title,description,price_cents,billing_period,status)
    SELECT $1,'Lumina Criador de Testes','Plano ficticio, sem pagamentos reais',499,'month','draft'
    WHERE NOT EXISTS(SELECT 1 FROM creator_plans WHERE creator_id=$1 AND billing_period='month' AND status IN ('draft','published'))`,[creator.id]);

  const onboarding=await stripeV2('POST','/core/account_links',{
    account:connectedId,
    use_case:{type:'account_onboarding',account_onboarding:{
      configurations:['recipient'],
      refresh_url:'https://lumina-snowy-ten.vercel.app/?creators=onboarding',
      return_url:'https://lumina-snowy-ten.vercel.app/?creators=onboarded',
    }},
  });
  const onboardingHost=new URL(onboarding.url).hostname;
  if(!onboardingHost.endsWith('.stripe.com')) throw new Error('Invalid Stripe onboarding URL host');
  console.log('[sandbox-smoke] Stripe Accounts v2 onboarding link generated:',onboardingHost);
  // A single-use link contains an access token: do not output it into logs.

  console.log('[sandbox-smoke] Stripe and PostgreSQL verified');
  console.log('[sandbox-smoke] creator sandbox account:',connectedId);
  console.log('[sandbox-smoke] Stripe Connect test onboarding state:',
    JSON.stringify({charges:!!connect.charges_enabled,payouts:!!connect.payouts_enabled,
      submitted:!!connect.details_submitted,transferCapability:connect.capabilities?.transfers||'unknown',
      requiredFields:connect.requirements?.currently_due||[]}));
  console.log('[sandbox-smoke] No test charge or real payment was created');
} catch(error) {
  console.error('[sandbox-smoke] failed:',error.message);
  process.exitCode=1;
} finally {
  await pool.end();
}
