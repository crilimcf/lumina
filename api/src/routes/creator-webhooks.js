import { Router } from 'express';
import { tx } from '../db.js';
import { env } from '../env.js';
import { h, HttpError } from '../middleware/auth.js';
import { verifyCreatorStripeEvent, stripeCreatorsRequest, stripeCreatorSubscriptionState,
  creatorCheckoutEnabled } from '../lib/stripe-creators.js';

export const creatorWebhookRoutes = Router();
const uuid = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ''));
const subscriptionId = v => typeof v === 'string' && /^sub_[A-Za-z0-9]+$/.test(v);

const handled = new Set(['checkout.session.completed','checkout.session.async_payment_succeeded',
  'invoice.paid','invoice.payment_failed','customer.subscription.created','customer.subscription.updated',
  'customer.subscription.deleted']);

const getId = value => typeof value === 'string' ? value : value?.id;
const findSubscription = object => {
  if (subscriptionId(object?.subscription)) return object.subscription;
  if (subscriptionId(object?.parent?.subscription_details?.subscription)) return object.parent.subscription_details.subscription;
  if (subscriptionId(object?.id) && object.object === 'subscription') return object.id;
  return null;
};

async function reconcileSubscription(subId, checkoutSessionId = null) {
  if (!subscriptionId(subId)) return null;
  const subscription = await stripeCreatorsRequest('GET',
    '/subscriptions/' + subId + '?expand%5B%5D=latest_invoice');
  const meta = subscription.metadata || {};
  const creatorId = meta.lumina_creator_id;
  const subscriberId = meta.lumina_subscriber_id;
  const planId = meta.lumina_plan_id;
  if (![creatorId,subscriberId,planId].every(uuid)) return null;
  const row = await tx(async client => {
    const { rows } = await client.query(
      "SELECT p.price_cents,p.currency,p.billing_period,a.stripe_account_id,c.stripe_customer_id FROM creator_plans p JOIN creator_billing_accounts a ON a.creator_id=p.creator_id JOIN creator_billing_customers c ON c.subscriber_id=$2 WHERE p.id=$1 AND p.creator_id=$3",
      [planId,subscriberId,creatorId]);
    return rows[0] || null;
  });
  if (!row || row.stripe_account_id !== getId(subscription.transfer_data?.destination) ||
      row.stripe_customer_id !== getId(subscription.customer)) return null;
  const price = subscription.items?.data?.[0]?.price;
  if (!price || Number(price.unit_amount) !== Number(row.price_cents) ||
      price.currency !== 'eur' || price.recurring?.interval !== row.billing_period) return null;
  const {status, currentPeriodEnd} = stripeCreatorSubscriptionState(subscription);
  return {subId, creatorId, subscriberId, planId, status, currentPeriodEnd, checkoutSessionId};
}

creatorWebhookRoutes.post('/stripe/creators-webhook', h(async (req, res) => {
  if (!creatorCheckoutEnabled()) throw new HttpError(503, 'Subscrições indisponíveis', 'creator_payments_unavailable');
  const event = verifyCreatorStripeEvent(req.rawBody, req.headers['stripe-signature'],
    env.CREATORS_STRIPE_WEBHOOK_SECRET);
  const object = event.data?.object || {};
  if (!handled.has(event.type)) return res.json({received: true});

  const sessionId = object.object === 'checkout.session' ? object.id : null;
  let subId = findSubscription(object);
  if (sessionId && /^cs_[a-zA-Z0-9_]+$/.test(sessionId)) {
    subId = getId(object.subscription);
  }
  const state = subId ? await reconcileSubscription(subId, sessionId) : null;

  await tx(async client => {
    const { rowCount } = await client.query(
      'INSERT INTO creator_stripe_webhook_events(event_id,event_type) VALUES($1,$2) ON CONFLICT(event_id) DO NOTHING',
      [event.id,event.type]);
    if (!rowCount || !state) return;
    const {rows: checkouts} = await client.query(
      "SELECT session_id FROM creator_checkout_sessions WHERE creator_id=$1 AND subscriber_id=$2 AND plan_id=$3 AND (stripe_subscription_id IS NULL OR stripe_subscription_id=$4) AND ($5::text IS NULL OR session_id=$5) ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
      [state.creatorId,state.subscriberId,state.planId,state.subId,state.checkoutSessionId]);
    const session = checkouts[0];
    if (!session) return;
    await client.query(
      "UPDATE creator_checkout_sessions SET stripe_subscription_id=$2,status=$3,updated_at=now() WHERE session_id=$1",
      [session.session_id,state.subId,state.status === 'active' ? 'paid' : 'pending']);
    const {rows: existing} = await client.query(
      'SELECT id FROM creator_memberships WHERE provider_subscription_id=$1 FOR UPDATE',
      [state.subId]);
    if (existing[0]) {
      await client.query(
        'UPDATE creator_memberships SET status=$2,current_period_end=$3,updated_at=now() WHERE id=$1',
        [existing[0].id,state.status,state.currentPeriodEnd]);
    } else if (state.status === 'active') {
      const {rows: others} = await client.query(
        "SELECT id FROM creator_memberships WHERE creator_id=$1 AND subscriber_id=$2 AND status IN ('pending','active','past_due') FOR UPDATE",
        [state.creatorId,state.subscriberId]);
      if (!others[0]) {
        await client.query(
          "INSERT INTO creator_memberships(creator_id,subscriber_id,plan_id,provider,provider_subscription_id,status,current_period_end) VALUES($1,$2,$3,'stripe',$4,'active',$5)",
          [state.creatorId,state.subscriberId,state.planId,state.subId,state.currentPeriodEnd]);
      }
    }
  });
  res.json({received: true});
}));
