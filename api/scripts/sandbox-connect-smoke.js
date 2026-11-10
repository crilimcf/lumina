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
    const connect=await stripeCreatorsRequest('POST','/accounts',{
      type:'express',
      country:'PT',
      email:'creator-lumina-sandbox@example.invalid',
      'capabilities[transfers][requested]':'true',
      'metadata[lumina_creator_id]':creator.id,
      'metadata[lumina_test]':'true',
    },'lumina-connect-sandbox-creator-'+creator.id);
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
    VALUES($1,'Lumina Criador de Testes','Plano ficticio, sem pagamentos reais',499,'month','draft')
    ON CONFLICT DO NOTHING`,[creator.id]);

  console.log('[sandbox-smoke] Stripe and PostgreSQL verified');
  console.log('[sandbox-smoke] creator sandbox account:',connectedId);
  console.log('[sandbox-smoke] Express onboarding state:',
    JSON.stringify({charges:!!connect.charges_enabled,payouts:!!connect.payouts_enabled,
      details:!!connect.details_submitted,currently_due:connect.requirements?.currently_due||[]}));
  console.log('[sandbox-smoke] No test charge or real payment was created');
} catch(error) {
  console.error('[sandbox-smoke] failed:',error.message);
  process.exitCode=1;
} finally {
  await pool.end();
}
