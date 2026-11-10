import test from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../src/env.js';
import { creatorStripeKeyMatchesEnvironment, creatorBillingConfigured, creatorCheckoutEnabled,
  creatorWebhookEnabled } from '../src/lib/stripe-creators.js';

test('Stripe credentials are scoped to the correct environment and do not bypass sales approval', () => {
  const keys=['STRIPE_SECRET_KEY','CREATORS_STRIPE_WEBHOOK_SECRET','CREATORS_LIVE_PAYMENTS_APPROVED',
    'CREATORS_PLATFORM_FEE_PERCENT','FEATURE_CREATORS','FEATURE_SUBSCRIPTIONS','NODE_ENV'];
  const saved=Object.fromEntries(keys.map(k=>[k,env[k]]));
  const originalSandbox=process.env.LUMINA_SANDBOX;
  try {
    env.NODE_ENV='production';
    env.CREATORS_STRIPE_WEBHOOK_SECRET='whsec_local_test_fixture';
    env.CREATORS_PLATFORM_FEE_PERCENT=10;
    env.FEATURE_CREATORS=true;
    env.FEATURE_SUBSCRIPTIONS=true;
    env.CREATORS_LIVE_PAYMENTS_APPROVED=false;

    process.env.LUMINA_SANDBOX='true';
    env.STRIPE_SECRET_KEY='sk_live_should_not_work_in_sandbox';
    assert.equal(creatorStripeKeyMatchesEnvironment(),false);
    assert.equal(creatorWebhookEnabled(),false);
    assert.equal(creatorCheckoutEnabled(),false);

    env.STRIPE_SECRET_KEY='sk_test_sandbox_fixture';
    assert.equal(creatorStripeKeyMatchesEnvironment(),true);
    assert.equal(creatorWebhookEnabled(),true);
    assert.equal(creatorBillingConfigured(),true);
    assert.equal(creatorCheckoutEnabled(),true);

    delete process.env.LUMINA_SANDBOX;
    assert.equal(creatorStripeKeyMatchesEnvironment(),false);
    assert.equal(creatorWebhookEnabled(),false);
    assert.equal(creatorCheckoutEnabled(),false);

    env.STRIPE_SECRET_KEY='sk_live_production_fixture';
    assert.equal(creatorStripeKeyMatchesEnvironment(),true);
    assert.equal(creatorWebhookEnabled(),true, 'financial webhooks remain enabled when new sales are paused');
    assert.equal(creatorCheckoutEnabled(),false, 'explicit commercial approval required for live sales');

    env.CREATORS_LIVE_PAYMENTS_APPROVED=true;
    assert.equal(creatorCheckoutEnabled(),true);

    env.NODE_ENV='test';
    assert.equal(creatorStripeKeyMatchesEnvironment(),false, 'live key is never allowed in local test runs');
    env.STRIPE_SECRET_KEY='sk_test_local_fixture';
    assert.equal(creatorStripeKeyMatchesEnvironment(),true);
  } finally {
    keys.forEach(k=>{env[k]=saved[k];});
    if(originalSandbox===undefined) delete process.env.LUMINA_SANDBOX;
    else process.env.LUMINA_SANDBOX=originalSandbox;
  }
});
