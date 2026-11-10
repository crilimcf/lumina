// Optional, read-only Stripe readiness probe. Never logs credentials or response bodies.
import { env } from '../env.js';

export async function checkCreatorStripePermissions(fetchImpl = fetch) {
  const key = env.STRIPE_SECRET_KEY;
  if (!/^rk_live_|^sk_live_/.test(key || '') || env.NODE_ENV !== 'production' ||
      process.env.LUMINA_SANDBOX === 'true') {
    console.log('[creators/stripe-probe] skipped: not a live production key');
    return [];
  }
  const endpoints = [
    ['account', '/v1/account'],
    ['customers-read', '/v1/customers?limit=1'],
    ['subscriptions-read', '/v1/subscriptions?limit=1'],
    ['connected-accounts-read', '/v1/accounts?limit=1'],
    ['billing-portal-read', '/v1/billing_portal/configurations/' +
      encodeURIComponent(env.CREATORS_STRIPE_PORTAL_CONFIGURATION || 'missing')],
  ];
  const results = [];
  for (const [name, path] of endpoints) {
    try {
      const response = await fetchImpl('https://api.stripe.com' + path, {
        method:'GET',
        headers:{authorization:'Bearer ' + key},
        signal:AbortSignal.timeout(10000),
      });
      results.push({name, status:response.status});
      console.log('[creators/stripe-probe]', name, 'HTTP', response.status);
    } catch {
      results.push({name,status:0});
      console.log('[creators/stripe-probe]', name, 'network-error');
    }
  }
  // A successful read does NOT establish write permissions for Checkout,
  // Customer creation, Connect v2 onboarding or subscriptions.
  console.log('[creators/stripe-probe] read-only checks completed; writes NOT tested');
  return results;
}

/**
 * Optional ONE-SHOT no-charge production smoke test.
 * Creates a clearly labeled test Customer, a Billing Portal session,
 * and deletes the test Customer. Never makes payments or subscriptions.
 * Enable only for the startup that performs the test.
 */
export async function checkCreatorStripeWritePermissions(fetchImpl=fetch) {
  const key=env.STRIPE_SECRET_KEY;
  if (env.NODE_ENV!=='production' || process.env.LUMINA_SANDBOX==='true' ||
      !/^rk_live_|^sk_live_/.test(key || '')) return {skipped:true};
  const headers={authorization:'Bearer '+key,
    'content-type':'application/x-www-form-urlencoded'};
  const logStatus=(name,status)=>console.log('[creators/stripe-write-probe]',name,'HTTP',status);
  let customerId=null;
  try {
    // Do not mutate a Stripe account merely because the restricted key is valid.
    // Verify that this key belongs to the intended Lumina production platform.
    const expected=env.CREATORS_STRIPE_EXPECTED_ACCOUNT_ID;
    if (!/^acct_[A-Za-z0-9]+$/.test(expected || '')) {
      console.log('[creators/stripe-write-probe] expected-account-not-configured');
      return {identityVerified:false};
    }
    const identity=await fetchImpl('https://api.stripe.com/v1/account',{
      method:'GET', headers:{authorization:'Bearer '+key},
      signal:AbortSignal.timeout(12000),
    });
    logStatus('account-identity-read',identity.status);
    const actual=await identity.json().catch(()=>null);
    if (!identity.ok || actual?.id!==expected || actual?.livemode===false) {
      console.log('[creators/stripe-write-probe] account-identity-mismatch');
      return {identityVerified:false};
    }
    console.log('[creators/stripe-write-probe] expected-account-verified');
    const create = await fetchImpl('https://api.stripe.com/v1/customers',{
      method:'POST',headers,
      body:new URLSearchParams({
        name:'LUMINA READINESS TEST - NO CHARGES',
        description:'Temporary no-charge key permission verification; not a real subscriber',
        'metadata[lumina_no_charge_probe]':'true',
      }).toString(),
      signal:AbortSignal.timeout(12000),
    });
    logStatus('customer-create',create.status);
    const created=await create.json().catch(()=>null);
    if(!create.ok || !/^cus_[A-Za-z0-9]+$/.test(created?.id||'')) return {customerCreate:create.status};
    customerId=created.id;
    if (/^bpc_[A-Za-z0-9]+$/.test(env.CREATORS_STRIPE_PORTAL_CONFIGURATION || '')) {
      const portal=await fetchImpl('https://api.stripe.com/v1/billing_portal/sessions',{
        method:'POST',headers,
        body:new URLSearchParams({customer:customerId,
          configuration:env.CREATORS_STRIPE_PORTAL_CONFIGURATION,
          return_url:env.APP_URL+'/?tab=profile'}).toString(),
        signal:AbortSignal.timeout(12000),
      });
      logStatus('portal-session-create',portal.status);
    }
    return {customerCreate:create.status,customerCleanUpPending:true};
  } catch {
    console.log('[creators/stripe-write-probe] network-error');
    return {networkError:true};
  } finally {
    if(customerId) {
      try {
        const clean=await fetchImpl('https://api.stripe.com/v1/customers/'+customerId,{
          method:'DELETE',headers:{authorization:'Bearer '+key},
          signal:AbortSignal.timeout(12000),
        });
        logStatus('customer-delete',clean.status);
      } catch {
        console.log('[creators/stripe-write-probe] customer-cleanup-network-error');
      }
    }
  }
}
