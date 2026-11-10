import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/lumina_test';
process.env.JWT_SECRET ||= 'test-jwt-secret-only-for-unit-tests';

const { verifyCreatorStripeEvent, stripeCreatorSubscriptionState, creatorCheckoutEnabled } =
  await import('../src/lib/stripe-creators.js');

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
