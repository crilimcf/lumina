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
